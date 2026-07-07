import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useRef, useEffect } from 'react';
import {
  createMember,
  startChat,
  sendMessage,
  fetchMessages,
  type ChatMessage,
} from '../lib/api-client';

export const Route = createFileRoute('/chat')({
  component: ChatPage,
});

const MEMBER_KEY = 'aimani-member-id';

function useMemberId() {
  const [memberId, setMemberId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(MEMBER_KEY);
  });

  const ensure = async () => {
    if (memberId) return memberId;
    const member = await createMember(`user-${Date.now()}`);
    localStorage.setItem(MEMBER_KEY, member.id);
    setMemberId(member.id);
    return member.id;
  };

  return { memberId, ensure };
}

function ChatPage() {
  const [chatId, setChatId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [waitingForAi, setWaitingForAi] = useState(false);
  const member = useMemberId();
  const queryClient = useQueryClient();
  const bottomRef = useRef<HTMLDivElement>(null);

  const messagesQuery = useQuery({
    queryKey: ['messages', chatId],
    queryFn: () => fetchMessages(chatId!),
    enabled: !!chatId,
    refetchInterval: waitingForAi ? 2_000 : false,
  });

  const messages = messagesQuery.data?.messages ?? [];

  useEffect(() => {
    if (!waitingForAi) return;
    const hasAiReply = messages.some((m) => m.senderType === 'ai');
    const lastMsg = messages[messages.length - 1];
    if (hasAiReply && lastMsg?.senderType === 'ai') {
      setWaitingForAi(false);
    }
  }, [messages, waitingForAi]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const startMutation = useMutation({
    mutationFn: async (message: string) => {
      const mid = await member.ensure();
      return startChat(mid, message);
    },
    onSuccess: (data) => {
      setChatId(data.chatId);
      setWaitingForAi(true);
    },
  });

  const sendMutation = useMutation({
    mutationFn: async (message: string) => {
      const mid = await member.ensure();
      return sendMessage(chatId!, mid, message);
    },
    onSuccess: () => {
      setWaitingForAi(true);
      queryClient.invalidateQueries({ queryKey: ['messages', chatId] });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;
    setInput('');

    if (chatId) {
      sendMutation.mutate(trimmed);
    } else {
      startMutation.mutate(trimmed);
    }
  };

  const isSending = startMutation.isPending || sendMutation.isPending;

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>aimani 壁打ち</h1>
        {chatId && (
          <button
            style={styles.newChatButton}
            onClick={() => {
              setChatId(null);
              setWaitingForAi(false);
            }}
          >
            新しい壁打ち
          </button>
        )}
      </header>

      <main style={styles.messages}>
        {!chatId && messages.length === 0 && (
          <div style={styles.empty}>
            <p style={styles.emptyTitle}>何に詰まっていますか？</p>
            <p style={styles.emptySubtitle}>壁打ちAIが思考の整理を手伝います</p>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {waitingForAi && (
          <div style={{ ...styles.bubble, ...styles.aiBubble }}>
            <span style={styles.typing}>考え中...</span>
          </div>
        )}

        <div ref={bottomRef} />
      </main>

      <form style={styles.inputArea} onSubmit={handleSubmit}>
        <input
          style={styles.input}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="詰まっていること、考えていることを書いてみてください"
          disabled={isSending}
        />
        <button style={styles.sendButton} type="submit" disabled={isSending || !input.trim()}>
          送信
        </button>
      </form>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isHuman = message.senderType === 'human';
  return (
    <div
      style={{
        ...styles.bubble,
        ...(isHuman ? styles.humanBubble : styles.aiBubble),
      }}
    >
      <div style={styles.senderLabel}>{isHuman ? 'あなた' : 'AI'}</div>
      <div style={styles.messageBody}>{message.body}</div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    maxWidth: 720,
    margin: '0 auto',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderBottom: '1px solid #e0e0e0',
  },
  title: {
    fontSize: 18,
    fontWeight: 600,
    margin: 0,
  },
  newChatButton: {
    padding: '6px 12px',
    fontSize: 13,
    border: '1px solid #ccc',
    borderRadius: 6,
    background: 'white',
    cursor: 'pointer',
  },
  messages: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    color: '#666',
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 600,
    margin: '0 0 8px',
  },
  emptySubtitle: {
    fontSize: 14,
    margin: 0,
  },
  bubble: {
    padding: '10px 14px',
    borderRadius: 12,
    maxWidth: '80%',
    lineHeight: 1.5,
    fontSize: 14,
  },
  humanBubble: {
    alignSelf: 'flex-end',
    background: '#007AFF',
    color: 'white',
  },
  aiBubble: {
    alignSelf: 'flex-start',
    background: '#f0f0f0',
    color: '#333',
  },
  senderLabel: {
    fontSize: 11,
    fontWeight: 600,
    marginBottom: 2,
    opacity: 0.7,
  },
  messageBody: {
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  typing: {
    opacity: 0.6,
    fontStyle: 'italic',
  },
  inputArea: {
    display: 'flex',
    gap: 8,
    padding: '12px 16px',
    borderTop: '1px solid #e0e0e0',
  },
  input: {
    flex: 1,
    padding: '10px 14px',
    fontSize: 14,
    border: '1px solid #ccc',
    borderRadius: 8,
    outline: 'none',
  },
  sendButton: {
    padding: '10px 20px',
    fontSize: 14,
    fontWeight: 600,
    border: 'none',
    borderRadius: 8,
    background: '#007AFF',
    color: 'white',
    cursor: 'pointer',
  },
};
