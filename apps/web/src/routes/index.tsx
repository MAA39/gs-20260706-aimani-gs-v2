import { createFileRoute, Link } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: HomePage,
});

function HomePage() {
  return (
    <main style={styles.container}>
      <h1 style={styles.title}>aimani G's V2</h1>
      <p style={styles.subtitle}>AI壁打ちで、人につなげる</p>
      <Link to="/chat" style={styles.startButton}>
        壁打ちを始める
      </Link>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  title: {
    fontSize: 32,
    fontWeight: 700,
    margin: '0 0 8px',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    margin: '0 0 32px',
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
};
