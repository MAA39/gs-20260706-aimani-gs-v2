import type { ChatId, MemberId, MessageId, AiRunId } from '@gs-v2/shared';
import type { Result } from '../result.js';
import { ok } from '../result.js';
import type { Message } from '../models/chat.js';
import type { AiRun } from '../models/ai-run.js';
import type { ChatRepository, ChatError } from '../ports/chat-repository.js';
import type { AiRunRepository, AiRunError } from '../ports/ai-run-repository.js';

export type ChatNotOwned = {
  readonly _tag: 'ChatNotOwned';
  readonly chatId: string;
  readonly actorMemberId: string;
};

export type SendMessageError =
  | ChatError
  | AiRunError
  | ChatNotOwned;

export interface SendMessageOutput {
  readonly humanMessage: Message;
  readonly aiRun: AiRun;
}

export interface SendMessageDeps {
  readonly chatRepo: ChatRepository;
  readonly aiRunRepo: AiRunRepository;
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

  const messageId = deps.idGen() as MessageId;
  const messageResult = await deps.chatRepo.appendMessage(messageId, {
    chatId,
    senderType: 'human',
    body: messageBody,
  });
  if (!messageResult.ok) return messageResult;

  const aiRunId = deps.idGen() as AiRunId;
  const aiRunResult = await deps.aiRunRepo.createQueued(aiRunId, {
    chatId,
    triggerMessageId: messageId,
    stage: 'sparring',
  });
  if (!aiRunResult.ok) return aiRunResult;

  return ok({
    humanMessage: messageResult.value,
    aiRun: aiRunResult.value,
  });
}
