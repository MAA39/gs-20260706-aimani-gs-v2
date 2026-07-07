import type { AiRunId } from '@gs-v2/shared';
import type { AiRun, AiRunEvent, CreateQueuedRunInput, CompleteRunInput } from '@gs-v2/domain';
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

function isUniqueConstraintFailure(cause: unknown): boolean {
  return cause instanceof Error && cause.message.includes('UNIQUE constraint failed');
}

const APPEND_EVENT_MAX_ATTEMPTS = 3;

export class D1AiRunRepository implements AiRunRepository {
  constructor(private readonly db: D1Database) {}

  async createQueued(id: AiRunId, input: CreateQueuedRunInput): Promise<Result<AiRun, AiRunError>> {
    const now = new Date().toISOString();
    const eventId = crypto.randomUUID();

    try {
      await this.db.batch([
        this.db
          .prepare(`
            INSERT INTO ai_runs (id, chat_id, trigger_message_id, stage, status, idempotency_key, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'queued', ?, ?, ?)
          `)
          .bind(id, input.chatId, input.triggerMessageId, input.stage, input.idempotencyKey ?? null, now, now),
        this.db
          .prepare(`
            INSERT INTO ai_run_events (id, ai_run_id, event_type, sequence, data_json, created_at)
            VALUES (?, ?, 'queued', 1, ?, ?)
          `)
          .bind(eventId, id, JSON.stringify({ stage: input.stage }), now),
      ]);
    } catch (cause) {
      if (isUniqueConstraintFailure(cause)) {
        return err({ _tag: 'AiRunConflict', reason: 'IdempotencyKey' });
      }
      return err({ _tag: 'AiRunDbFailure', operation: 'createQueued' });
    }

    return this.findById(id);
  }

  async markAdmitted(id: AiRunId): Promise<Result<void, AiRunError>> {
    return this.casTransition(id, 'queued', 'admitted');
  }

  async markGenerating(id: AiRunId, flueRunId: string): Promise<Result<void, AiRunError>> {
    const now = new Date().toISOString();
    let changes: number;
    try {
      const result = await this.db
        .prepare(`UPDATE ai_runs SET status = 'generating', flue_run_id = ?, updated_at = ? WHERE id = ? AND status = 'admitted'`)
        .bind(flueRunId, now, id)
        .run();
      changes = result.meta.changes;
    } catch {
      return err({ _tag: 'AiRunDbFailure', operation: 'markGenerating' });
    }

    if (!changes) {
      return err({ _tag: 'InvalidAiRunTransition', aiRunId: id, from: 'admitted', to: 'generating' });
    }

    await this.appendEvent(id, 'generating', { flueRunId });
    return ok(undefined);
  }

  async markRepairing(id: AiRunId): Promise<Result<void, AiRunError>> {
    const now = new Date().toISOString();
    let changes: number;
    try {
      const result = await this.db
        .prepare(`UPDATE ai_runs SET status = 'repairing', attempt_count = attempt_count + 1, updated_at = ? WHERE id = ? AND status = 'generating'`)
        .bind(now, id)
        .run();
      changes = result.meta.changes;
    } catch {
      return err({ _tag: 'AiRunDbFailure', operation: 'markRepairing' });
    }

    if (!changes) {
      return err({ _tag: 'InvalidAiRunTransition', aiRunId: id, from: 'generating', to: 'repairing' });
    }

    await this.appendEvent(id, 'repairing', {});
    return ok(undefined);
  }

  async complete(input: CompleteRunInput): Promise<Result<void, AiRunError>> {
    const now = new Date().toISOString();
    let changes: number;
    try {
      const result = await this.db
        .prepare(`
          UPDATE ai_runs
          SET status = 'completed', prompt_tokens = ?, completion_tokens = ?, result_hash = ?, updated_at = ?
          WHERE id = ? AND status IN ('generating', 'repairing')
        `)
        .bind(input.promptTokens, input.completionTokens, input.resultHash, now, input.aiRunId)
        .run();
      changes = result.meta.changes;
    } catch {
      return err({ _tag: 'AiRunDbFailure', operation: 'complete' });
    }

    if (!changes) {
      return err({ _tag: 'InvalidAiRunTransition', aiRunId: input.aiRunId, from: '?', to: 'completed' });
    }

    await this.appendEvent(input.aiRunId, 'completed', {
      resultMessageIds: input.resultMessageIds,
      promptTokens: input.promptTokens,
      completionTokens: input.completionTokens,
    });
    return ok(undefined);
  }

  async fail(id: AiRunId, errorMessage: string): Promise<Result<void, AiRunError>> {
    const now = new Date().toISOString();
    const truncated = errorMessage.slice(0, 500);
    let changes: number;
    try {
      const result = await this.db
        .prepare(`
          UPDATE ai_runs SET status = 'failed', error_message = ?, updated_at = ?
          WHERE id = ? AND status NOT IN ('completed', 'failed')
        `)
        .bind(truncated, now, id)
        .run();
      changes = result.meta.changes;
    } catch {
      return err({ _tag: 'AiRunDbFailure', operation: 'fail' });
    }

    if (!changes) {
      return err({ _tag: 'InvalidAiRunTransition', aiRunId: id, from: '?', to: 'failed' });
    }

    await this.appendEvent(id, 'failed', { errorMessage: truncated });
    return ok(undefined);
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

  private async casTransition(id: AiRunId, from: string, to: string): Promise<Result<void, AiRunError>> {
    const now = new Date().toISOString();
    let changes: number;
    try {
      const result = await this.db
        .prepare(`UPDATE ai_runs SET status = ?, updated_at = ? WHERE id = ? AND status = ?`)
        .bind(to, now, id, from)
        .run();
      changes = result.meta.changes;
    } catch {
      return err({ _tag: 'AiRunDbFailure', operation: `casTransition:${from}->${to}` });
    }

    if (!changes) {
      return err({ _tag: 'InvalidAiRunTransition', aiRunId: id, from, to });
    }

    await this.appendEvent(id, to, {});
    return ok(undefined);
  }

  // イベント追記はライフサイクル進行のベストエフォート副産物。失敗しても状態遷移自体は成立している
  private async appendEvent(aiRunId: AiRunId, eventType: string, data: Record<string, unknown>): Promise<void> {
    for (let attempt = 1; attempt <= APPEND_EVENT_MAX_ATTEMPTS; attempt++) {
      const eventId = crypto.randomUUID();
      const now = new Date().toISOString();
      try {
        await this.db
          .prepare(
            `INSERT INTO ai_run_events (id, ai_run_id, event_type, sequence, data_json, created_at)
             SELECT ?1, ?2, ?3, COALESCE(MAX(sequence), 0) + 1, ?4, ?5 FROM ai_run_events WHERE ai_run_id = ?2`,
          )
          .bind(eventId, aiRunId, eventType, JSON.stringify(data), now)
          .run();
        return;
      } catch (cause) {
        if (isUniqueConstraintFailure(cause) && attempt < APPEND_EVENT_MAX_ATTEMPTS) continue;
        console.error('appendEvent failed', { aiRunId, eventType, attempt });
        return;
      }
    }
  }
}
