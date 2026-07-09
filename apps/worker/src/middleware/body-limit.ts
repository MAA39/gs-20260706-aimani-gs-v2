import { bodyLimit } from 'hono/body-limit';

export const BODY_LIMITS = {
  /** POST /api/auth/** */
  auth: 10 * 1024,
  /** POST /api/chats, /api/members — message上限4000字(UTF-8で最大約16KB)+JSON外殻の余裕 */
  api: 32 * 1024,
} as const;

/** JSON 413 を返す bodyLimit middleware factory */
export const jsonBodyLimit = (maxSize: number) =>
  bodyLimit({
    maxSize,
    onError: (c) => c.json({ code: 'PAYLOAD_TOO_LARGE', message: 'payload too large' }, 413),
  });
