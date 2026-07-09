前提: 読み取りのみ。実行はしていません。なお現在のワークツリーには、OAuth回避用の未コミット差分があります。

**結論**
今日「人間がチャット→AI応答を目で見る」だけなら、GitHub OAuth はブロッカーではありません。最新ワークツリーでは `DEV_AUTH_BYPASS_USER_ID` が入っており、`/api/auth/get-session` と業務APIの session 判定を通せます。むしろ P0 は D1 migration、`flue dev` 起動、`SAKURA_API_TOKEN` の有効性です。

**ブロッカー表**

| 項目 | 緊急度 | 解消コスト | 具体的な解消手順 |
|---|---:|---:|---|
| ローカルD1に migration 未適用 | P0 | S | `apps/worker` で `wrangler d1 migrations apply aimani-gs-v2-db --local`。未適用だと `members/chats/messages/ai_runs/user/session` が無く、初回POSTが500になります。migrations_dir は [wrangler.jsonc](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/apps/worker/wrangler.jsonc:10) 済み。 |
| `wrangler dev` を使う | P0 | S | 使わない。正は `pnpm --filter @gs-v2/worker dev`。script は `flue dev --target cloudflare --port 8787` です。素の `wrangler.jsonc` は `main: src/index.ts` だがそのファイルが無いので罠です。 |
| Worker/Web 同時起動不足 | P0 | S | Worker `8787`、Web `5173` を両方起動。Web は Service Binding `API -> aimani-gs-v2` 経由で Worker を呼びます。proxy はローカル Host 制約回避で `https://localhost/api/...` に投げます。 |
| `SAKURA_API_TOKEN` 不備 | P0 | S | `apps/worker/.dev.vars` に設定。現在はキー自体は set。無効/空だと [sparring-agent.ts](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/apps/worker/src/agents/sparring-agent.ts:28) の provider 呼び出しが prompt 時に失敗し、workflow catch で `ai_runs.failed` + system message になります。AI応答本文は見られません。 |
| OAuthなし認証 | P0→解消済み寄り | S | 現ワークツリーなら `DEV_AUTH_BYPASS_USER_ID` で通る。実装は [auth-helpers.ts](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/apps/worker/src/lib/auth-helpers.ts:14) と [app.ts](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/apps/worker/src/app.ts:55)。ただし未コミット差分なので、別環境/HEADでは消えます。本番には絶対設定しない。 |
| Better Auth cookie偽装の理解不足 | P1 | M | bypassを使わない場合のみ必要。`user` と `session` をINSERTし、さらに `better-auth.session_token` を `BETTER_AUTH_SECRET` で署名したcookieにする。未署名tokenを置いても `getSignedCookie` で弾かれます。 |
| `INTERNAL_ROUTE_SECRET` 不備 | P1 | S | `.dev.vars` に設定。内部workflow起動は `http://internal/workflows/...` かつ header も付ける実装。ローカルは hostname allowlist で通る可能性が高いが、設定しておくのが安全。 |
| Flue runtime/cli version skew | P2 | M | runtime beta.2 / cli beta.1 / `agents:^0.16.2`。今日のデモが既に動くなら触らない。次PRで pin/整合。nightly でも罠扱い。 |
| AI 60秒 timeout | P2 | S-M | 短い入力でデモする。現状は `Promise.race` で表示上失敗にするだけで、実promptキャンセルではない。遅いとUIは失敗表示になります。 |
| 「人につなげる」推薦未実装 | P3 | M-L | 今日の「チャット→AI応答」には不要。ただしProduct Boundaryとしては次の本丸。 |

**Better Auth 直接INSERTで必要なもの**
`0004_auth.sql` 基準では最低限これです。

- `"user"`: `id`, `name`, `email`, `emailVerified`, `createdAt`, `updatedAt`
- `"session"`: `id`, `expiresAt` 未来日時, `token` UNIQUE, `createdAt`, `updatedAt`, `userId`
- `account` と `verification` は `get-session` には不要
- `user.id` は member id として使われるので、`^[A-Za-z0-9_-]+$` かつ128文字以内にする
- Cookie はローカルHTTPなら `better-auth.session_token=<urlencoded token.signature>`。signature は `HMAC-SHA256(token, BETTER_AUTH_SECRET)` のbase64

例:
```sql
INSERT INTO "user" (id, name, email, emailVerified, image, createdAt, updatedAt)
VALUES ('dev_user', 'Devユーザー', 'dev@example.local', 1, NULL, datetime('now'), datetime('now'));

INSERT INTO "session" (id, expiresAt, token, createdAt, updatedAt, ipAddress, userAgent, userId)
VALUES ('dev_session', datetime('now', '+1 day'), 'dev-session-token', datetime('now'), datetime('now'), NULL, NULL, 'dev_user');
```

**最短デモ手順**
1. `apps/worker/.dev.vars` に `DEV_AUTH_BYPASS_USER_ID=<URL-safeなID>`、`SAKURA_API_TOKEN`、`INTERNAL_ROUTE_SECRET` を置く。現在はキー有り。
2. `apps/worker` で `wrangler d1 migrations apply aimani-gs-v2-db --local`
3. ルートから `pnpm --filter @gs-v2/worker dev`
4. 別ターミナルで `pnpm --filter @gs-v2/web dev`
5. `http://localhost:5173/chat` を開く
6. 短い相談文を送る
7. 期待値: 人間メッセージ表示 → `接続中...` / `AIが相談の材料を整理しています...` → AI吹き出し表示

この経路では GitHub OAuth、Better Auth DBの `user/session` INSERT、cookie偽装は不要です。