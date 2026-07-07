import { Hono } from 'hono';
import type { Env } from '../app.js';
import type { MemberId } from '@gs-v2/shared';
import { parseMemberId } from '@gs-v2/shared';
import { parseCreateMemberRequest } from '@gs-v2/contracts';
import type { MemberError } from '@gs-v2/domain';
import { D1MemberRepository } from '@gs-v2/db';
import { getSessionForRequest } from '../lib/auth-helpers.js';

export const memberRoutes = new Hono<{ Bindings: Env }>();

interface HttpFailure {
  readonly status: 404 | 409 | 500;
  readonly body: { readonly code: string; readonly message: string };
}

function memberErrorToHttp(error: MemberError): HttpFailure {
  switch (error._tag) {
    case 'MemberNotFound':
      return { status: 404, body: { code: 'MEMBER_NOT_FOUND', message: `Member ${error.memberId} not found` } };
    case 'MemberAlreadyExists':
      return { status: 409, body: { code: 'MEMBER_ALREADY_EXISTS', message: `Member ${error.memberId} already exists` } };
    case 'MemberDbFailure':
      return { status: 500, body: { code: 'INTERNAL_ERROR', message: error._tag } };
    default:
      return error satisfies never;
  }
}

memberRoutes.post('/', async (c) => {
  let rawBody: unknown;
  try {
    rawBody = await c.req.json();
  } catch {
    return c.json({ code: 'INVALID_REQUEST', message: 'request body must be valid JSON' }, 400);
  }

  const parsed = parseCreateMemberRequest(rawBody);
  if (!parsed.ok) {
    return c.json({ code: 'INVALID_REQUEST', message: `${parsed.error.field} ${parsed.error.reason}` }, 400);
  }

  const repo = new D1MemberRepository(c.env.DB);
  const session = await getSessionForRequest(c);
  const memberId = (session.ok ? session.user.id : crypto.randomUUID()) as MemberId;
  const result = await repo.create(memberId, {
    displayName: parsed.value.displayName,
    role: 'student',
    bio: parsed.value.bio,
    skills: parsed.value.skills,
    canHelpWith: parsed.value.canHelpWith,
    wantsHelpWith: parsed.value.wantsHelpWith,
    githubUrl: parsed.value.githubUrl,
    xUrl: parsed.value.xUrl,
    facebookUrl: parsed.value.facebookUrl,
  });

  if (!result.ok) {
    const failure = memberErrorToHttp(result.error);
    return c.json(failure.body, failure.status);
  }

  return c.json(result.value, 201);
});

memberRoutes.get('/:memberId', async (c) => {
  const memberIdResult = parseMemberId(c.req.param('memberId'));
  if (!memberIdResult.ok) {
    return c.json({ code: 'INVALID_REQUEST', message: `memberId ${memberIdResult.reason}` }, 400);
  }

  const repo = new D1MemberRepository(c.env.DB);
  const result = await repo.findById(memberIdResult.value);

  if (!result.ok) {
    const failure = memberErrorToHttp(result.error);
    return c.json(failure.body, failure.status);
  }

  return c.json(result.value);
});
