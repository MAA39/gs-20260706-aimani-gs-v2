import { bodyLimit } from 'hono/body-limit';

export const BODY_LIMITS = {
  /** POST /api/auth/** */
  auth: 10 * 1024,
} as const;

/** JSON 413 を返す bodyLimit middleware factory */
export const jsonBodyLimit = (maxSize: number) =>
  bodyLimit({
    maxSize,
    onError: (c) => c.json({ error: 'payload too large' }, 413),
  });
