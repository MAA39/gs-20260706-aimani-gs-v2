import type { AiRunId, ChatId } from '@gs-v2/shared';
import type { AiRun, AiRunEvent, CompleteRunInput, Message } from '@gs-v2/domain';
import type { AiRunRepository, AiRunError } from '@gs-v2/domain';
import type { Result } from '@gs-v2/domain';
import { ok, err } from '@gs-v2/domain';

interface AiRunRow {
  id: string;
  chat_id: string;
  trigger_message_id: string;
  stage: string;
  status: string;
  idempotency_key: string | null;
  flue_run_id: string | null;
  attempt_count: number;
  prompt_tokens: number;
  completion_tokens: number;
  result_hash: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

interface AiRunEventRow {
  id: string;
  ai_run_id: string;
  event_type: string;
  sequence: number;
  data_json: string;
  created_at: string;
}

function rowToAiRun(row: AiRunRow): AiRun {
  return {
    id: row.id as AiRunId,
    chatId: row.chat_id as AiRun['chatId'],
    triggerMessageId: row.trigger_message_id as AiRun['triggerMessageId'],
    stage: row.stage as AiRun['stage'],
    status: row.status as AiRun['status'],
    idempotencyKey: row.idempotency_key,
    flueRunId: row.flue_run_id,
    attemptCount: row.attempt_count,
    promptTokens: row.prompt_tokens,
    completionTokens: row.completion_tokens,
    resultHash: row.result_hash,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToEvent(row: AiRunEventRow): AiRunEvent {
  return {
    id: row.id as AiRunEvent['id'],
    aiRunId: row.ai_run_id as AiRunEvent['aiRunId'],
    eventType: row.event_type,
    sequence: row.sequence,
    dataJson: row.data_json,
    createdAt: row.created_at,
  };
}

function isSequenceConflict(cause: unknown): boolean {
  return (
    cause instanceof Error &&
    cause.message.includes('UNIQUE constraint failed') &&
    (cause.message.includes('ai_run_events.sequence') || cause.message.includes('messages.sequence'))
  );
}

const TRANSITION_MAX_ATTEMPTS = 3;

export class D1AiRunRepository implements AiRunRepository {
  constructor(private readonly db: D1Database) {}

  async markAdmitted(id: AiRunId): Promise<Result<void, AiRunError>> {
    return this.transitionWithEvent(id, {
      fromStatuses: ['queued'],
      toStatus: 'admitted',
      eventData: {},
    });
  }

  async markGenerating(id: AiRunId, flueRunId: string): Promise<Result<void, AiRunError>> {
    return this.transitionWithEvent(id, {
      fromStatuses: ['admitted'],
      toStatus: 'generating',
      extraSetSql: 'flue_run_id = ?',
      extraSetBindings: [flueRunId],
      eventData: { flueRunId },
    });
  }

  async markRepairing(id: AiRunId): Promise<Result<void, AiRunError>> {
    return this.transitionWithEvent(id, {
      fromStatuses: ['generating'],
      toStatus: 'repairing',
      extraSetSql: 'attempt_count = attempt_count + 1',
      extraSetBindings: [],
      eventData: {},
    });
  }

  // AI応答messageの追加とcompleted遷移を同一トランザクションにする。
  // 片方だけ成立すると「返信は見えるのにrunがin-flightのまま」でchatが停止する（R3-03）
  async completeWithAiMessage(input: CompleteRunInput): Promise<Result<Message, AiRunError>> {
    for (let attempt = 1; attempt <= TRANSITION_MAX_ATTEMPTS; attempt++) {
      const now = new Date().toISOString();
      const eventId = crypto.randomUUID();
      try {
        const [messageInsert, statusUpdate] = await this.db.batch([
          this.db
            .prepare(
              `INSERT INTO messages (id, chat_id, sender_type, body, sequence, created_at)
               SELECT ?1, r.chat_id, 'ai', ?3, COALESCE((SELECT MAX(m.sequence) FROM messages m WHERE m.chat_id = r.chat_id), 0) + 1, ?4
               FROM ai_runs r WHERE r.id = ?2 AND r.status IN ('generating', 'repairing')
               RETURNING chat_id, sequence`,
            )
            .bind(input.aiMessageId, input.aiRunId, input.aiMessageBody, now),
          this.db
            .prepare(
              `UPDATE ai_runs
               SET status = 'completed', prompt_tokens = ?, completion_tokens = ?, result_hash = ?, updated_at = ?
               WHERE id = ? AND status IN ('generating', 'repairing')`,
            )
            .bind(input.promptTokens, input.completionTokens, input.resultHash, now, input.aiRunId),
          this.eventInsertStatement(eventId, input.aiRunId, 'completed', now, {
            resultMessageIds: [input.aiMessageId],
            promptTokens: input.promptTokens,
            completionTokens: input.completionTokens,
          }),
        ]);

        if (!statusUpdate.meta.changes) {
          return err({ _tag: 'InvalidAiRunTransition', aiRunId: input.aiRunId, from: '?', to: 'completed' });
        }
        const insertedRow = messageInsert.results.at(0) as { chat_id: string; sequence: number } | undefined;
        if (!insertedRow) {
          return err({ _tag: 'AiRunDbFailure', operation: 'completeWithAiMessage:message-missing' });
        }
        return ok({
          id: input.aiMessageId,
          chatId: insertedRow.chat_id as ChatId,
          senderType: 'ai',
          body: input.aiMessageBody,
          sequence: insertedRow.sequence,
          createdAt: now,
        });
      } catch (cause) {
        if (isSequenceConflict(cause) && attempt < TRANSITION_MAX_ATTEMPTS) continue;
        return err({ _tag: 'AiRunDbFailure', operation: 'completeWithAiMessage' });
      }
    }
    return err({ _tag: 'AiRunDbFailure', operation: 'completeWithAiMessage' });
  }

  // 失敗の事実（run状態・event・ユーザー向けsystemメッセージ）を同一トランザクションで残す
  async fail(id: AiRunId, errorMessage: string, userNotice: string): Promise<Result<void, AiRunError>> {
    const truncated = errorMessage.slice(0, 500);
    for (let attempt = 1; attempt <= TRANSITION_MAX_ATTEMPTS; attempt++) {
      const now = new Date().toISOString();
      const eventId = crypto.randomUUID();
      const noticeMessageId = crypto.randomUUID();
      try {
        const [, statusUpdate] = await this.db.batch([
          this.db
            .prepare(
              `INSERT INTO messages (id, chat_id, sender_type, body, sequence, created_at)
               SELECT ?1, r.chat_id, 'system', ?3, COALESCE((SELECT MAX(m.sequence) FROM messages m WHERE m.chat_id = r.chat_id), 0) + 1, ?4
               FROM ai_runs r WHERE r.id = ?2 AND r.status NOT IN ('completed', 'failed')`,
            )
            .bind(noticeMessageId, id, userNotice, now),
          this.db
            .prepare(
              `UPDATE ai_runs SET status = 'failed', error_message = ?, updated_at = ?
               WHERE id = ? AND status NOT IN ('completed', 'failed')`,
            )
            .bind(truncated, now, id),
          this.eventInsertStatement(eventId, id, 'failed', now, { errorMessage: truncated }),
        ]);

        if (!statusUpdate.meta.changes) {
          return err({ _tag: 'InvalidAiRunTransition', aiRunId: id, from: '?', to: 'failed' });
        }
        return ok(undefined);
      } catch (cause) {
        if (isSequenceConflict(cause) && attempt < TRANSITION_MAX_ATTEMPTS) continue;
        return err({ _tag: 'AiRunDbFailure', operation: 'fail' });
      }
    }
    return err({ _tag: 'AiRunDbFailure', operation: 'fail' });
  }

  async findById(id: AiRunId): Promise<Result<AiRun, AiRunError>> {
    try {
      const row = await this.db
        .prepare('SELECT * FROM ai_runs WHERE id = ?')
        .bind(id)
        .first<AiRunRow>();
      if (!row) return err({ _tag: 'AiRunNotFound', aiRunId: id });
      return ok(rowToAiRun(row));
    } catch {
      return err({ _tag: 'AiRunDbFailure', operation: 'findById' });
    }
  }

  async listEventsAfter(aiRunId: AiRunId, afterSequence: number): Promise<Result<readonly AiRunEvent[], AiRunError>> {
    try {
      const { results } = await this.db
        .prepare('SELECT * FROM ai_run_events WHERE ai_run_id = ? AND sequence > ? ORDER BY sequence ASC')
        .bind(aiRunId, afterSequence)
        .all<AiRunEventRow>();
      return ok(results.map(rowToEvent));
    } catch {
      return err({ _tag: 'AiRunDbFailure', operation: 'listEventsAfter' });
    }
  }

  // 遷移が同一batch内で適用済み（status=to かつ updated_at=now）の時だけeventを追記する
  private eventInsertStatement(
    eventId: string,
    aiRunId: AiRunId,
    eventType: string,
    now: string,
    eventData: Record<string, unknown>,
  ) {
    return this.db
      .prepare(
        `INSERT INTO ai_run_events (id, ai_run_id, event_type, sequence, data_json, created_at)
         SELECT ?1, r.id, ?3, COALESCE((SELECT MAX(e.sequence) FROM ai_run_events e WHERE e.ai_run_id = r.id), 0) + 1, ?4, ?5
         FROM ai_runs r WHERE r.id = ?2 AND r.status = ?3 AND r.updated_at = ?5`,
      )
      .bind(eventId, aiRunId, eventType, JSON.stringify(eventData), now);
  }

  private async transitionWithEvent(
    id: AiRunId,
    transition: {
      fromStatuses: readonly string[];
      toStatus: string;
      extraSetSql?: string;
      extraSetBindings?: readonly (string | number)[];
      eventData: Record<string, unknown>;
    },
  ): Promise<Result<void, AiRunError>> {
    const fromList = transition.fromStatuses.map((s) => `'${s}'`).join(', ');
    const extraSet = transition.extraSetSql ? `, ${transition.extraSetSql}` : '';
    for (let attempt = 1; attempt <= TRANSITION_MAX_ATTEMPTS; attempt++) {
      const now = new Date().toISOString();
      const eventId = crypto.randomUUID();
      try {
        const [statusUpdate] = await this.db.batch([
          this.db
            .prepare(`UPDATE ai_runs SET status = ?, updated_at = ?${extraSet} WHERE id = ? AND status IN (${fromList})`)
            .bind(transition.toStatus, now, ...(transition.extraSetBindings ?? []), id),
          this.eventInsertStatement(eventId, id, transition.toStatus, now, transition.eventData),
        ]);

        if (!statusUpdate.meta.changes) {
          return err({
            _tag: 'InvalidAiRunTransition',
            aiRunId: id,
            from: transition.fromStatuses.join('|'),
            to: transition.toStatus,
          });
        }
        return ok(undefined);
      } catch (cause) {
        if (isSequenceConflict(cause) && attempt < TRANSITION_MAX_ATTEMPTS) continue;
        return err({ _tag: 'AiRunDbFailure', operation: `transition:${transition.toStatus}` });
      }
    }
    return err({ _tag: 'AiRunDbFailure', operation: `transition:${transition.toStatus}` });
  }
}
