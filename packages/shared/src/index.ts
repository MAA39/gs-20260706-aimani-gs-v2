type Brand<T, B extends string> = T & { readonly __brand: B };

export type UserId = Brand<string, 'UserId'>;
export type MemberId = Brand<string, 'MemberId'>;
export type ChatId = Brand<string, 'ChatId'>;
export type MessageId = Brand<string, 'MessageId'>;
export type AiRunId = Brand<string, 'AiRunId'>;
export type AiRunEventId = Brand<string, 'AiRunEventId'>;
export type QuestionCardId = Brand<string, 'QuestionCardId'>;

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
