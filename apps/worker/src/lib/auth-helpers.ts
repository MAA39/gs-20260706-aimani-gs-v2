import { getSessionResult, resolveAuthBaseURL } from '../auth.js';
import type { SessionResult } from '../auth.js';

export type AuthBindings = {
  DB: D1Database;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
};

export type AuthenticatedSession = Extract<SessionResult, { ok: true }>;

export function buildAuthConfig(env: AuthBindings) {
  return {
    secret: env.BETTER_AUTH_SECRET,
    githubClientId: env.GITHUB_CLIENT_ID,
    githubClientSecret: env.GITHUB_CLIENT_SECRET,
  };
}

export async function getSessionForRequest(c: {
  env: AuthBindings;
  req: { raw: Request; url: string };
}): Promise<SessionResult> {
  const baseURL = resolveAuthBaseURL(c.req.raw, new URL(c.req.url).origin, c.env.BETTER_AUTH_URL);
  return getSessionResult(c.env.DB, buildAuthConfig(c.env), baseURL, c.req.raw);
}

export function authErrorResponse(session: SessionResult) {
  if (session.ok) return null;
  if (session.reason === 'auth_misconfigured') return { body: { error: 'service not configured' }, status: 503 } as const;
  if (session.reason === 'auth_failure') return { body: { error: 'authentication service error' }, status: 500 } as const;
  return { body: { error: 'authentication required' }, status: 401 } as const;
}
