import { Hono } from 'hono';

const app = new Hono();

app.get('/', (c) => c.json({ status: 'ok', service: 'aimani-gs-v2' }));

app.get('/api/health', (c) =>
  c.json({ status: 'ok', timestamp: new Date().toISOString() }),
);

export default app;
