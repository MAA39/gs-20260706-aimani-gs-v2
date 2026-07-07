import type { ChatId, MemberId, MessageId, AiRunId } from '@gs-v2/shared';
import type { Member } from '../../models/member.js';
import type { Chat, Message, AppendMessageInput, CreateChatInput } from '../../models/chat.js';
import type { AiRun, AiRunEvent, CreateQueuedRunInput, CompleteRunInput } from '../../models/ai-run.js';
import type { MemberRepository, MemberError } from '../../ports/member-repository.js';
import type { ChatRepository, ChatError } from '../../ports/chat-repository.js';
import type { AiRunRepository, AiRunError } from '../../ports/ai-run-repository.js';
import type { Result } from '../../result.js';
import { ok, err } from '../../result.js';

const NOW = '2026-07-08T00:00:00.000Z';

export const memberId = (raw: string) => raw as MemberId;
export const chatId = (raw: string) => raw as ChatId;
export const messageId = (raw: string) => raw as MessageId;
export const aiRunId = (raw: string) => raw as AiRunId;

export function makeMember(overrides: Partial<Member> = {}): Member {
  return {
    id: memberId('member-1'),
    displayName: 'テスト太郎',
    role: 'student',
    bio: '',
    skills: [],
    canHelpWith: [],
    wantsHelpWith: [],
    githubUrl: null,
    xUrl: null,
    facebookUrl: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

export function makeChat(overrides: Partial<Chat> = {}): Chat {
  return {
    id: chatId('chat-1'),
    memberId: memberId('member-1'),
    title: null,
    status: 'active',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

export function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: messageId('message-1'),
    chatId: chatId('chat-1'),
    senderType: 'human',
    body: 'こんにちは',
    sequence: 1,
    createdAt: NOW,
    ...overrides,
  };
}

export function makeAiRun(overrides: Partial<AiRun> = {}): AiRun {
  return {
    id: aiRunId('ai-run-1'),
    chatId: chatId('chat-1'),
    triggerMessageId: messageId('message-1'),
    stage: 'sparring',
    status: 'queued',
    idempotencyKey: null,
    flueRunId: null,
    attemptCount: 0,
    promptTokens: 0,
    completionTokens: 0,
    resultHash: null,
    errorMessage: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

export interface FakeMemberRepoConfig {
  findById?: Result<Member, MemberError>;
}

export class FakeMemberRepository implements MemberRepository {
  readonly calls: string[] = [];

  constructor(private readonly config: FakeMemberRepoConfig = {}) {}

  async findById(id: MemberId): Promise<Result<Member, MemberError>> {
    this.calls.push('findById');
    return this.config.findById ?? ok(makeMember({ id }));
  }

  async findByRole(): Promise<Result<readonly Member[], MemberError>> {
    this.calls.push('findByRole');
    return ok([]);
  }

  async findBySkills(): Promise<Result<readonly Member[], MemberError>> {
    this.calls.push('findBySkills');
    return ok([]);
  }

  async create(id: MemberId): Promise<Result<Member, MemberError>> {
    this.calls.push('create');
    return ok(makeMember({ id }));
  }
}

export interface FakeChatRepoConfig {
  findById?: Result<Chat, ChatError>;
  create?: Result<Chat, ChatError>;
  appendMessage?: Result<Message, ChatError>;
  listMessages?: Result<readonly Message[], ChatError>;
}

export class FakeChatRepository implements ChatRepository {
  readonly calls: string[] = [];
  readonly appendedMessages: AppendMessageInput[] = [];

  constructor(private readonly config: FakeChatRepoConfig = {}) {}

  async create(id: ChatId, input: CreateChatInput): Promise<Result<Chat, ChatError>> {
    this.calls.push('create');
    return this.config.create ?? ok(makeChat({ id, memberId: input.memberId }));
  }

  async findById(id: ChatId): Promise<Result<Chat, ChatError>> {
    this.calls.push('findById');
    return this.config.findById ?? ok(makeChat({ id }));
  }

  async findByMember(): Promise<Result<readonly Chat[], ChatError>> {
    this.calls.push('findByMember');
    return ok([]);
  }

  async appendMessage(id: MessageId, input: AppendMessageInput): Promise<Result<Message, ChatError>> {
    this.calls.push('appendMessage');
    this.appendedMessages.push(input);
    return (
      this.config.appendMessage ??
      ok(makeMessage({ id, chatId: input.chatId, senderType: input.senderType, body: input.body }))
    );
  }

  async listMessages(id: ChatId): Promise<Result<readonly Message[], ChatError>> {
    this.calls.push('listMessages');
    return this.config.listMessages ?? ok([makeMessage({ chatId: id })]);
  }
}

export interface FakeAiRunRepoConfig {
  createQueued?: Result<AiRun, AiRunError>;
  findActiveByChatId?: Result<AiRun | null, AiRunError>;
}

export class FakeAiRunRepository implements AiRunRepository {
  readonly calls: string[] = [];
  readonly queuedInputs: CreateQueuedRunInput[] = [];

  constructor(private readonly config: FakeAiRunRepoConfig = {}) {}

  async createQueued(id: AiRunId, input: CreateQueuedRunInput): Promise<Result<AiRun, AiRunError>> {
    this.calls.push('createQueued');
    this.queuedInputs.push(input);
    return (
      this.config.createQueued ??
      ok(makeAiRun({ id, chatId: input.chatId as ChatId, triggerMessageId: input.triggerMessageId as MessageId }))
    );
  }

  async findActiveByChatId(): Promise<Result<AiRun | null, AiRunError>> {
    this.calls.push('findActiveByChatId');
    return this.config.findActiveByChatId ?? ok(null);
  }

  async markAdmitted(): Promise<Result<void, AiRunError>> {
    this.calls.push('markAdmitted');
    return ok(undefined);
  }

  async markGenerating(): Promise<Result<void, AiRunError>> {
    this.calls.push('markGenerating');
    return ok(undefined);
  }

  async markRepairing(): Promise<Result<void, AiRunError>> {
    this.calls.push('markRepairing');
    return ok(undefined);
  }

  async complete(_input: CompleteRunInput): Promise<Result<void, AiRunError>> {
    this.calls.push('complete');
    return ok(undefined);
  }

  async fail(): Promise<Result<void, AiRunError>> {
    this.calls.push('fail');
    return ok(undefined);
  }

  async findById(id: AiRunId): Promise<Result<AiRun, AiRunError>> {
    this.calls.push('findById');
    return ok(makeAiRun({ id }));
  }

  async listEventsAfter(): Promise<Result<readonly AiRunEvent[], AiRunError>> {
    this.calls.push('listEventsAfter');
    return ok([]);
  }
}

export function sequentialIdGen(prefix = 'generated'): () => string {
  let counter = 0;
  return () => `${prefix}-${++counter}`;
}

export { ok, err };
