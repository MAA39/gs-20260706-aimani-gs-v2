import { Hono } from 'hono';
import type { Env } from '../index.js';
import type { MemberId } from '@gs-v2/shared';
import type { CreateMemberRequest } from '@gs-v2/contracts';
import { D1MemberRepository } from '@gs-v2/db';

export const memberRoutes = new Hono<{ Bindings: Env }>();

memberRoutes.post('/', async (c) => {
  const body = await c.req.json<CreateMemberRequest>();
  if (!body.displayName?.trim() || !body.role) {
    return c.json({ code: 'INVALID_REQUEST', message: 'displayName and role are required' }, 400);
  }

  const repo = new D1MemberRepository(c.env.DB);
  const memberId = crypto.randomUUID() as MemberId;
  const result = await repo.create(memberId, {
    displayName: body.displayName,
    role: body.role,
    bio: body.bio,
    skills: body.skills,
    canHelpWith: body.canHelpWith,
    wantsHelpWith: body.wantsHelpWith,
    githubUrl: body.githubUrl,
    xUrl: body.xUrl,
    facebookUrl: body.facebookUrl,
  });

  if (!result.ok) {
    return c.json({ code: 'INTERNAL_ERROR', message: result.error._tag }, 500);
  }

  return c.json(result.value, 201);
});

memberRoutes.get('/:memberId', async (c) => {
  const memberId = c.req.param('memberId') as MemberId;
  const repo = new D1MemberRepository(c.env.DB);
  const result = await repo.findById(memberId);

  if (!result.ok) {
    return c.json({ code: 'MEMBER_NOT_FOUND', message: `Member ${memberId} not found` }, 404);
  }

  return c.json(result.value);
});
