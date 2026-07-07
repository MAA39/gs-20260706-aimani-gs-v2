import type { ChatId, MemberId, MessageId, AiRunId } from '@gs-v2/shared';
import type { Result } from '../result.js';
import { ok } from '../result.js';
import type { Chat, Message } from '../models/chat.js';
import type { AiRun } from '../models/ai-run.js';
import type { MemberRepository, MemberError } from '../ports/member-repository.js';
import type { ChatRepository, ChatError } from '../ports/chat-repository.js';
import type { AiRunRepository, AiRunError } from '../ports/ai-run-repository.js';

export type StartChatError =
  | MemberError
  | ChatError
  | AiRunError;

export interface StartChatOutput {
  readonly chat: Chat;
  readonly humanMessage: Message;
  readonly aiRun: AiRun;
}

export interface StartChatDeps {
  readonly memberRepo: MemberRepository;
  readonly chatRepo: ChatRepository;
  readonly aiRunRepo: AiRunRepository;
  readonly idGen: () => string;
}

export async function startChat(
  deps: StartChatDeps,
  memberId: MemberId,
  messageBody: string,
): Promise<Result<StartChatOutput, StartChatError>> {
  const memberResult = await deps.memberRepo.findById(memberId);
  if (!memberResult.ok) return memberResult;

  const chatId = deps.idGen() as ChatId;
  // 一覧表示用のタイトルは最初の相談文の先頭から取る
  const title = messageBody.trim().slice(0, 50);
  const chatResult = await deps.chatRepo.create(chatId, { memberId, title });
  if (!chatResult.ok) return chatResult;

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
    chat: chatResult.value,
    humanMessage: messageResult.value,
    aiRun: aiRunResult.value,
  });
}
