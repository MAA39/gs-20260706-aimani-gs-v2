import { describe, expect, it } from 'vitest';
import { startChat } from '../start-chat.js';
import {
  FakeMemberRepository,
  FakeTurnRepository,
  memberId,
  sequentialIdGen,
  err,
} from './fixtures.js';

function makeDeps(memberRepo: FakeMemberRepository, turnRepo = new FakeTurnRepository()) {
  return { memberRepo, turnRepo, idGen: sequentialIdGen() };
}

describe('startChat', () => {
  // D-006 (MIH-008)
  it('存在しないメンバーの壁打ち開始はMemberNotFoundを返し、チャットもメッセージもAI runも作成しない', async () => {
    const memberRepo = new FakeMemberRepository({
      findById: err({ _tag: 'MemberNotFound', memberId: 'ghost' }),
    });
    const turnRepo = new FakeTurnRepository();

    const result = await startChat(makeDeps(memberRepo, turnRepo), memberId('ghost'), 'はじめまして');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error._tag).toBe('MemberNotFound');
    expect(turnRepo.calls).toHaveLength(0);
  });

  // ADV-007: chat・最初のmessage・queued runは1回の原子的な作成で生まれる
  it('メンバー本人の壁打ち開始はチャット・humanメッセージ・AI runを原子的に一括作成する', async () => {
    const memberRepo = new FakeMemberRepository();
    const turnRepo = new FakeTurnRepository();

    const result = await startChat(makeDeps(memberRepo, turnRepo), memberId('member-1'), '最初の相談');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.chat.memberId).toBe('member-1');
      expect(result.value.humanMessage.body).toBe('最初の相談');
      expect(result.value.aiRun.triggerMessageId).toBe(result.value.humanMessage.id);
      expect(turnRepo.calls).toEqual(['createChatWithFirstTurn']);
    }
  });

  it('チャットのタイトルは最初の相談文の先頭50文字になる', async () => {
    const memberRepo = new FakeMemberRepository();
    const turnRepo = new FakeTurnRepository();
    const longMessage = 'あ'.repeat(60);

    const result = await startChat(makeDeps(memberRepo, turnRepo), memberId('member-1'), longMessage);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.chat.title).toBe('あ'.repeat(50));
    }
  });

  it('一括作成がDB失敗したらTurnDbFailureを返す', async () => {
    const memberRepo = new FakeMemberRepository();
    const turnRepo = new FakeTurnRepository({
      createChatWithFirstTurn: err({ _tag: 'TurnDbFailure', operation: 'createChatWithFirstTurn' }),
    });

    const result = await startChat(makeDeps(memberRepo, turnRepo), memberId('member-1'), '最初の相談');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error._tag).toBe('TurnDbFailure');
  });
});
