import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useRef, useEffect } from 'react';
import {
  startChat,
  sendMessage,
  fetchMessages,
  fetchChats,
  fetchAiRunStatus,
  type ApiClientError,
  type AiRunStatus,
  type ChatMessage,
  type ChatSummary,
} from '../lib/api-client';
import { authClient } from '../lib/auth-client';

export const Route = createFileRoute('/chat')({
  component: ChatPage,
});

interface UiError {
  readonly kind: 'auth' | 'rate_limited' | 'conflict' | 'network' | 'timeout' | 'generic';
  readonly text: string;
}

function describeApiError(error: ApiClientError): UiError {
  switch (error._tag) {
    case 'HttpError':
      if (error.status === 401) {
        return { kind: 'auth', text: 'ログインの有効期限が切れました。もう一度ログインしてください。' };
      }
      if (error.status === 429) {
        return { kind: 'rate_limited', text: '送信が続きすぎています。少し待ってからもう一度お試しください。' };
      }
      if (error.status === 409 && error.code === 'AI_RUN_IN_FLIGHT') {
        return { kind: 'conflict', text: 'AIが応答を生成中です。応答が届いてから送信してください。' };
      }
      if (error.status === 409) {
        return { kind: 'conflict', text: '送信が重なりました。もう一度お試しください。' };
      }
      return { kind: 'generic', text: '送信に失敗しました。もう一度お試しください。' };
    case 'NetworkError':
      return { kind: 'network', text: 'ネットワークに接続できません。通信環境を確認して再送してください。' };
    case 'InvalidResponseBody':
      return { kind: 'generic', text: 'サーバー応答を読み取れませんでした。もう一度お試しください。' };
    default:
      return error satisfies never;
  }
}

