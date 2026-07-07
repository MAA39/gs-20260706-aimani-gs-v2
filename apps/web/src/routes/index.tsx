import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: HomePage,
});

function HomePage() {
  return (
    <main>
      <h1>aimani G's V2</h1>
      <p>AI壁打ちで、人につなげる</p>
    </main>
  );
}
