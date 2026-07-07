import { describe, expect, it } from 'vitest';
import { sendMessage } from '../send-message.js';
import {
  FakeChatRepository,
  FakeAiRunRepository,
  makeChat,
  makeAiRun,
  memberId,
  chatId,
  sequentialIdGen,
  ok,
  err,
} from './fixtures.js';

function makeDeps(chatRepo: FakeChatRepository, aiRunRepo: FakeAiRunRepository) {
  return { chatRepo, aiRunRepo, idGen: sequentialIdGen() };
}

describe('sendMessage', () => {
  // D-004 / D-005 / D-007 (MIH-007, ADV-001)
  it('チャット所有者と異なるメンバーの送信はChatNotOwnedを返し、メッセージもAI runも作成しない', async () => {
    const chatRepo = new FakeChatRepository({
      findById: ok(makeChat({ memberId: memberId('owner') })),
    });
    const aiRunRepo = new FakeAiRunRepository();

    const result = await sendMessage(makeDeps(chatRepo, aiRunRepo), memberId('attacker'), chatId('chat-1'), 'こんにちは');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error._tag).toBe('ChatNotOwned');
    expect(chatRepo.calls).not.toContain('appendMessage');
    expect(aiRunRepo.calls).not.toContain('createQueued');
  });

  it('archivedチャットへの送信はChatArchivedを返し、メッセージを追加しない', async () => {
    const chatRepo = new FakeChatRepository({
      findById: ok(makeChat({ memberId: memberId('member-1'), status: 'archived' })),
    });
    const aiRunRepo = new FakeAiRunRepository();

    const result = await sendMessage(makeDeps(chatRepo, aiRunRepo), memberId('member-1'), chatId('chat-1'), 'こんにちは');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error._tag).toBe('ChatArchived');
    expect(chatRepo.calls).not.toContain('appendMessage');
  });

  // D-001 (TSU-004)
  it('AI応答の生成中に追加送信するとAiRunInFlightを返し、メッセージを追加しない', async () => {
    const chatRepo = new FakeChatRepository({
      findById: ok(makeChat({ memberId: memberId('member-1') })),
    });
    const aiRunRepo = new FakeAiRunRepository({
      findActiveByChatId: ok(makeAiRun({ status: 'generating' })),
    });

    const result = await sendMessage(makeDeps(chatRepo, aiRunRepo), memberId('member-1'), chatId('chat-1'), '追加で聞きたい');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error._tag).toBe('AiRunInFlight');
    expect(chatRepo.calls).not.toContain('appendMessage');
    expect(aiRunRepo.calls).not.toContain('createQueued');
  });

  it('存在しないチャットへの送信はChatNotFoundをそのまま返す', async () => {
    const chatRepo = new FakeChatRepository({
      findById: err({ _tag: 'ChatNotFound', chatId: 'chat-x' }),
    });
    const aiRunRepo = new FakeAiRunRepository();

    const result = await sendMessage(makeDeps(chatRepo, aiRunRepo), memberId('member-1'), chatId('chat-x'), 'こんにちは');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error._tag).toBe('ChatNotFound');
  });

  // A-005系のdomain契約: adapterのResultは伝搬しthrowしない
  it('メッセージ追加がMessageSequenceConflictで失敗したらAI runを作成せずエラーを返す', async () => {
    const chatRepo = new FakeChatRepository({
      findById: ok(makeChat({ memberId: memberId('member-1') })),
      appendMessage: err({ _tag: 'MessageSequenceConflict', chatId: 'chat-1' }),
    });
    const aiRunRepo = new FakeAiRunRepository();

    const result = await sendMessage(makeDeps(chatRepo, aiRunRepo), memberId('member-1'), chatId('chat-1'), 'こんにちは');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error._tag).toBe('MessageSequenceConflict');
    expect(aiRunRepo.calls).not.toContain('createQueued');
  });

  it('所有者本人の送信はhumanメッセージを追加し、そのメッセージをtriggerとするsparring AI runを作成する', async () => {
    const chatRepo = new FakeChatRepository({
      findById: ok(makeChat({ memberId: memberId('member-1') })),
    });
    const aiRunRepo = new FakeAiRunRepository();

    const result = await sendMessage(makeDeps(chatRepo, aiRunRepo), memberId('member-1'), chatId('chat-1'), '相談です');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.humanMessage.senderType).toBe('human');
      expect(result.value.humanMessage.body).toBe('相談です');
      expect(aiRunRepo.queuedInputs).toHaveLength(1);
      expect(aiRunRepo.queuedInputs[0]!.triggerMessageId).toBe(result.value.humanMessage.id);
      expect(aiRunRepo.queuedInputs[0]!.stage).toBe('sparring');
    }
  });
});
