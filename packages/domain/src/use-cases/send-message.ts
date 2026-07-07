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

export type AiRunInFlight = {
  readonly _tag: 'AiRunInFlight';
  readonly chatId: string;
  readonly aiRunId: string;
};

export type SendMessageError =
  | ChatError
  | AiRunError
  | ChatNotOwned
  | AiRunInFlight;

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

  // 1チャット1 in-flight run: AI応答待ち中の追加送信は拒否する（TSU-004裁定A）
  const activeRunResult = await deps.aiRunRepo.findActiveByChatId(chatId);
  if (!activeRunResult.ok) return activeRunResult;
  if (activeRunResult.value !== null) {
    return { ok: false, error: { _tag: 'AiRunInFlight', chatId, aiRunId: activeRunResult.value.id } };
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
