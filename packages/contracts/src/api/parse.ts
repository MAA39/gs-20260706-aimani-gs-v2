import type { StartChatRequest, SendMessageRequest } from './chat.js';
import type { CreateMemberRequest } from './member.js';

export const MAX_MESSAGE_LENGTH = 4000;
export const MAX_DISPLAY_NAME_LENGTH = 100;

export interface RequestParseError {
  readonly _tag: 'RequestParseError';
  readonly field: string;
  readonly reason: string;
}

export type ParseResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: RequestParseError };

function parseFailure<T>(field: string, reason: string): ParseResult<T> {
  return { ok: false, error: { _tag: 'RequestParseError', field, reason } };
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}

function parseMessageField(input: Record<string, unknown>): ParseResult<string> {
  const message = input['message'];
  if (typeof message !== 'string') return parseFailure('message', 'must be a string');
  if (message.trim().length === 0) return parseFailure('message', 'is required');
  if (message.length > MAX_MESSAGE_LENGTH) {
    return parseFailure('message', `must be at most ${MAX_MESSAGE_LENGTH} chars`);
  }
  return { ok: true, value: message };
}

export function parseStartChatRequest(input: unknown): ParseResult<StartChatRequest> {
  if (!isRecord(input)) return parseFailure('body', 'must be a JSON object');
  const message = parseMessageField(input);
  if (!message.ok) return message;
  return { ok: true, value: { message: message.value } };
}

export function parseSendMessageRequest(input: unknown): ParseResult<SendMessageRequest> {
  if (!isRecord(input)) return parseFailure('body', 'must be a JSON object');
  const message = parseMessageField(input);
  if (!message.ok) return message;
  return { ok: true, value: { message: message.value } };
}

function parseOptionalString(
  input: Record<string, unknown>,
  field: string,
): ParseResult<string | undefined> {
  const value = input[field];
  if (value === undefined || value === null) return { ok: true, value: undefined };
  if (typeof value !== 'string') return parseFailure(field, 'must be a string');
  return { ok: true, value };
}

function parseOptionalStringArray(
  input: Record<string, unknown>,
  field: string,
): ParseResult<readonly string[] | undefined> {
  const value = input[field];
  if (value === undefined || value === null) return { ok: true, value: undefined };
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
    return parseFailure(field, 'must be an array of strings');
  }
  return { ok: true, value };
}

export function parseCreateMemberRequest(input: unknown): ParseResult<CreateMemberRequest> {
  if (!isRecord(input)) return parseFailure('body', 'must be a JSON object');

  const displayName = input['displayName'];
  if (typeof displayName !== 'string' || displayName.trim().length === 0) {
    return parseFailure('displayName', 'is required');
  }
  if (displayName.length > MAX_DISPLAY_NAME_LENGTH) {
    return parseFailure('displayName', `must be at most ${MAX_DISPLAY_NAME_LENGTH} chars`);
  }

  const bio = parseOptionalString(input, 'bio');
  if (!bio.ok) return bio;
  const githubUrl = parseOptionalString(input, 'githubUrl');
  if (!githubUrl.ok) return githubUrl;
  const xUrl = parseOptionalString(input, 'xUrl');
  if (!xUrl.ok) return xUrl;
  const facebookUrl = parseOptionalString(input, 'facebookUrl');
  if (!facebookUrl.ok) return facebookUrl;

  const skills = parseOptionalStringArray(input, 'skills');
  if (!skills.ok) return skills;
  const canHelpWith = parseOptionalStringArray(input, 'canHelpWith');
  if (!canHelpWith.ok) return canHelpWith;
  const wantsHelpWith = parseOptionalStringArray(input, 'wantsHelpWith');
  if (!wantsHelpWith.ok) return wantsHelpWith;

  return {
    ok: true,
    value: {
      displayName,
      bio: bio.value,
      skills: skills.value,
      canHelpWith: canHelpWith.value,
      wantsHelpWith: wantsHelpWith.value,
      githubUrl: githubUrl.value,
      xUrl: xUrl.value,
      facebookUrl: facebookUrl.value,
    },
  };
}
