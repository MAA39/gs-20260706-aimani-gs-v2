import { Hono } from 'hono';
import type { Env, AppVars } from '../app.js';
import type { MemberId, ChatId } from '@gs-v2/shared';
import type { StartChatRequest, SendMessageRequest } from '@gs-v2/contracts';
import { startChat } from '@gs-v2/domain';
import { sendMessage } from '@gs-v2/domain';
import { D1ChatRepository } from '@gs-v2/db';
import { D1MemberRepository } from '@gs-v2/db';
import { D1AiRunRepository } from '@gs-v2/db';
import { getSessionForRequest, authErrorResponse } from '../lib/auth-helpers.js';
import type { AuthenticatedSession } from '../lib/auth-helpers.js';

export const chatRoutes = new Hono<{ Bindings: Env; Variables: AppVars }>();

async function ensureMemberForSession(memberRepo: D1MemberRepository, session: AuthenticatedSession): Promise<MemberId> {
  const memberId = session.user.id as MemberId;
  const existing = await memberRepo.findById(memberId);
  if (existing.ok) return memberId;

  const created = await memberRepo.create(memberId, {
    displayName: session.user.name || session.user.email || memberId,
    role: 'student',
  });
  if (!created.ok) throw new Error(`failed to auto-create member for session user ${memberId}`);
  return memberId;
}

function triggerWorkflow(appFetch: AppVars['appFetch'], env: Env, executionCtx: { waitUntil: (p: Promise<unknown>) => void; passThroughOnException: () => void }, payload: Record<string, string>) {
  const req = new Request('http://internal/workflows/sparring-workflow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-internal-token': env.INTERNAL_ROUTE_SECRET },
    body: JSON.stringify(payload),
  });
  executionCtx.waitUntil(
    Promise.resolve(appFetch(req, env, executionCtx as ExecutionContext))
      .then((res) => {
        if (!res.ok) console.error('triggerWorkflow failed', { status: res.status, aiRunId: payload.aiRunId });
      })
      .catch((e) => {
        console.error('triggerWorkflow error', { message: e instanceof Error ? e.message : String(e), aiRunId: payload.aiRunId });
      }),
  );
}

function buildDeps(db: D1Database) {
  return {
    memberRepo: new D1MemberRepository(db),
    chatRepo: new D1ChatRepository(db),
    aiRunRepo: new D1AiRunRepository(db),
    idGen: () => crypto.randomUUID(),
  };
}

chatRoutes.post('/', async (c) => {
  const session = await getSessionForRequest(c);
  if (!session.ok) {
    const error = authErrorResponse(session);
    return c.json(error!.body, error!.status);
  }

  const deps = buildDeps(c.env.DB);
  const memberId = await ensureMemberForSession(deps.memberRepo, session);

  const { success } = await c.env.CHAT_RATE_LIMITER.limit({ key: memberId });
  if (!success) {
    return c.json({ code: 'RATE_LIMITED', message: 'Too many requests. Please wait.' }, 429);
  }

  const body = await c.req.json<StartChatRequest>();
  if (!body.message?.trim()) {
    return c.json({ code: 'INVALID_REQUEST', message: 'message is required' }, 400);
  }
  if (body.message.length > 4000) {
    return c.json({ code: 'INVALID_REQUEST', message: 'Message too long (max 4000 chars)' }, 400);
  }

  const result = await startChat(deps, memberId, body.message);

  if (!result.ok) {
    switch (result.error._tag) {
      case 'MemberNotFound':
        return c.json({ code: 'MEMBER_NOT_FOUND', message: `Member ${result.error.memberId} not found` }, 404);
      default:
        return c.json({ code: 'INTERNAL_ERROR', message: result.error._tag }, 500);
    }
  }

  triggerWorkflow(c.var.appFetch, c.env, c.executionCtx, {
    aiRunId: result.value.aiRun.id,
    chatId: result.value.chat.id,
    triggerMessageId: result.value.humanMessage.id,
  });

  return c.json({
    chatId: result.value.chat.id,
    messageId: result.value.humanMessage.id,
    aiRunId: result.value.aiRun.id,
  }, 201);
});

chatRoutes.post('/:chatId/messages', async (c) => {
  const session = await getSessionForRequest(c);
  if (!session.ok) {
    const error = authErrorResponse(session);
    return c.json(error!.body, error!.status);
  }

  const deps = buildDeps(c.env.DB);
  const memberId = await ensureMemberForSession(deps.memberRepo, session);

  const { success } = await c.env.CHAT_RATE_LIMITER.limit({ key: memberId });
  if (!success) {
    return c.json({ code: 'RATE_LIMITED', message: 'Too many requests. Please wait.' }, 429);
  }

  const chatId = c.req.param('chatId') as ChatId;
  const body = await c.req.json<SendMessageRequest>();
  if (!body.message?.trim()) {
    return c.json({ code: 'INVALID_REQUEST', message: 'message is required' }, 400);
  }
  if (body.message.length > 4000) {
    return c.json({ code: 'INVALID_REQUEST', message: 'Message too long (max 4000 chars)' }, 400);
  }

  const chatResult = await deps.chatRepo.findById(chatId);
  if (!chatResult.ok) {
    return c.json({ code: 'CHAT_NOT_FOUND', message: `Chat ${chatId} not found` }, 404);
  }
  if (chatResult.value.memberId !== memberId) {
    return c.json({ code: 'FORBIDDEN', message: 'Not your chat' }, 403);
  }

  const result = await sendMessage(deps, chatId, body.message);

  if (!result.ok) {
    switch (result.error._tag) {
      case 'ChatNotFound':
        return c.json({ code: 'CHAT_NOT_FOUND', message: `Chat ${result.error.chatId} not found` }, 404);
      case 'ChatArchived':
        return c.json({ code: 'CHAT_ARCHIVED', message: `Chat ${result.error.chatId} is archived` }, 409);
      default:
        return c.json({ code: 'INTERNAL_ERROR', message: result.error._tag }, 500);
    }
  }

  triggerWorkflow(c.var.appFetch, c.env, c.executionCtx, {
    aiRunId: result.value.aiRun.id,
    chatId: chatId,
    triggerMessageId: result.value.humanMessage.id,
  });

  return c.json({
    messageId: result.value.humanMessage.id,
    aiRunId: result.value.aiRun.id,
  }, 201);
});

chatRoutes.get('/:chatId/messages', async (c) => {
  const session = await getSessionForRequest(c);
  if (!session.ok) {
    const error = authErrorResponse(session);
    return c.json(error!.body, error!.status);
  }

  const deps = buildDeps(c.env.DB);
  const memberId = await ensureMemberForSession(deps.memberRepo, session);

  const chatId = c.req.param('chatId') as ChatId;

  const chatResult = await deps.chatRepo.findById(chatId);
  if (!chatResult.ok) {
    return c.json({ code: 'CHAT_NOT_FOUND', message: `Chat ${chatId} not found` }, 404);
  }
  if (chatResult.value.memberId !== memberId) {
    return c.json({ code: 'FORBIDDEN', message: 'Not your chat' }, 403);
  }

  const messagesResult = await deps.chatRepo.listMessages(chatId);
  if (!messagesResult.ok) {
    return c.json({ code: 'INTERNAL_ERROR', message: messagesResult.error._tag }, 500);
  }

  return c.json({
    chatId,
    messages: messagesResult.value.map((m) => ({
      id: m.id,
      chatId: m.chatId,
      senderType: m.senderType,
      body: m.body,
      sequence: m.sequence,
      createdAt: m.createdAt,
    })),
  });
});
