import { describe, expect, it } from 'vitest';
import { sendMessage } from '../send-message.js';
import {
  FakeChatRepository,
  FakeTurnRepository,
  makeChat,
  memberId,
  chatId,
  sequentialIdGen,
  ok,
  err,
} from './fixtures.js';

function makeDeps(chatRepo: FakeChatRepository, turnRepo = new FakeTurnRepository()) {
  return { chatRepo, turnRepo, idGen: sequentialIdGen() };
}

describe('sendMessage', () => {
  // D-004 / D-005 / D-007 (MIH-007, ADV-001)
  it('チャット所有者と異なるメンバーの送信はChatNotOwnedを返し、メッセージもAI runも作成しない', async () => {
    const chatRepo = new FakeChatRepository({
      findById: ok(makeChat({ memberId: memberId('owner') })),
    });
    const turnRepo = new FakeTurnRepository();

    const result = await sendMessage(makeDeps(chatRepo, turnRepo), memberId('attacker'), chatId('chat-1'), 'こんにちは');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error._tag).toBe('ChatNotOwned');
    expect(turnRepo.calls).toHaveLength(0);
  });

  it('archivedチャットへの送信はChatArchivedを返し、メッセージを追加しない', async () => {
    const chatRepo = new FakeChatRepository({
      findById: ok(makeChat({ memberId: memberId('member-1'), status: 'archived' })),
    });
    const turnRepo = new FakeTurnRepository();

    const result = await sendMessage(makeDeps(chatRepo, turnRepo), memberId('member-1'), chatId('chat-1'), 'こんにちは');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error._tag).toBe('ChatArchived');
    expect(turnRepo.calls).toHaveLength(0);
  });

  // D-001 (TSU-004): in-flight検知はDBの部分UNIQUE index違反としてTurnRepositoryから返る
  it('AI応答の生成中に追加送信するとAiRunInFlightを返す', async () => {
    const chatRepo = new FakeChatRepository({
      findById: ok(makeChat({ memberId: memberId('member-1') })),
    });
    const turnRepo = new FakeTurnRepository({
      appendHumanTurn: err({ _tag: 'AiRunInFlight', chatId: 'chat-1', aiRunId: 'ai-run-busy' }),
    });

    const result = await sendMessage(makeDeps(chatRepo, turnRepo), memberId('member-1'), chatId('chat-1'), '追加で聞きたい');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error._tag).toBe('AiRunInFlight');
  });

  it('存在しないチャットへの送信はChatNotFoundをそのまま返す', async () => {
    const chatRepo = new FakeChatRepository({
      findById: err({ _tag: 'ChatNotFound', chatId: 'chat-x' }),
    });
    const turnRepo = new FakeTurnRepository();

    const result = await sendMessage(makeDeps(chatRepo, turnRepo), memberId('member-1'), chatId('chat-x'), 'こんにちは');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error._tag).toBe('ChatNotFound');
    expect(turnRepo.calls).toHaveLength(0);
  });

  // A-005系のdomain契約: adapterのResultは伝搬しthrowしない
  it('ターン追加がMessageSequenceConflictで失敗したらそのままエラーを返す', async () => {
    const chatRepo = new FakeChatRepository({
      findById: ok(makeChat({ memberId: memberId('member-1') })),
    });
    const turnRepo = new FakeTurnRepository({
      appendHumanTurn: err({ _tag: 'MessageSequenceConflict', chatId: 'chat-1' }),
    });

    const result = await sendMessage(makeDeps(chatRepo, turnRepo), memberId('member-1'), chatId('chat-1'), 'こんにちは');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error._tag).toBe('MessageSequenceConflict');
  });

  // ADV-007: humanメッセージとAI runは同一トランザクションで対になって生まれる
  it('所有者本人の送信はhumanメッセージとそのメッセージをtriggerとするsparring AI runを1回のターン追加で作成する', async () => {
    const chatRepo = new FakeChatRepository({
      findById: ok(makeChat({ memberId: memberId('member-1') })),
    });
    const turnRepo = new FakeTurnRepository();

    const result = await sendMessage(makeDeps(chatRepo, turnRepo), memberId('member-1'), chatId('chat-1'), '相談です');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.humanMessage.senderType).toBe('human');
      expect(result.value.humanMessage.body).toBe('相談です');
      expect(result.value.aiRun.triggerMessageId).toBe(result.value.humanMessage.id);
      expect(result.value.aiRun.stage).toBe('sparring');
      expect(turnRepo.calls).toEqual(['appendHumanTurn']);
    }
  });
});
