import type { ChatId, MemberId, MessageId, AiRunId } from '@gs-v2/shared';
import type { Result } from '../result.js';
import type { Message } from '../models/chat.js';
import type { AiRun } from '../models/ai-run.js';
import type { ChatRepository, ChatError } from '../ports/chat-repository.js';
import type { TurnRepository, TurnError } from '../ports/turn-repository.js';

export type { AiRunInFlight } from '../ports/turn-repository.js';

export type ChatNotOwned = {
  readonly _tag: 'ChatNotOwned';
  readonly chatId: string;
  readonly actorMemberId: string;
};

export type SendMessageError =
  | ChatError
  | TurnError
  | ChatNotOwned;

export interface SendMessageOutput {
  readonly humanMessage: Message;
  readonly aiRun: AiRun;
}

export interface SendMessageDeps {
  readonly chatRepo: ChatRepository;
  readonly turnRepo: TurnRepository;
  readonly idGen: () => string;
}

export async function sendMessage(
  deps: SendMessageDeps,
  actorMemberId: MemberId,
  chatId: ChatId,
  messageBody: string,
): Promise<Result<SendMessageOutput, SendMessageError>> {
  const chatResult = await deps.chatRepo.findById(chatId);
  if (!chatResult.ok) return chatResult;

  if (chatResult.value.memberId !== actorMemberId) {
    return { ok: false, error: { _tag: 'ChatNotOwned', chatId, actorMemberId } };
  }

  if (chatResult.value.status === 'archived') {
    return { ok: false, error: { _tag: 'ChatArchived', chatId } };
  }

  // message+run同時作成は原子的。「1チャット1 in-flight run」はDBの部分UNIQUE indexが保証し、
  // 違反はAiRunInFlightとして返る（TSU-004裁定A / ADV-007）
  const turnResult = await deps.turnRepo.appendHumanTurn(
    { messageId: deps.idGen() as MessageId, aiRunId: deps.idGen() as AiRunId },
    { chatId, body: messageBody, stage: 'sparring' },
  );
  if (!turnResult.ok) return turnResult;

  return {
    ok: true,
    value: {
      humanMessage: turnResult.value.humanMessage,
      aiRun: turnResult.value.aiRun,
    },
  };
}
