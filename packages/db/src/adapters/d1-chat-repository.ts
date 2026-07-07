import type { ChatId, MemberId, MessageId } from '@gs-v2/shared';
import type { Chat, Message, CreateChatInput, AppendMessageInput } from '@gs-v2/domain';
import type { ChatRepository, ChatError } from '@gs-v2/domain';
import type { Result } from '@gs-v2/domain';
import { ok, err } from '@gs-v2/domain';

interface ChatRow {
  id: string;
  member_id: string;
  title: string | null;
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

  async create(id: ChatId, input: CreateChatInput): Promise<Result<Chat, ChatError>> {
    const now = new Date().toISOString();
    await this.db
      .prepare('INSERT INTO chats (id, member_id, title, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(id, input.memberId, input.title ?? null, 'active', now, now)
      .run();
    return this.findById(id);
  }

  async findById(id: ChatId): Promise<Result<Chat, ChatError>> {
    const row = await this.db
      .prepare('SELECT * FROM chats WHERE id = ?')
      .bind(id)
      .first<ChatRow>();
    if (!row) return err({ _tag: 'ChatNotFound', chatId: id });
    return ok(rowToChat(row));
  }

  async findByMember(memberId: MemberId): Promise<Result<readonly Chat[], ChatError>> {
    const { results } = await this.db
      .prepare('SELECT * FROM chats WHERE member_id = ? ORDER BY created_at DESC')
      .bind(memberId)
      .all<ChatRow>();
    return ok(results.map(rowToChat));
  }

  async appendMessage(id: MessageId, input: AppendMessageInput): Promise<Result<Message, ChatError>> {
    const seqResult = await this.getNextSequence(input.chatId);
    if (!seqResult.ok) return seqResult;

    const now = new Date().toISOString();
    await this.db
      .prepare('INSERT INTO messages (id, chat_id, sender_type, body, sequence, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(id, input.chatId, input.senderType, input.body, seqResult.value, now)
      .run();

    return ok({
      id,
      chatId: input.chatId,
      senderType: input.senderType,
      body: input.body,
      sequence: seqResult.value,
      createdAt: now,
    });
  }

  async listMessages(chatId: ChatId): Promise<Result<readonly Message[], ChatError>> {
    const { results } = await this.db
      .prepare('SELECT * FROM messages WHERE chat_id = ? ORDER BY sequence ASC')
      .bind(chatId)
      .all<MessageRow>();
    return ok(results.map(rowToMessage));
  }

  async getNextSequence(chatId: ChatId): Promise<Result<number, ChatError>> {
    const row = await this.db
      .prepare('SELECT COALESCE(MAX(sequence), 0) as max_seq FROM messages WHERE chat_id = ?')
      .bind(chatId)
      .first<{ max_seq: number }>();
    return ok((row?.max_seq ?? 0) + 1);
  }
}
