import type { ChatId, AiRunId } from '@gs-v2/shared';
import type {
  TurnRepository,
  TurnError,
  TurnIds,
  HumanTurn,
  ChatWithFirstTurn,
  AppendHumanTurnInput,
  CreateChatWithFirstTurnInput,
  AiRun,
  Message,
} from '@gs-v2/domain';
import type { Result } from '@gs-v2/domain';
import { ok, err } from '@gs-v2/domain';

const APPEND_TURN_MAX_ATTEMPTS = 3;

const ACTIVE_STATUSES = "('queued','admitted','generating','repairing')";

function queuedAiRun(ids: TurnIds, chatId: ChatId, stage: AiRun['stage'], now: string): AiRun {
  return {
    id: ids.aiRunId,
    chatId,
    triggerMessageId: ids.messageId,
    stage,
    status: 'queued',
    idempotencyKey: null,
    flueRunId: null,
    attemptCount: 0,
    promptTokens: 0,
    completionTokens: 0,
    resultHash: null,
    errorMessage: null,
    createdAt: now,
    updatedAt: now,
  };
}

function humanMessage(ids: TurnIds, chatId: ChatId, body: string, sequence: number, now: string): Message {
  return {
    id: ids.messageId,
    chatId,
    senderType: 'human',
    body,
    sequence,
    createdAt: now,
  };
}

type TurnFailureKind =
  | { kind: 'retry' }
  | { kind: 'sequence-conflict' }
  | { kind: 'in-flight' }
  | { kind: 'idempotency' }
  | { kind: 'chat-not-found' }
  | { kind: 'db-failure' };

function classifyBatchFailure(cause: unknown): TurnFailureKind {
  if (!(cause instanceof Error)) return { kind: 'db-failure' };
  const message = cause.message;
  if (message.includes('UNIQUE constraint failed')) {
    if (message.includes('messages.sequence')) return { kind: 'retry' };
    // 部分UNIQUE index uq_ai_runs_active_per_chat（1チャット1 in-flight run）への違反
    if (message.includes('ai_runs.chat_id') || message.includes('uq_ai_runs_active_per_chat')) {
      return { kind: 'in-flight' };
    }
    if (message.includes('ai_runs.idempotency_key')) return { kind: 'idempotency' };
    return { kind: 'db-failure' };
  }
  // append時のchat不存在はmessage 0行→ai_runsのFK違反として現れる
  if (message.includes('FOREIGN KEY constraint failed')) return { kind: 'chat-not-found' };
  return { kind: 'db-failure' };
}

export class D1TurnRepository implements TurnRepository {
  constructor(private readonly db: D1Database) {}

