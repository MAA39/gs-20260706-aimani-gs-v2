import type { AiRunId, MemberId } from '@gs-v2/shared';
import type { Result } from '../result.js';
import { ok } from '../result.js';
import type { AiRun } from '../models/ai-run.js';
import type { AiRunRepository, AiRunError } from '../ports/ai-run-repository.js';
import type { ChatRepository, ChatError } from '../ports/chat-repository.js';
import type { ChatNotOwned } from './send-message.js';

export type GetAiRunStatusError = AiRunError | ChatError | ChatNotOwned;

export interface GetAiRunStatusDeps {
  readonly aiRunRepo: AiRunRepository;
  readonly chatRepo: ChatRepository;
}

export async function getAiRunStatus(
  deps: GetAiRunStatusDeps,
  actorMemberId: MemberId,
  aiRunId: AiRunId,
): Promise<Result<AiRun, GetAiRunStatusError>> {
  const runResult = await deps.aiRunRepo.findById(aiRunId);
  if (!runResult.ok) return runResult;

  const chatResult = await deps.chatRepo.findById(runResult.value.chatId);
  if (!chatResult.ok) return chatResult;

  if (chatResult.value.memberId !== actorMemberId) {
    return { ok: false, error: { _tag: 'ChatNotOwned', chatId: chatResult.value.id, actorMemberId } };
  }

  return ok(runResult.value);
}
