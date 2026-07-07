// Brand型ヘルパー
type Brand<T, B extends string> = T & { readonly __brand: B };

export type UserId = Brand<string, 'UserId'>;
export type ChatId = Brand<string, 'ChatId'>;
export type MessageId = Brand<string, 'MessageId'>;
export type QuestionCardId = Brand<string, 'QuestionCardId'>;

export const Role = {
  STUDENT: 'student',
  ALUMNI: 'alumni',
  TUTOR: 'tutor',
  MENTOR: 'mentor',
  ADMIN: 'admin',
} as const;

export type Role = (typeof Role)[keyof typeof Role];
