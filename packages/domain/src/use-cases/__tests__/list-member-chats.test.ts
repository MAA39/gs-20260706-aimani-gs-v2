import { describe, expect, it } from 'vitest';
import { listMemberChats } from '../list-member-chats.js';
import { FakeChatRepository, memberId } from './fixtures.js';

describe('listMemberChats', () => {
  it('メンバー本人のチャット一覧を返す（リポジトリがmemberIdで絞り込む契約）', async () => {
    const chatRepo = new FakeChatRepository();

    const result = await listMemberChats({ chatRepo }, memberId('member-1'));

    expect(result.ok).toBe(true);
    expect(chatRepo.calls).toEqual(['findByMember']);
  });
});
