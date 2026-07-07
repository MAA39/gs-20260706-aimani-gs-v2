const API_BASE = '/api';

interface ChatMessage {
  id: string;
  chatId: string;
  senderType: 'human' | 'ai';
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

export type { ChatMessage, StartChatResponse, SendMessageResponse, MessagesResponse };

export async function createMember(displayName: string): Promise<{ id: string; displayName: string }> {
  const res = await fetch(`${API_BASE}/members`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName, role: 'student' }),
  });
  if (!res.ok) throw new Error(`createMember failed: ${res.status}`);
  return res.json();
}

export async function startChat(memberId: string, message: string): Promise<StartChatResponse> {
  const res = await fetch(`${API_BASE}/chats`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': memberId,
    },
    body: JSON.stringify({ message }),
  });
  if (!res.ok) throw new Error(`startChat failed: ${res.status}`);
  return res.json();
}

export async function sendMessage(chatId: string, memberId: string, message: string): Promise<SendMessageResponse> {
  const res = await fetch(`${API_BASE}/chats/${chatId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': memberId,
    },
    body: JSON.stringify({ message }),
  });
  if (!res.ok) throw new Error(`sendMessage failed: ${res.status}`);
  return res.json();
}

export async function fetchMessages(chatId: string, memberId: string): Promise<MessagesResponse> {
  const res = await fetch(`${API_BASE}/chats/${chatId}/messages`, {
    headers: { 'x-user-id': memberId },
  });
  if (!res.ok) throw new Error(`fetchMessages failed: ${res.status}`);
  return res.json();
}
