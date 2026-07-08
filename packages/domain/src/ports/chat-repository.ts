import type { ChatId, MemberId } from '@gs-v2/shared';
import type { Result } from '../result.js';
import type { Chat, Message } from '../models/chat.js';

export type ChatError =
  | { _tag: 'ChatNotFound'; chatId: string }
  | { _tag: 'ChatArchived'; chatId: string }
  | { _tag: 'ChatDbFailure'; operation: string };

// messagesへの書き込みはTurnRepository/AiRunRepositoryが（run・chatと原子的に）担う。ここは読み取り専用
export interface ChatRepository {
  findById(id: ChatId): Promise<Result<Chat, ChatError>>;
  findByMember(memberId: MemberId): Promise<Result<readonly Chat[], ChatError>>;
  listMessages(chatId: ChatId): Promise<Result<readonly Message[], ChatError>>;
}
