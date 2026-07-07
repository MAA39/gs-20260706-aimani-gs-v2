export const ErrorCode = {
  MEMBER_NOT_FOUND: 'MEMBER_NOT_FOUND',
  CHAT_NOT_FOUND: 'CHAT_NOT_FOUND',
  CHAT_ARCHIVED: 'CHAT_ARCHIVED',
  AI_RUN_NOT_FOUND: 'AI_RUN_NOT_FOUND',
  INVALID_REQUEST: 'INVALID_REQUEST',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface ApiError {
  readonly code: ErrorCode;
  readonly message: string;
}
