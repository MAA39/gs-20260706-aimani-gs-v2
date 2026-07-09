type Brand<T, B extends string> = T & { readonly __brand: B };

export type MemberId = Brand<string, 'MemberId'>;
export type ChatId = Brand<string, 'ChatId'>;
export type MessageId = Brand<string, 'MessageId'>;
export type AiRunId = Brand<string, 'AiRunId'>;
export type AiRunEventId = Brand<string, 'AiRunEventId'>;

export type IdParseResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: 'empty' | 'too_long' | 'invalid_chars' };

// IDはcrypto.randomUUID()またはbetter-authのuser id（UUIDとは限らない）。
// 形式を固定せず「URLセーフな不透明トークン」として検証する
const ID_MAX_LENGTH = 128;
const ID_PATTERN = /^[A-Za-z0-9_-]+$/;

function parseId<T extends string>(raw: string): IdParseResult<T> {
  if (raw.length === 0) return { ok: false, reason: 'empty' };
  if (raw.length > ID_MAX_LENGTH) return { ok: false, reason: 'too_long' };
  if (!ID_PATTERN.test(raw)) return { ok: false, reason: 'invalid_chars' };
  return { ok: true, value: raw as T };
}

export function parseMemberId(raw: string): IdParseResult<MemberId> {
  return parseId<MemberId>(raw);
}

export function parseChatId(raw: string): IdParseResult<ChatId> {
  return parseId<ChatId>(raw);
}

export function parseMessageId(raw: string): IdParseResult<MessageId> {
  return parseId<MessageId>(raw);
}

export function parseAiRunId(raw: string): IdParseResult<AiRunId> {
  return parseId<AiRunId>(raw);
}

export const Role = {
  STUDENT: 'student',
  ALUMNI: 'alumni',
  TUTOR: 'tutor',
  MENTOR: 'mentor',
  TEACHER: 'teacher',
  ADMIN: 'admin',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const SenderType = {
  HUMAN: 'human',
  AI: 'ai',
  SYSTEM: 'system',
} as const;
export type SenderType = (typeof SenderType)[keyof typeof SenderType];

export const ChatStatus = {
  ACTIVE: 'active',
  ARCHIVED: 'archived',
} as const;
export type ChatStatus = (typeof ChatStatus)[keyof typeof ChatStatus];

export const AiRunStage = {
  SPARRING: 'sparring',
  RECOMMENDATION: 'recommendation',
} as const;
export type AiRunStage = (typeof AiRunStage)[keyof typeof AiRunStage];

export const AiRunStatus = {
  QUEUED: 'queued',
  ADMITTED: 'admitted',
  GENERATING: 'generating',
  REPAIRING: 'repairing',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;
export type AiRunStatus = (typeof AiRunStatus)[keyof typeof AiRunStatus];
