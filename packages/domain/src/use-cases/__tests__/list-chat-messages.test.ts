import { describe, expect, it } from 'vitest';
import { listChatMessages } from '../list-chat-messages.js';
import { FakeChatRepository, makeChat, makeMessage, memberId, chatId, ok } from './fixtures.js';

describe('listChatMessages', () => {
  // X-001/X-015相当のdomain部分 (TSU-001, ADV-001)
  it('チャット所有者と異なるメンバーの履歴取得はChatNotOwnedを返し、メッセージを読まない', async () => {
    const chatRepo = new FakeChatRepository({
      findById: ok(makeChat({ memberId: memberId('owner') })),
    });

    const result = await listChatMessages({ chatRepo }, memberId('attacker'), chatId('chat-1'));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error._tag).toBe('ChatNotOwned');
    expect(chatRepo.calls).not.toContain('listMessages');
  });

  it('所有者本人の履歴取得はメッセージ一覧を返す', async () => {
    const chatRepo = new FakeChatRepository({
      findById: ok(makeChat({ memberId: memberId('member-1') })),
      listMessages: ok([makeMessage({ body: '一件目' })]),
    });

    const result = await listChatMessages({ chatRepo }, memberId('member-1'), chatId('chat-1'));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]!.body).toBe('一件目');
    }
  });
});
