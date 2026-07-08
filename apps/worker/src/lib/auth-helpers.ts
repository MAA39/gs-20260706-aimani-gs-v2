import { getSessionResult, resolveAuthBaseURL } from '../auth.js';
import type { SessionResult } from '../auth.js';

export type AuthBindings = {
  DB: D1Database;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  /** ローカル開発専用。OAuth App未設定でE2Eを確認するための偽装ユーザーID。本番には絶対に設定しない */
  DEV_AUTH_BYPASS_USER_ID?: string;
};

export function devBypassSession(env: Pick<AuthBindings, 'DEV_AUTH_BYPASS_USER_ID'>): AuthenticatedSession | null {
  const bypassUserId = env.DEV_AUTH_BYPASS_USER_ID?.trim();
  if (!bypassUserId) return null;
  return { ok: true, user: { id: bypassUserId, name: 'Devユーザー', email: null } };
}

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
  const bypass = devBypassSession(c.env);
  if (bypass) return bypass;

  const baseURL = resolveAuthBaseURL(c.req.raw, new URL(c.req.url).origin, c.env.BETTER_AUTH_URL);
  return getSessionResult(c.env.DB, buildAuthConfig(c.env), baseURL, c.req.raw);
}

export function authErrorResponse(session: SessionResult) {
  if (session.ok) return null;
  if (session.reason === 'auth_misconfigured') return { body: { error: 'service not configured' }, status: 503 } as const;
  if (session.reason === 'auth_failure') return { body: { error: 'authentication service error' }, status: 500 } as const;
  return { body: { error: 'authentication required' }, status: 401 } as const;
}
