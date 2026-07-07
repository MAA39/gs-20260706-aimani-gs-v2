import { Hono } from 'hono';
import type { Env, AppVars } from '../app.js';
import type { MemberId } from '@gs-v2/shared';
import { parseChatId } from '@gs-v2/shared';
import { parseStartChatRequest, parseSendMessageRequest } from '@gs-v2/contracts';
import { startChat, sendMessage, listChatMessages } from '@gs-v2/domain';
import type { StartChatError, SendMessageError, ListChatMessagesError, MemberError, Result } from '@gs-v2/domain';
import { ok, err } from '@gs-v2/domain';
import { D1ChatRepository, D1MemberRepository, D1AiRunRepository } from '@gs-v2/db';
import { getSessionForRequest, authErrorResponse } from '../lib/auth-helpers.js';
import type { AuthenticatedSession } from '../lib/auth-helpers.js';

export const chatRoutes = new Hono<{ Bindings: Env; Variables: AppVars }>();

type DomainError = StartChatError | SendMessageError | ListChatMessagesError;

interface HttpFailure {
  readonly status: 404 | 409 | 500;
  readonly body: { readonly code: string; readonly message: string };
}

function domainErrorToHttp(error: DomainError): HttpFailure {
  switch (error._tag) {
    case 'MemberNotFound':
      return { status: 404, body: { code: 'MEMBER_NOT_FOUND', message: `Member ${error.memberId} not found` } };
    case 'MemberAlreadyExists':
      return { status: 409, body: { code: 'MEMBER_ALREADY_EXISTS', message: `Member ${error.memberId} already exists` } };
    case 'ChatNotFound':
      return { status: 404, body: { code: 'CHAT_NOT_FOUND', message: `Chat ${error.chatId} not found` } };
    // 存在確認oracle対策: 他人のchatは「存在しない」ものとして返す（ADV-003）
    case 'ChatNotOwned':
      return { status: 404, body: { code: 'CHAT_NOT_FOUND', message: `Chat ${error.chatId} not found` } };
    case 'ChatArchived':
      return { status: 409, body: { code: 'CHAT_ARCHIVED', message: `Chat ${error.chatId} is archived` } };
    case 'MessageSequenceConflict':
      return { status: 409, body: { code: 'MESSAGE_CONFLICT', message: 'Concurrent send detected. Please retry.' } };
    case 'AiRunConflict':
      return { status: 409, body: { code: 'AI_RUN_CONFLICT', message: `AI run conflict: ${error.reason}` } };
    case 'AiRunNotFound':
    case 'InvalidAiRunTransition':
    case 'MemberDbFailure':
    case 'ChatDbFailure':
    case 'AiRunDbFailure':
      return { status: 500, body: { code: 'INTERNAL_ERROR', message: error._tag } };
    default:
      return error satisfies never;
  }
}

async function ensureMemberForSession(
  memberRepo: D1MemberRepository,
  session: AuthenticatedSession,
): Promise<Result<MemberId, MemberError>> {
  const memberId = session.user.id as MemberId;
  const existing = await memberRepo.findById(memberId);
  if (existing.ok) return ok(memberId);
  if (existing.error._tag !== 'MemberNotFound') return err(existing.error);

  const created = await memberRepo.create(memberId, {
    displayName: session.user.name || session.user.email || memberId,
    role: 'student',
  });
  // 並行リクエストが先に作成した場合は既存メンバーとして扱う
  if (!created.ok && created.error._tag !== 'MemberAlreadyExists') return err(created.error);
  return ok(memberId);
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

async function readJsonBody(req: { json: () => Promise<unknown> }): Promise<Result<unknown, { _tag: 'MalformedJson' }>> {
  try {
    return ok(await req.json());
  } catch {
    return err({ _tag: 'MalformedJson' });
  }
}

chatRoutes.post('/', async (c) => {
  const session = await getSessionForRequest(c);
  if (!session.ok) {
    const error = authErrorResponse(session);
    return c.json(error!.body, error!.status);
  }

  const deps = buildDeps(c.env.DB);
  const memberResult = await ensureMemberForSession(deps.memberRepo, session);
  if (!memberResult.ok) {
    const failure = domainErrorToHttp(memberResult.error);
    return c.json(failure.body, failure.status);
  }
  const memberId = memberResult.value;

  const { success } = await c.env.CHAT_RATE_LIMITER.limit({ key: memberId });
  if (!success) {
    return c.json({ code: 'RATE_LIMITED', message: 'Too many requests. Please wait.' }, 429);
  }

  const rawBody = await readJsonBody(c.req);
  if (!rawBody.ok) {
    return c.json({ code: 'INVALID_REQUEST', message: 'request body must be valid JSON' }, 400);
  }
  const parsed = parseStartChatRequest(rawBody.value);
  if (!parsed.ok) {
    return c.json({ code: 'INVALID_REQUEST', message: `${parsed.error.field} ${parsed.error.reason}` }, 400);
  }

  const result = await startChat(deps, memberId, parsed.value.message);
  if (!result.ok) {
    const failure = domainErrorToHttp(result.error);
    return c.json(failure.body, failure.status);
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
  const memberResult = await ensureMemberForSession(deps.memberRepo, session);
  if (!memberResult.ok) {
    const failure = domainErrorToHttp(memberResult.error);
    return c.json(failure.body, failure.status);
  }
  const memberId = memberResult.value;

  const { success } = await c.env.CHAT_RATE_LIMITER.limit({ key: memberId });
  if (!success) {
    return c.json({ code: 'RATE_LIMITED', message: 'Too many requests. Please wait.' }, 429);
  }

  const chatIdResult = parseChatId(c.req.param('chatId'));
  if (!chatIdResult.ok) {
    return c.json({ code: 'INVALID_REQUEST', message: `chatId ${chatIdResult.reason}` }, 400);
  }

  const rawBody = await readJsonBody(c.req);
  if (!rawBody.ok) {
    return c.json({ code: 'INVALID_REQUEST', message: 'request body must be valid JSON' }, 400);
  }
  const parsed = parseSendMessageRequest(rawBody.value);
  if (!parsed.ok) {
    return c.json({ code: 'INVALID_REQUEST', message: `${parsed.error.field} ${parsed.error.reason}` }, 400);
  }

  const result = await sendMessage(deps, memberId, chatIdResult.value, parsed.value.message);
  if (!result.ok) {
    const failure = domainErrorToHttp(result.error);
    return c.json(failure.body, failure.status);
  }

  triggerWorkflow(c.var.appFetch, c.env, c.executionCtx, {
    aiRunId: result.value.aiRun.id,
    chatId: chatIdResult.value,
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
  const memberResult = await ensureMemberForSession(deps.memberRepo, session);
  if (!memberResult.ok) {
    const failure = domainErrorToHttp(memberResult.error);
    return c.json(failure.body, failure.status);
  }
  const memberId = memberResult.value;

  const chatIdResult = parseChatId(c.req.param('chatId'));
  if (!chatIdResult.ok) {
    return c.json({ code: 'INVALID_REQUEST', message: `chatId ${chatIdResult.reason}` }, 400);
  }
  const chatId = chatIdResult.value;

  const result = await listChatMessages(deps, memberId, chatId);
  if (!result.ok) {
    const failure = domainErrorToHttp(result.error);
    return c.json(failure.body, failure.status);
  }

  return c.json({
    chatId,
    messages: result.value.map((m) => ({
      id: m.id,
      chatId: m.chatId,
      senderType: m.senderType,
      body: m.body,
      sequence: m.sequence,
      createdAt: m.createdAt,
    })),
  });
});