function ChatPage() {
  const { data: session, isPending, error: sessionError } = authClient.useSession();
  // セッション取得エラー（auth未設定503等）やスタックは未ログイン扱いにして無限ローディングを防ぐ
  const [sessionTimedOut, setSessionTimedOut] = useState(false);
  useEffect(() => {
    if (!isPending) return;
    const timer = setTimeout(() => setSessionTimedOut(true), 5_000);
    return () => clearTimeout(timer);
  }, [isPending]);
  const sessionLoading = isPending && !sessionError && !sessionTimedOut;
  const navigate = useNavigate();

  useEffect(() => {
    if (!sessionLoading && !session?.user) {
      navigate({ to: '/' });
    }
  }, [session, sessionLoading, navigate]);

  const [chatId, setChatId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [waitingForAi, setWaitingForAi] = useState(false);
  const [activeAiRunId, setActiveAiRunId] = useState<string | null>(null);
  const [uiError, setUiError] = useState<UiError | null>(null);
  const queryClient = useQueryClient();
  const bottomRef = useRef<HTMLDivElement>(null);

  const [lastHumanSeq, setLastHumanSeq] = useState<number>(0);

  const messagesQuery = useQuery({
    queryKey: ['messages', chatId],
    queryFn: () => fetchMessages(chatId!),
    enabled: !!chatId && !!session?.user,
    refetchInterval: waitingForAi ? 2_000 : false,
  });

  const chatsQuery = useQuery({
    queryKey: ['chats'],
    queryFn: fetchChats,
    enabled: !chatId && !!session?.user,
  });
  const pastChats: ChatSummary[] = chatsQuery.data?.ok ? chatsQuery.data.value.chats : [];

  const aiRunQuery = useQuery({
    queryKey: ['ai-run', activeAiRunId],
    queryFn: () => fetchAiRunStatus(activeAiRunId!),
    enabled: !!activeAiRunId && waitingForAi,
    refetchInterval: 2_000,
  });
  const aiRunStatus: AiRunStatus | null = aiRunQuery.data?.ok ? aiRunQuery.data.value.status : null;

  // run終端をUIへ反映（failedは即エラー表示、completedはmessages側の到着で解除される）
  useEffect(() => {
    if (aiRunStatus === 'failed') {
      setWaitingForAi(false);
      setUiError({ kind: 'generic', text: 'AI応答の生成に失敗しました。もう一度送信してください。' });
    }
  }, [aiRunStatus]);

  const messagesResult = messagesQuery.data;
  const messages = messagesResult?.ok ? messagesResult.value.messages : [];

  useEffect(() => {
    if (!messagesResult || messagesResult.ok) return;
    if (messagesResult.error._tag === 'HttpError' && messagesResult.error.status === 401) {
      navigate({ to: '/' });
    }
  }, [messagesResult, navigate]);

  useEffect(() => {
    if (!waitingForAi) return;
    // AI応答または失敗通知(system)のどちらでも待機を解除する
    const hasReplyAfterLastHuman = messages.some(
      (m) => (m.senderType === 'ai' || m.senderType === 'system') && m.sequence > lastHumanSeq,
    );
    if (hasReplyAfterLastHuman) {
      setWaitingForAi(false);
    }
  }, [messages, waitingForAi, lastHumanSeq]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  useEffect(() => {
    if (!waitingForAi) return;
    const timeout = setTimeout(() => {
      setWaitingForAi(false);
      setUiError({ kind: 'timeout', text: 'AIの応答が届きませんでした。もう一度送信してみてください。' });
    }, 60_000);
    return () => clearTimeout(timeout);
  }, [waitingForAi]);

  const handleSendFailure = (error: ApiClientError, failedMessage: string) => {
    const described = describeApiError(error);
    setUiError(described);
    if (described.kind === 'auth') {
      navigate({ to: '/' });
      return;
    }
    // 失敗した本文を入力欄へ戻して再送しやすくする（既に入力中なら上書きしない）
    setInput((current) => current || failedMessage);
  };

  const startMutation = useMutation({
    mutationFn: (message: string) => startChat(message),
    onSuccess: (result, message) => {
      if (!result.ok) {
        handleSendFailure(result.error, message);
        return;
      }
      setUiError(null);
      setChatId(result.value.chatId);
      setLastHumanSeq(1);
      setActiveAiRunId(result.value.aiRunId);
      setWaitingForAi(true);
    },
  });

  const sendMutation = useMutation({
    mutationFn: (message: string) => sendMessage(chatId!, message),
    onSuccess: (result, message) => {
      if (!result.ok) {
        handleSendFailure(result.error, message);
        return;
      }
      setUiError(null);
      const currentMax = messages.length > 0 ? Math.max(...messages.map((m) => m.sequence)) : 0;
      setLastHumanSeq(currentMax + 1);
      setActiveAiRunId(result.value.aiRunId);
      setWaitingForAi(true);
      queryClient.invalidateQueries({ queryKey: ['messages', chatId] });
    },
  });

  const submitMessage = (message: string) => {
    const trimmed = message.trim();
    if (!trimmed) return;
    setInput('');
    setUiError(null);

    if (chatId) {
      sendMutation.mutate(trimmed);
    } else {
      startMutation.mutate(trimmed);
    }
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    submitMessage(input);
  };

  // Enter送信 / Shift+Enter改行 / 日本語IME変換確定は送信しない（v1移植パターン）
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;
    e.preventDefault();
    if (isSending || waitingForAi) return;
    submitMessage(input);
  };

  if (sessionLoading) {
    return (
      <div style={styles.container}>
        <div style={styles.empty}>
          <p style={styles.emptySubtitle}>読み込み中...</p>
        </div>
      </div>
    );
  }

  if (!session?.user) return null;

  const isSending = startMutation.isPending || sendMutation.isPending;
  const fetchFailed = messagesResult !== undefined && !messagesResult.ok;

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
              setUiError(null);
            }}
          >
            新しい壁打ち
          </button>
        )}
      </header>

      <main style={styles.messages}>
        {!chatId && messages.length === 0 && (
          <div style={styles.empty}>
            <p style={styles.emptyTitle}>何に困っていますか？</p>
            <p style={styles.emptySubtitle}>壁打ちAIが思考の整理を手伝います</p>
            <div style={styles.starterButtons}>
              {['課題で詰まっている', 'チーム開発の困りごと', '進路・キャリア', 'メンター面談の準備'].map((category) => (
                <button
                  key={category}
                  type="button"
                  style={styles.starterButton}
                  onClick={() => submitMessage(category)}
                  disabled={isSending}
                >
                  {category}
                </button>
              ))}
            </div>
            <p style={styles.privacyNote}>AIに話した内容は、あなたが出すまで誰にも見えません</p>
            {pastChats.length > 0 && (
              <div style={styles.historySection}>
                <p style={styles.historyTitle}>前回の続きから</p>
                {pastChats.slice(0, 5).map((chat) => (
                  <button
                    key={chat.id}
                    type="button"
                    style={styles.historyItem}
                    onClick={() => {
                      setChatId(chat.id);
                      setUiError(null);
                    }}
                  >
                    <span style={styles.historyItemTitle}>{chat.title || '（無題の壁打ち）'}</span>
                    <span style={styles.historyItemDate}>
                      {new Date(chat.updatedAt).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {chatId && messagesQuery.isPending && (
          <div style={styles.empty}>
            <p style={styles.emptySubtitle}>会話を読み込んでいます...</p>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {waitingForAi && (
          <div style={{ ...styles.bubble, ...styles.aiBubble }}>
            <span style={styles.typing}>{describeAiRunStatus(aiRunStatus)}</span>
          </div>
        )}

        {fetchFailed && (
          <div style={styles.errorBanner}>
            会話の取得に失敗しました。
            <button style={styles.retryButton} onClick={() => messagesQuery.refetch()}>
              再読み込み
            </button>
          </div>
        )}

        {uiError && <div style={styles.errorBanner}>{uiError.text}</div>}

        <div ref={bottomRef} />
      </main>

      <form style={styles.inputArea} onSubmit={handleSubmit}>
        <textarea
          style={styles.input}
          rows={2}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="困っていることを書いてください..."
          disabled={isSending}
        />
        <button style={styles.sendButton} type="submit" disabled={isSending || waitingForAi || !input.trim()}>
          {isSending ? '送信中...' : waitingForAi ? 'AI応答待ち' : '送る'}
        </button>
      </form>
    </div>
  );
}

// 進捗文言はv1で検証済みのコピーを採用（docs/review/2026-07-08-v1-frontend-adoption.md）
function describeAiRunStatus(status: AiRunStatus | null): string {
  switch (status) {
    case null:
    case 'queued':
    case 'admitted':
      return '接続中...';
    case 'generating':
      return 'AIが相談の材料を整理しています...';
    case 'repairing':
      return '形式を整えています...';
    case 'completed':
      return '応答を受け取っています...';
    case 'failed':
      return 'エラーが発生しました';
    default:
      return status satisfies never;
  }
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isHuman = message.senderType === 'human';
  const isSystem = message.senderType === 'system';
  return (
    <div
      style={{
        ...styles.bubble,
        ...(isHuman ? styles.humanBubble : isSystem ? styles.systemBubble : styles.aiBubble),
      }}
    >
      <div style={styles.senderLabel}>{isHuman ? 'あなた' : isSystem ? 'システム' : 'AI'}</div>
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
  starterButtons: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    justifyContent: 'center',
    gap: 8,
    marginTop: 20,
    maxWidth: 480,
  },
  starterButton: {
    padding: '10px 16px',
    fontSize: 14,
    border: '1px solid #ccc',
    borderRadius: 20,
    background: 'white',
    color: '#333',
    cursor: 'pointer',
  },
  privacyNote: {
    fontSize: 12,
    color: '#999',
    marginTop: 24,
  },
  historySection: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 6,
    marginTop: 28,
    width: '100%',
    maxWidth: 420,
  },
  historyTitle: {
    fontSize: 12,
    fontWeight: 600,
    color: '#999',
    margin: '0 0 4px',
    textAlign: 'center' as const,
  },
  historyItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    padding: '10px 14px',
    fontSize: 13,
    border: '1px solid #e0e0e0',
    borderRadius: 10,
    background: 'white',
    color: '#333',
    cursor: 'pointer',
    textAlign: 'left' as const,
  },
  historyItemTitle: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  historyItemDate: {
    fontSize: 11,
    color: '#999',
    flexShrink: 0,
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
  systemBubble: {
    alignSelf: 'center',
    background: '#fff8e6',
    color: '#8a6d1a',
    border: '1px solid #f0e0b0',
    fontSize: 13,
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
  errorBanner: {
    padding: '8px 14px',
    borderRadius: 8,
    background: '#fee',
    color: '#c00',
    fontSize: 13,
    textAlign: 'center' as const,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  retryButton: {
    padding: '4px 10px',
    fontSize: 12,
    border: '1px solid #c00',
    borderRadius: 6,
    background: 'white',
    color: '#c00',
    cursor: 'pointer',
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
    resize: 'none' as const,
    fontFamily: 'inherit',
    lineHeight: 1.5,
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
