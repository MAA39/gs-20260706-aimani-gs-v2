import type { AiRunId, AiRunEventId, ChatId, MessageId, AiRunStage, AiRunStatus } from '@gs-v2/shared';

export interface AiRun {
  readonly id: AiRunId;
  readonly chatId: ChatId;
  readonly triggerMessageId: MessageId;
  readonly stage: AiRunStage;
  readonly status: AiRunStatus;
  readonly idempotencyKey: string | null;
  readonly flueRunId: string | null;
  readonly attemptCount: number;
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly resultHash: string | null;
  readonly errorMessage: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AiRunEvent {
  readonly id: AiRunEventId;
  readonly aiRunId: AiRunId;
  readonly eventType: string;
  readonly sequence: number;
  readonly dataJson: string;
  readonly createdAt: string;
}

export interface CreateQueuedRunInput {
  readonly chatId: ChatId;
  readonly triggerMessageId: MessageId;
  readonly stage: AiRunStage;
  readonly idempotencyKey?: string;
}

export interface CompleteRunInput {
  readonly aiRunId: AiRunId;
  readonly resultMessageIds: readonly MessageId[];
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly resultHash: string;
}
