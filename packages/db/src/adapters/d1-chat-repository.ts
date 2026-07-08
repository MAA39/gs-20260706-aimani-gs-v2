import type { ChatId, MemberId, MessageId } from '@gs-v2/shared';
import type { Chat, Message } from '@gs-v2/domain';
import type { ChatRepository, ChatError } from '@gs-v2/domain';
import type { Result } from '@gs-v2/domain';
import { ok, err } from '@gs-v2/domain';

interface ChatRow {
  id: string;
  member_id: string;
  title: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface MessageRow {
  id: string;
  chat_id: string;
  sender_type: string;
  body: string;
  sequence: number;
  created_at: string;
}

function rowToChat(row: ChatRow): Chat {
  return {
    id: row.id as ChatId,
    memberId: row.member_id as MemberId,
    title: row.title,
    status: row.status as Chat['status'],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToMessage(row: MessageRow): Message {
  return {
    id: row.id as MessageId,
    chatId: row.chat_id as ChatId,
    senderType: row.sender_type as Message['senderType'],
    body: row.body,
    sequence: row.sequence,
    createdAt: row.created_at,
  };
}

export class D1ChatRepository implements ChatRepository {
  constructor(private readonly db: D1Database) {}

  async findById(id: ChatId): Promise<Result<Chat, ChatError>> {
    try {
      const row = await this.db
        .prepare('SELECT * FROM chats WHERE id = ?')
        .bind(id)
        .first<ChatRow>();
      if (!row) return err({ _tag: 'ChatNotFound', chatId: id });
      return ok(rowToChat(row));
    } catch {
      return err({ _tag: 'ChatDbFailure', operation: 'findById' });
    }
  }

  async findByMember(memberId: MemberId): Promise<Result<readonly Chat[], ChatError>> {
    try {
      const { results } = await this.db
        .prepare('SELECT * FROM chats WHERE member_id = ? ORDER BY created_at DESC')
        .bind(memberId)
        .all<ChatRow>();
      return ok(results.map(rowToChat));
    } catch {
      return err({ _tag: 'ChatDbFailure', operation: 'findByMember' });
    }
  }

  async listMessages(chatId: ChatId): Promise<Result<readonly Message[], ChatError>> {
    try {
      const { results } = await this.db
        .prepare('SELECT * FROM messages WHERE chat_id = ? ORDER BY sequence ASC')
        .bind(chatId)
        .all<MessageRow>();
      return ok(results.map(rowToMessage));
    } catch {
      return err({ _tag: 'ChatDbFailure', operation: 'listMessages' });
    }
  }
}
