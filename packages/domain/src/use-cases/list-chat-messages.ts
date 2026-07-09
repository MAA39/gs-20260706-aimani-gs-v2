import type { ChatId, MemberId } from '@gs-v2/shared';
import type { Result } from '../result.js';
import { ok } from '../result.js';
import type { Message } from '../models/chat.js';
import type { ChatRepository, ChatError } from '../ports/chat-repository.js';
import type { ChatNotOwned } from './send-message.js';

export type ListChatMessagesError = ChatError | ChatNotOwned;

export interface ListChatMessagesDeps {
  readonly chatRepo: ChatRepository;
}

export async function listChatMessages(
  deps: ListChatMessagesDeps,
  actorMemberId: MemberId,
  chatId: ChatId,
): Promise<Result<readonly Message[], ListChatMessagesError>> {
  const chatResult = await deps.chatRepo.findById(chatId);
  if (!chatResult.ok) return chatResult;

  if (chatResult.value.memberId !== actorMemberId) {
    return { ok: false, error: { _tag: 'ChatNotOwned', chatId, actorMemberId } };
  }

  const messagesResult = await deps.chatRepo.listMessages(chatId);
  if (!messagesResult.ok) return messagesResult;

  return ok(messagesResult.value);
}
