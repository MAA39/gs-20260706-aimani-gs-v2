import { createFileRoute, Link } from '@tanstack/react-router';
import { authClient, signInWithGitHub } from '../lib/auth-client';

export const Route = createFileRoute('/')({
  component: HomePage,
});

function HomePage() {
  const { data: session, isPending } = authClient.useSession();
  const isLoggedIn = !!session?.user;
  const chatUrl = typeof window !== 'undefined' ? `${window.location.origin}/chat` : '/chat';

  return (
    <main style={styles.container}>
      <h1 style={styles.title}>aimani G's V2</h1>
      <p style={styles.subtitle}>AI壁打ちで、人につなげる</p>
      {isLoggedIn ? (
        <Link to="/chat" style={styles.startButton}>
          壁打ちを始める
        </Link>
      ) : (
        // 未ログインで/chatへ送ると弾き返されて信頼を落とすので、ログイン→そのままチャットへ一本化
        <button
          style={{ ...styles.startButton, ...styles.startButtonAsButton }}
          disabled={isPending}
          onClick={() => signInWithGitHub(chatUrl)}
        >
          {isPending ? '確認中...' : 'GitHubでログインして始める'}
        </button>
      )}
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100dvh',
    padding: '0 16px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  title: {
    fontSize: 32,
    fontWeight: 700,
    margin: '0 0 8px',
    textAlign: 'center' as const,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    margin: '0 0 32px',
    textAlign: 'center' as const,
  },
  startButton: {
    display: 'inline-block',
    padding: '12px 32px',
    fontSize: 16,
    fontWeight: 600,
    color: 'white',
    background: '#007AFF',
    borderRadius: 8,
    textDecoration: 'none',
  },
  startButtonAsButton: {
    border: 'none',
    cursor: 'pointer',
  },
};
