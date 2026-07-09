const API_BASE = '/api';

interface ChatMessage {
  id: string;
  chatId: string;
  senderType: 'human' | 'ai' | 'system';
  body: string;
  sequence: number;
  createdAt: string;
}

interface StartChatResponse {
  chatId: string;
  messageId: string;
  aiRunId: string;
}

interface SendMessageResponse {
  messageId: string;
  aiRunId: string;
}

interface MessagesResponse {
  chatId: string;
  messages: ChatMessage[];
}

interface ChatSummary {
  id: string;
  title: string | null;
  status: 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
}

interface ChatListResponse {
  chats: ChatSummary[];
}

type AiRunStatus = 'queued' | 'admitted' | 'generating' | 'repairing' | 'completed' | 'failed';

interface AiRunStatusResponse {
  aiRunId: string;
  status: AiRunStatus;
  errorMessage: string | null;
}

export type ApiClientError =
  | { _tag: 'HttpError'; status: number; code: string; message: string }
  | { _tag: 'NetworkError'; message: string }
  | { _tag: 'InvalidResponseBody' };

export type ApiResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ApiClientError };

export type { ChatMessage, StartChatResponse, SendMessageResponse, MessagesResponse, ChatSummary, ChatListResponse, AiRunStatus, AiRunStatusResponse };

async function readErrorBody(res: Response): Promise<{ code: string; message: string }> {
  try {
    const body: unknown = await res.json();
    if (typeof body === 'object' && body !== null) {
      const record = body as Record<string, unknown>;
      return {
        code: typeof record.code === 'string' ? record.code : 'UNKNOWN',
        message: typeof record.message === 'string' ? record.message : `HTTP ${res.status}`,
      };
    }
  } catch {
    // 本文がJSONでない場合はステータスのみで報告する
  }
  return { code: 'UNKNOWN', message: `HTTP ${res.status}` };
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { credentials: 'include', ...init });
  } catch (cause) {
    return {
      ok: false,
      error: { _tag: 'NetworkError', message: cause instanceof Error ? cause.message : 'fetch failed' },
    };
  }

  if (!res.ok) {
    const { code, message } = await readErrorBody(res);
    return { ok: false, error: { _tag: 'HttpError', status: res.status, code, message } };
  }

  try {
    return { ok: true, value: (await res.json()) as T };
  } catch {
    return { ok: false, error: { _tag: 'InvalidResponseBody' } };
  }
}

export function startChat(message: string): Promise<ApiResult<StartChatResponse>> {
  return requestJson<StartChatResponse>('/chats', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
}

export function sendMessage(chatId: string, message: string): Promise<ApiResult<SendMessageResponse>> {
  return requestJson<SendMessageResponse>(`/chats/${chatId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
}

export function fetchMessages(chatId: string): Promise<ApiResult<MessagesResponse>> {
  return requestJson<MessagesResponse>(`/chats/${chatId}/messages`);
}

export function fetchChats(): Promise<ApiResult<ChatListResponse>> {
  return requestJson<ChatListResponse>('/chats');
}

export function fetchAiRunStatus(aiRunId: string): Promise<ApiResult<AiRunStatusResponse>> {
  return requestJson<AiRunStatusResponse>(`/ai-runs/${aiRunId}`);
}
