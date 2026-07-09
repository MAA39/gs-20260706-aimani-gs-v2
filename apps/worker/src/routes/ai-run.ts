import { Hono } from 'hono';
import type { Env, AppVars } from '../app.js';
import { parseAiRunId, parseMemberId } from '@gs-v2/shared';
import { getAiRunStatus } from '@gs-v2/domain';
import type { GetAiRunStatusError } from '@gs-v2/domain';
import { D1ChatRepository, D1AiRunRepository } from '@gs-v2/db';
import { getSessionForRequest, authErrorResponse } from '../lib/auth-helpers.js';

export const aiRunRoutes = new Hono<{ Bindings: Env; Variables: AppVars }>();

interface HttpFailure {
  readonly status: 404 | 409 | 500;
  readonly body: { readonly code: string; readonly message: string };
}

function aiRunErrorToHttp(error: GetAiRunStatusError): HttpFailure {
  switch (error._tag) {
    // 不存在と他人のrunでbodyを揃える（存在確認oracle対策、chat側と同方針。R3-07）
    case 'AiRunNotFound':
    case 'ChatNotOwned':
    case 'ChatNotFound':
      return { status: 404, body: { code: 'AI_RUN_NOT_FOUND', message: 'AI run not found' } };
    case 'ChatArchived':
      return { status: 409, body: { code: 'CHAT_ARCHIVED', message: `Chat ${error.chatId} is archived` } };
    case 'AiRunConflict':
      return { status: 409, body: { code: 'AI_RUN_CONFLICT', message: `AI run conflict: ${error.reason}` } };
    case 'InvalidAiRunTransition':
    case 'ChatDbFailure':
    case 'AiRunDbFailure':
      return { status: 500, body: { code: 'INTERNAL_ERROR', message: error._tag } };
    default:
      return error satisfies never;
  }
}

aiRunRoutes.get('/:aiRunId', async (c) => {
  const session = await getSessionForRequest(c);
  if (!session.ok) {
    const error = authErrorResponse(session);
    return c.json(error!.body, error!.status);
  }

  const aiRunIdResult = parseAiRunId(c.req.param('aiRunId'));
  if (!aiRunIdResult.ok) {
    return c.json({ code: 'INVALID_REQUEST', message: `aiRunId ${aiRunIdResult.reason}` }, 400);
  }

  const memberIdResult = parseMemberId(session.user.id);
  if (!memberIdResult.ok) {
    return c.json({ code: 'INTERNAL_ERROR', message: 'invalid session user id' }, 500);
  }

  const deps = {
    aiRunRepo: new D1AiRunRepository(c.env.DB),
    chatRepo: new D1ChatRepository(c.env.DB),
  };

  const result = await getAiRunStatus(deps, memberIdResult.value, aiRunIdResult.value);
  if (!result.ok) {
    const failure = aiRunErrorToHttp(result.error);
    return c.json(failure.body, failure.status);
  }

  return c.json({
    aiRunId: result.value.id,
    status: result.value.status,
    errorMessage: result.value.errorMessage,
  });
});
