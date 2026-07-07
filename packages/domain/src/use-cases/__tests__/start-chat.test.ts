import { describe, expect, it } from 'vitest';
import { startChat } from '../start-chat.js';
import {
  FakeMemberRepository,
  FakeChatRepository,
  FakeAiRunRepository,
  memberId,
  sequentialIdGen,
  err,
} from './fixtures.js';

function makeDeps(
  memberRepo: FakeMemberRepository,
  chatRepo = new FakeChatRepository(),
  aiRunRepo = new FakeAiRunRepository(),
) {
  return { memberRepo, chatRepo, aiRunRepo, idGen: sequentialIdGen() };
}

describe('startChat', () => {
  // D-006 (MIH-008)
  it('存在しないメンバーの壁打ち開始はMemberNotFoundを返し、チャットもメッセージもAI runも作成しない', async () => {
    const memberRepo = new FakeMemberRepository({
      findById: err({ _tag: 'MemberNotFound', memberId: 'ghost' }),
    });
    const chatRepo = new FakeChatRepository();
    const aiRunRepo = new FakeAiRunRepository();

    const result = await startChat(makeDeps(memberRepo, chatRepo, aiRunRepo), memberId('ghost'), 'はじめまして');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error._tag).toBe('MemberNotFound');
    expect(chatRepo.calls).toHaveLength(0);
    expect(aiRunRepo.calls).toHaveLength(0);
  });

  it('メンバー本人の壁打ち開始はチャット作成→humanメッセージ追加→AI run作成を一連で行う', async () => {
    const memberRepo = new FakeMemberRepository();
    const chatRepo = new FakeChatRepository();
    const aiRunRepo = new FakeAiRunRepository();

    const result = await startChat(makeDeps(memberRepo, chatRepo, aiRunRepo), memberId('member-1'), '最初の相談');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.chat.memberId).toBe('member-1');
      expect(result.value.humanMessage.body).toBe('最初の相談');
      expect(result.value.aiRun.triggerMessageId).toBe(result.value.humanMessage.id);
      expect(chatRepo.calls).toEqual(['create', 'appendMessage']);
      expect(aiRunRepo.calls).toEqual(['createQueued']);
    }
  });

  it('チャット作成がDB失敗したらChatDbFailureを返し、メッセージ追加へ進まない', async () => {
    const memberRepo = new FakeMemberRepository();
    const chatRepo = new FakeChatRepository({
      create: err({ _tag: 'ChatDbFailure', operation: 'create' }),
    });
    const aiRunRepo = new FakeAiRunRepository();

    const result = await startChat(makeDeps(memberRepo, chatRepo, aiRunRepo), memberId('member-1'), '最初の相談');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error._tag).toBe('ChatDbFailure');
    expect(chatRepo.calls).not.toContain('appendMessage');
    expect(aiRunRepo.calls).toHaveLength(0);
  });
});
