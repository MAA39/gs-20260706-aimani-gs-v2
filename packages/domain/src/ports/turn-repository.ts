import type { ChatId, MemberId, MessageId, AiRunId, AiRunStage } from '@gs-v2/shared';
import type { Result } from '../result.js';
import type { Chat, Message } from '../models/chat.js';
import type { AiRun } from '../models/ai-run.js';

export type AiRunInFlight = {
  readonly _tag: 'AiRunInFlight';
  readonly chatId: string;
  readonly aiRunId: string;
};

export type TurnError =
  | { _tag: 'ChatNotFound'; chatId: string }
  | { _tag: 'MessageSequenceConflict'; chatId: string }
  | AiRunInFlight
  | { _tag: 'AiRunConflict'; reason: 'IdempotencyKey' | 'ResultHash' }
  | { _tag: 'TurnDbFailure'; operation: string };

export interface HumanTurn {
  readonly humanMessage: Message;
  readonly aiRun: AiRun;
}

export interface TurnIds {
  readonly messageId: MessageId;
  readonly aiRunId: AiRunId;
}

export interface AppendHumanTurnInput {
  readonly chatId: ChatId;
  readonly body: string;
  readonly stage: AiRunStage;
}

export interface CreateChatWithFirstTurnInput {
  readonly memberId: MemberId;
  readonly title: string;
  readonly body: string;
  readonly stage: AiRunStage;
}

export interface ChatWithFirstTurn extends HumanTurn {
  readonly chat: Chat;
}

// human message と queued AI run は常に対で生まれる（片方だけ残る状態を作らない）
export interface TurnRepository {
  createChatWithFirstTurn(
    chatId: ChatId,
    ids: TurnIds,
    input: CreateChatWithFirstTurnInput,
  ): Promise<Result<ChatWithFirstTurn, TurnError>>;
  appendHumanTurn(ids: TurnIds, input: AppendHumanTurnInput): Promise<Result<HumanTurn, TurnError>>;
}
