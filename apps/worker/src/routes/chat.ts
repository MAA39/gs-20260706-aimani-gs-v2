import { Hono } from 'hono';
import type { Env, AppVars } from '../app.js';
import type { MemberId, ChatId } from '@gs-v2/shared';
import type { StartChatRequest, SendMessageRequest } from '@gs-v2/contracts';
import { startChat } from '@gs-v2/domain';
import { sendMessage } from '@gs-v2/domain';
import { D1ChatRepository } from '@gs-v2/db';
import { D1MemberRepository } from '@gs-v2/db';
import { D1AiRunRepository } from '@gs-v2/db';

export const chatRoutes = new Hono<{ Bindings: Env; Variables: AppVars }>();

function triggerWorkflow(appFetch: AppVars['appFetch'], env: Env, executionCtx: { waitUntil: (p: Promise<unknown>) => void; passThroughOnException: () => void }, payload: Record<string, string>) {
  const req = new Request('http://internal/workflows/sparring-workflow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
  const memberId = c.req.header('x-user-id') as MemberId | undefined;
  if (!memberId) {
    return c.json({ code: 'INVALID_REQUEST', message: 'x-user-id header required' }, 400);
  }

  const body = await c.req.json<StartChatRequest>();
  if (!body.message?.trim()) {
    return c.json({ code: 'INVALID_REQUEST', message: 'message is required' }, 400);
  }

  const deps = buildDeps(c.env.DB);
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
  const memberId = c.req.header('x-user-id') as MemberId | undefined;
  if (!memberId) {
    return c.json({ code: 'INVALID_REQUEST', message: 'x-user-id header required' }, 400);
  }

  const chatId = c.req.param('chatId') as ChatId;
  const body = await c.req.json<SendMessageRequest>();
  if (!body.message?.trim()) {
    return c.json({ code: 'INVALID_REQUEST', message: 'message is required' }, 400);
  }

  const deps = buildDeps(c.env.DB);
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
  const chatId = c.req.param('chatId') as ChatId;
  const deps = buildDeps(c.env.DB);

  const chatResult = await deps.chatRepo.findById(chatId);
  if (!chatResult.ok) {
    return c.json({ code: 'CHAT_NOT_FOUND', message: `Chat ${chatId} not found` }, 404);
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
