import type { AiRunId } from '@gs-v2/shared';
import type { Result } from '../result.js';
import type { AiRun, AiRunEvent, CompleteRunInput } from '../models/ai-run.js';
import type { Message } from '../models/chat.js';

export type AiRunError =
  | { _tag: 'AiRunNotFound'; aiRunId: string }
  | { _tag: 'InvalidAiRunTransition'; aiRunId: string; from: string; to: string }
  | { _tag: 'AiRunConflict'; reason: 'IdempotencyKey' | 'ResultHash' }
  | { _tag: 'AiRunDbFailure'; operation: string };

// run作成はTurnRepository（human messageと原子的に対で作る）が担う
export interface AiRunRepository {
  markAdmitted(id: AiRunId): Promise<Result<void, AiRunError>>;
  markGenerating(id: AiRunId, flueRunId: string): Promise<Result<void, AiRunError>>;
  markRepairing(id: AiRunId): Promise<Result<void, AiRunError>>;
  // AI応答messageの追加とcompleted遷移は原子的（片方だけ成立するとchatがin-flightのまま停止する）
  completeWithAiMessage(input: CompleteRunInput): Promise<Result<Message, AiRunError>>;
  // 失敗時はユーザー向けsystem通知messageも同一トランザクションで追記する
  fail(id: AiRunId, errorMessage: string, userNotice: string): Promise<Result<void, AiRunError>>;
  findById(id: AiRunId): Promise<Result<AiRun, AiRunError>>;
  listEventsAfter(aiRunId: AiRunId, afterSequence: number): Promise<Result<readonly AiRunEvent[], AiRunError>>;
}
