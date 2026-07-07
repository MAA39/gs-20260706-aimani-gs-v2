import { Hono } from 'hono';
import { flue } from '@flue/runtime/routing';
import { chatRoutes } from './routes/chat.js';
import { memberRoutes } from './routes/member.js';

export interface Env {
  DB: D1Database;
  SAKURA_API_TOKEN: string;
  FLUE_SPARRING_AGENT: DurableObjectNamespace;
  FLUE_SPARRING_WORKFLOW: DurableObjectNamespace;
  FLUE_REGISTRY: DurableObjectNamespace;
}

export type AppFetch = (request: Request, env: Env, ctx: ExecutionContext) => Response | Promise<Response>;

export interface AppVars {
  appFetch: AppFetch;
}

const app = new Hono<{ Bindings: Env; Variables: AppVars }>();

app.use('/api/*', async (c, next) => {
  c.set('appFetch', (req, env, ctx) => app.fetch(req, env, ctx));
  return next();
});

app.get('/', (c) => c.json({ status: 'ok', service: 'aimani-gs-v2' }));
app.get('/api/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.route('/api/chats', chatRoutes);
app.route('/api/members', memberRoutes);

app.route('/', flue());

export default app;
