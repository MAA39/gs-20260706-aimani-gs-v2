`git diff main...HEAD` と `tsutsuki` 4ファイルを確認済み。ファイル変更はしていません。

## ① 悪いトレース / 悪い失敗候補

| 指摘ID | bad ID | 種別 | 候補 | 影響度×確信度→優先度 |
|---|---:|---|---|---|
| TSU-001 | BT-001 | 悪いトレース | `x-user-id` を信用境界にしているため、認証なしで memberId を名乗れた場合に他人のチャットへ到達できる | 致命×中→P1 |
| TSU-002 | BT-002 | 悪いトレース | 未認証の `POST /members` で `admin` 等の任意 role を作れる | 致命×中→P1 |
| TSU-003 | BF-001 | 悪い失敗 | 同一チャットへの正当な同時送信で sequence 採番が競合し、片方が 500/失敗になり得る | 重大×高→P1 |
| TSU-004 | BT-003 | 悪いトレース | AI応答待ち中に次メッセージを送ると、複数 AI run が同じ最新履歴を読んで応答対応が崩れ得る | 重大×高→P1 |
| TSU-005 | BF-002 | 悪い失敗 | 送信は 201 だが、AI起動失敗・生成失敗・長時間化時にユーザーへ終端状態が返らない | 重大×高→P1 |
| TSU-006 | BT-004 | 悪いトレース | 上限なしの巨大 message が受理され、AIコンテキスト・コスト・失敗率を壊せる | 重大×高→P1 |
| TSU-007 | BT-005 | 悪いトレース | リトライ/二重送信で同一メッセージが別 message + 別 aiRun として重複作成される | 重大×中→P2 |

## ② SpecGap

- SpecGap: TSU-001 認証境界は何か  
  選択肢: A. MVPは `x-user-id` デモ運用 / B. サーバー署名セッション・JWTを正とする / C. memberIdをBearer secret扱い  
  推奨: B。少なくとも公開環境では `x-user-id` 単体を権限根拠にしない。

- SpecGap: TSU-002 role付与ルール  
  選択肢: A. 自己作成は student 固定 / B. teacher/admin は招待または管理者操作のみ / C. roleをMVPから外す  
  推奨: A+B。自己作成は student、昇格は別フロー。

- SpecGap: TSU-004 AI応答待ち中の追加送信  
  選択肢: A. 1チャット1 in-flight runで追加送信は409 / B. 複数run許可、triggerMessageId時点の履歴スナップショットで応答 / C. queue化  
  推奨: A。MVPでは最も検証しやすい。

- SpecGap: TSU-005 AI失敗のユーザー可視化  
  選択肢: A. aiRun status endpointを返す / B. failed時にsystem messageを追加する / C. UIタイムアウトのみ  
  推奨: B。既存の messages polling と合う。

- SpecGap: TSU-006 message長・AI SLA  
  選択肢: A. 文字数上限で400/413 / B. サーバー側要約後に投入 / C. 無制限  
  推奨: A。まず上限を仕様化する。

- SpecGap: TSU-007 冪等性  
  選択肢: A. `Idempotency-Key` 必須/任意対応 / B. body+時間窓で推定重複排除 / C. 重複許容  
  推奨: A。

## ③ テスト導出候補

```ts
import { describe, expect, it } from 'vitest';

describe('chat API bad-catalog candidates', () => {
  it('BT-001: セッションなしでx-user-idだけを渡しても他人のチャット履歴は読めない', async () => {
    const { api, alice, aliceChat } = await setupChatFixture();

    const res = await api.fetch(`/api/chats/${aliceChat.id}/messages`, {
      headers: { 'x-user-id': alice.id },
    });

    expect(res.status).toBe(401);
  });

  it('BT-002: 自己作成メンバーはadmin roleを作成できない', async () => {
    const { api } = await setupApiFixture();

    const res = await api.fetch('/api/members', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ displayName: 'attacker', role: 'admin' }),
    });

    expect([400, 403]).toContain(res.status);
  });

  it('BT-003: AI応答待ち中の追加メッセージは409で拒否される', async () => {
    const { api, member, chat } = await setupChatWithPendingAiRun();

    const res = await api.fetch(`/api/chats/${chat.id}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': member.id },
      body: JSON.stringify({ message: '追加で聞きたいです' }),
    });

    expect(res.status).toBe(409);
  });

  it('BF-002: AI生成失敗時はsystem messageとして失敗状態が見える', async () => {
    const { api, member, chat } = await setupChatWithFailedAiRun();

    const res = await api.fetch(`/api/chats/${chat.id}/messages`, {
      headers: { 'x-user-id': member.id },
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ senderType: 'system' }),
      ]),
    );
  });

  it('BT-004: 上限超過メッセージはAI runを作らず拒否される', async () => {
    const { api, member } = await setupMemberFixture();

    const res = await api.fetch('/api/chats', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': member.id },
      body: JSON.stringify({ message: 'x'.repeat(10_001) }),
    });

    expect([400, 413]).toContain(res.status);
  });

  it('BT-005: 同じIdempotency-Keyの再送はメッセージとAI runを重複作成しない', async () => {
    const { api, member, chat } = await setupChatFixture();
    const init = {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-user-id': member.id,
        'idempotency-key': 'msg-001',
      },
      body: JSON.stringify({ message: '同じ内容' }),
    };

    const first = await api.fetch(`/api/chats/${chat.id}/messages`, init);
    const second = await api.fetch(`/api/chats/${chat.id}/messages`, init);

    expect(first.status).toBe(201);
    expect([200, 201]).toContain(second.status);
    expect(await second.json()).toEqual(await first.json());
  });
});
```