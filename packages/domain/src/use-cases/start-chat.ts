import type { ChatId, MemberId, MessageId, AiRunId } from '@gs-v2/shared';
import type { Result } from '../result.js';
import type { Chat, Message } from '../models/chat.js';
import type { AiRun } from '../models/ai-run.js';
import type { MemberRepository, MemberError } from '../ports/member-repository.js';
import type { TurnRepository, TurnError } from '../ports/turn-repository.js';

export type StartChatError =
  | MemberError
  | TurnError;

export interface StartChatOutput {
  readonly chat: Chat;
  readonly humanMessage: Message;
  readonly aiRun: AiRun;
}

export interface StartChatDeps {
  readonly memberRepo: MemberRepository;
  readonly turnRepo: TurnRepository;
  readonly idGen: () => string;
}

export async function startChat(
  deps: StartChatDeps,
  memberId: MemberId,
  messageBody: string,
): Promise<Result<StartChatOutput, StartChatError>> {
  const memberResult = await deps.memberRepo.findById(memberId);
  if (!memberResult.ok) return memberResult;

  // 一覧表示用のタイトルは最初の相談文の先頭から取る
  const title = messageBody.trim().slice(0, 50);

  // chat・最初のmessage・queued runは原子的に生まれる。失敗時に空chatが一覧に残らない（ADV-007）
  const turnResult = await deps.turnRepo.createChatWithFirstTurn(
    deps.idGen() as ChatId,
    { messageId: deps.idGen() as MessageId, aiRunId: deps.idGen() as AiRunId },
    { memberId, title, body: messageBody, stage: 'sparring' },
  );
  if (!turnResult.ok) return turnResult;

  return {
    ok: true,
    value: {
      chat: turnResult.value.chat,
      humanMessage: turnResult.value.humanMessage,
      aiRun: turnResult.value.aiRun,
    },
  };
}
