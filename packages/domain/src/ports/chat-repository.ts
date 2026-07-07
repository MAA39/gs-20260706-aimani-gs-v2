import type { ChatId, MemberId, MessageId } from '@gs-v2/shared';
import type { Result } from '../result.js';
import type { Chat, Message, CreateChatInput, AppendMessageInput } from '../models/chat.js';

export type ChatError =
  | { _tag: 'ChatNotFound'; chatId: string }
  | { _tag: 'ChatArchived'; chatId: string }
  | { _tag: 'MessageSequenceConflict'; chatId: string }
  | { _tag: 'ChatDbFailure'; operation: string };

export interface ChatRepository {
  create(id: ChatId, input: CreateChatInput): Promise<Result<Chat, ChatError>>;
  findById(id: ChatId): Promise<Result<Chat, ChatError>>;
  findByMember(memberId: MemberId): Promise<Result<readonly Chat[], ChatError>>;
  appendMessage(id: MessageId, input: AppendMessageInput): Promise<Result<Message, ChatError>>;
  listMessages(chatId: ChatId): Promise<Result<readonly Message[], ChatError>>;
  getNextSequence(chatId: ChatId): Promise<Result<number, ChatError>>;
}
