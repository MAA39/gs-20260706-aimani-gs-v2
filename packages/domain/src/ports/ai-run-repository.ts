import type { AiRunId } from '@gs-v2/shared';
import type { Result } from '../result.js';
import type { AiRun, AiRunEvent, CompleteRunInput } from '../models/ai-run.js';

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
  complete(input: CompleteRunInput): Promise<Result<void, AiRunError>>;
  fail(id: AiRunId, errorMessage: string): Promise<Result<void, AiRunError>>;
  findById(id: AiRunId): Promise<Result<AiRun, AiRunError>>;
  listEventsAfter(aiRunId: AiRunId, afterSequence: number): Promise<Result<readonly AiRunEvent[], AiRunError>>;
}
