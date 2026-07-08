import type { ChatId, MemberId, MessageId } from '@gs-v2/shared';
import type { Chat, Message, AppendMessageInput } from '@gs-v2/domain';
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

function isUniqueConstraintFailure(cause: unknown, constraint: string): boolean {
  return (
    cause instanceof Error &&
    cause.message.includes('UNIQUE constraint failed') &&
    cause.message.includes(constraint)
  );
}

const APPEND_MESSAGE_MAX_ATTEMPTS = 3;

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

  async appendMessage(id: MessageId, input: AppendMessageInput): Promise<Result<Message, ChatError>> {
    for (let attempt = 1; attempt <= APPEND_MESSAGE_MAX_ATTEMPTS; attempt++) {
      const now = new Date().toISOString();
      try {
        // chats起点の採番: 不存在chatは0行のままINSERTされず、ChatNotFoundとして返せる
        const row = await this.db
          .prepare(
            `INSERT INTO messages (id, chat_id, sender_type, body, sequence, created_at)
             SELECT ?1, c.id, ?3, ?4, COALESCE((SELECT MAX(m.sequence) FROM messages m WHERE m.chat_id = c.id), 0) + 1, ?5
             FROM chats c WHERE c.id = ?2
             RETURNING sequence`,
          )
          .bind(id, input.chatId, input.senderType, input.body, now)
          .first<{ sequence: number }>();
        if (!row) return err({ _tag: 'ChatNotFound', chatId: input.chatId });
        return ok({
          id,
          chatId: input.chatId,
          senderType: input.senderType,
          body: input.body,
          sequence: row.sequence,
          createdAt: now,
        });
      } catch (cause) {
        if (isUniqueConstraintFailure(cause, 'messages.sequence')) {
          if (attempt < APPEND_MESSAGE_MAX_ATTEMPTS) continue;
          return err({ _tag: 'MessageSequenceConflict', chatId: input.chatId });
        }
        return err({ _tag: 'ChatDbFailure', operation: 'appendMessage' });
      }
    }
    return err({ _tag: 'MessageSequenceConflict', chatId: input.chatId });
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
