import { describe, expect, it } from 'vitest';
import { getAiRunStatus } from '../get-ai-run-status.js';
import { FakeChatRepository, FakeAiRunRepository, makeChat, memberId, aiRunId, ok } from './fixtures.js';

describe('getAiRunStatus', () => {
  it('チャット所有者と異なるメンバーはAI run状態を取得できずChatNotOwnedを返す', async () => {
    const chatRepo = new FakeChatRepository({
      findById: ok(makeChat({ memberId: memberId('owner') })),
    });
    const aiRunRepo = new FakeAiRunRepository();

    const result = await getAiRunStatus({ aiRunRepo, chatRepo }, memberId('attacker'), aiRunId('ai-run-1'));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error._tag).toBe('ChatNotOwned');
  });

  it('所有者本人はAI runの現在statusを取得できる', async () => {
    const chatRepo = new FakeChatRepository({
      findById: ok(makeChat({ memberId: memberId('member-1') })),
    });
    const aiRunRepo = new FakeAiRunRepository();

    const result = await getAiRunStatus({ aiRunRepo, chatRepo }, memberId('member-1'), aiRunId('ai-run-1'));

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.id).toBe('ai-run-1');
  });
});