  async createChatWithFirstTurn(
    chatId: ChatId,
    ids: TurnIds,
    input: CreateChatWithFirstTurnInput,
  ): Promise<Result<ChatWithFirstTurn, TurnError>> {
    const now = new Date().toISOString();
    const eventId = crypto.randomUUID();
    try {
      await this.db.batch([
        this.db
          .prepare('INSERT INTO chats (id, member_id, title, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
          .bind(chatId, input.memberId, input.title, 'active', now, now),
        this.db
          .prepare('INSERT INTO messages (id, chat_id, sender_type, body, sequence, created_at) VALUES (?, ?, ?, ?, 1, ?)')
          .bind(ids.messageId, chatId, 'human', input.body, now),
        this.db
          .prepare(
            `INSERT INTO ai_runs (id, chat_id, trigger_message_id, stage, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, 'queued', ?, ?)`,
          )
          .bind(ids.aiRunId, chatId, ids.messageId, input.stage, now, now),
        this.db
          .prepare(
            `INSERT INTO ai_run_events (id, ai_run_id, event_type, sequence, data_json, created_at)
             VALUES (?, ?, 'queued', 1, ?, ?)`,
          )
          .bind(eventId, ids.aiRunId, JSON.stringify({ stage: input.stage }), now),
      ]);
    } catch {
      // 新規chatにsequence競合もin-flight runも存在しない。ここでの失敗は全てDB異常
      return err({ _tag: 'TurnDbFailure', operation: 'createChatWithFirstTurn' });
    }

    return ok({
      chat: {
        id: chatId,
        memberId: input.memberId,
        title: input.title,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
      humanMessage: humanMessage(ids, chatId, input.body, 1, now),
      aiRun: queuedAiRun(ids, chatId, input.stage, now),
    });
  }

  async appendHumanTurn(ids: TurnIds, input: AppendHumanTurnInput): Promise<Result<HumanTurn, TurnError>> {
    for (let attempt = 1; attempt <= APPEND_TURN_MAX_ATTEMPTS; attempt++) {
      const now = new Date().toISOString();
      const eventId = crypto.randomUUID();
      try {
        const [messageInsert] = await this.db.batch([
          // chats起点の採番: 不存在chatは0行のままINSERTされず、後続FK違反としてChatNotFoundに写像される
          this.db
            .prepare(
              `INSERT INTO messages (id, chat_id, sender_type, body, sequence, created_at)
               SELECT ?1, c.id, 'human', ?3, COALESCE((SELECT MAX(m.sequence) FROM messages m WHERE m.chat_id = c.id), 0) + 1, ?4
               FROM chats c WHERE c.id = ?2
               RETURNING sequence`,
            )
            .bind(ids.messageId, input.chatId, input.body, now),
          this.db
            .prepare(
              `INSERT INTO ai_runs (id, chat_id, trigger_message_id, stage, status, created_at, updated_at)
               VALUES (?, ?, ?, ?, 'queued', ?, ?)`,
            )
            .bind(ids.aiRunId, input.chatId, ids.messageId, input.stage, now, now),
          this.db
            .prepare(
              `INSERT INTO ai_run_events (id, ai_run_id, event_type, sequence, data_json, created_at)
               VALUES (?, ?, 'queued', 1, ?, ?)`,
            )
            .bind(eventId, ids.aiRunId, JSON.stringify({ stage: input.stage }), now),
        ]);

        const sequenceRow = messageInsert.results.at(0) as { sequence: number } | undefined;
        if (!sequenceRow) return err({ _tag: 'ChatNotFound', chatId: input.chatId });

        return ok({
          humanMessage: humanMessage(ids, input.chatId, input.body, sequenceRow.sequence, now),
          aiRun: queuedAiRun(ids, input.chatId, input.stage, now),
        });
      } catch (cause) {
        const failure = classifyBatchFailure(cause);
        switch (failure.kind) {
          case 'retry':
            if (attempt < APPEND_TURN_MAX_ATTEMPTS) continue;
            return err({ _tag: 'MessageSequenceConflict', chatId: input.chatId });
          case 'in-flight': {
            const activeRun = await this.findActiveRunId(input.chatId);
            // 直後にrunが終わっていたら競合は解消済みなので再試行
            if (activeRun === null) {
              if (attempt < APPEND_TURN_MAX_ATTEMPTS) continue;
              return err({ _tag: 'TurnDbFailure', operation: 'appendHumanTurn:in-flight-race' });
            }
            return err({ _tag: 'AiRunInFlight', chatId: input.chatId, aiRunId: activeRun });
          }
          case 'idempotency':
            return err({ _tag: 'AiRunConflict', reason: 'IdempotencyKey' });
          case 'chat-not-found':
            return err({ _tag: 'ChatNotFound', chatId: input.chatId });
          case 'sequence-conflict':
            return err({ _tag: 'MessageSequenceConflict', chatId: input.chatId });
          case 'db-failure':
            return err({ _tag: 'TurnDbFailure', operation: 'appendHumanTurn' });
          default:
            return failure satisfies never;
        }
      }
    }
    return err({ _tag: 'MessageSequenceConflict', chatId: input.chatId });
  }

  private async findActiveRunId(chatId: ChatId): Promise<AiRunId | null> {
    try {
      const row = await this.db
        .prepare(`SELECT id FROM ai_runs WHERE chat_id = ? AND status IN ${ACTIVE_STATUSES} LIMIT 1`)
        .bind(chatId)
        .first<{ id: string }>();
      return row ? (row.id as AiRunId) : null;
    } catch {
      return null;
    }
  }
}
