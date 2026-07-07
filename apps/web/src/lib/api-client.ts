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

export async function startChat(message: string): Promise<StartChatResponse> {
  const res = await fetch(`${API_BASE}/chats`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  if (!res.ok) throw new Error(`startChat failed: ${res.status}`);
  return res.json();
}

export async function sendMessage(chatId: string, message: string): Promise<SendMessageResponse> {
  const res = await fetch(`${API_BASE}/chats/${chatId}/messages`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  if (!res.ok) throw new Error(`sendMessage failed: ${res.status}`);
  return res.json();
}

export async function fetchMessages(chatId: string): Promise<MessagesResponse> {
  const res = await fetch(`${API_BASE}/chats/${chatId}/messages`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`fetchMessages failed: ${res.status}`);
  return res.json();
}
