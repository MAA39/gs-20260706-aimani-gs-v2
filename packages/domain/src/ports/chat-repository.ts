import type { ChatId, MemberId, MessageId } from '@gs-v2/shared';
import type { Result } from '../result.js';
import type { Chat, Message, AppendMessageInput } from '../models/chat.js';

export type ChatError =
  | { _tag: 'ChatNotFound'; chatId: string }
  | { _tag: 'ChatArchived'; chatId: string }
  | { _tag: 'MessageSequenceConflict'; chatId: string }
  | { _tag: 'ChatDbFailure'; operation: string };

// chat作成はTurnRepository.createChatWithFirstTurn（最初のmessage・runと原子的に作る）が担う
export interface ChatRepository {
  findById(id: ChatId): Promise<Result<Chat, ChatError>>;
  findByMember(memberId: MemberId): Promise<Result<readonly Chat[], ChatError>>;
  appendMessage(id: MessageId, input: AppendMessageInput): Promise<Result<Message, ChatError>>;
  listMessages(chatId: ChatId): Promise<Result<readonly Message[], ChatError>>;
}
