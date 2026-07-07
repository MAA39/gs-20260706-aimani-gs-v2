import { Hono } from 'hono';
import type { Context } from 'hono';
import { flue } from '@flue/runtime/routing';
import { chatRoutes } from './routes/chat.js';
import { memberRoutes } from './routes/member.js';
import { createAuth, resolveAuthBaseURL } from './auth.js';
import { jsonBodyLimit, BODY_LIMITS } from './middleware/body-limit.js';

interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  DB: D1Database;
  SAKURA_API_TOKEN: string;
  FLUE_SPARRING_AGENT: DurableObjectNamespace;
  FLUE_SPARRING_WORKFLOW: DurableObjectNamespace;
  FLUE_REGISTRY: DurableObjectNamespace;
  INTERNAL_ROUTE_SECRET: string;
  CHAT_RATE_LIMITER: RateLimiter;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
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

const authHandler = async (c: Context<{ Bindings: Env; Variables: AppVars }>) => {
  if (!c.env?.BETTER_AUTH_SECRET?.trim()) {
    return c.json({ error: 'service not configured' }, 503);
  }
  if (!c.env?.GITHUB_CLIENT_ID?.trim() || !c.env?.GITHUB_CLIENT_SECRET?.trim()) {
    return c.json({ error: 'github oauth not configured' }, 503);
  }

  const baseURL = resolveAuthBaseURL(c.req.raw, new URL(c.req.url).origin, c.env.BETTER_AUTH_URL);
  const auth = await createAuth(c.env.DB, {
    secret: c.env.BETTER_AUTH_SECRET,
    baseURL,
    githubClientId: c.env.GITHUB_CLIENT_ID,
    githubClientSecret: c.env.GITHUB_CLIENT_SECRET,
  });
  return auth.handler(c.req.raw);
};

app.on(['GET'], '/api/auth/**', authHandler);
app.on(['POST'], '/api/auth/**', jsonBodyLimit(BODY_LIMITS.auth), authHandler);

const INTERNAL_ROUTE_PREFIXES = ['/workflows/', '/runs/', '/agents/', '/channels/'];
const INTERNAL_HOSTNAME_ALLOWLIST = ['internal', 'localhost', '127.0.0.1', '[::1]', '::1', 'agent'];

app.use('*', async (c, next) => {
  const path = new URL(c.req.url).pathname;
  const isInternalRoute = path === '/openapi.json' || INTERNAL_ROUTE_PREFIXES.some((prefix) => path.startsWith(prefix));
  if (!isInternalRoute) {
    return next();
  }

  const hostname = new URL(c.req.url).hostname;
  const hasValidHostname = INTERNAL_HOSTNAME_ALLOWLIST.includes(hostname);
  const hasValidToken = c.req.header('x-internal-token') === c.env.INTERNAL_ROUTE_SECRET;
  if (!hasValidHostname && !hasValidToken) {
    return c.notFound();
  }

  return next();
});

app.route('/', flue());

export default app;
