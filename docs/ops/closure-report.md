# クローズレポート — aimani G's V2（2026-07-09）

> プロダクトクローズに伴う最終棚卸し。main は typecheck 全6パッケージ・テスト34本・build 全て green の状態でマージ済み。
> 再開する場合はこの文書と docs/ops/roadmap.md、docs/ops/nightly/ の2本から読むこと。

## 到達点

Phase 1（壁打ち垂直スライス）完了。チャット→Flue workflow→さくらAI gpt-oss-120b→応答（実測3〜10秒）、
better-auth認証（GitHub OAuth・devバイパス）、履歴一覧、進捗polling、テスト34本、CI、E2E実機確認済み。
Phase 2（UI刷新）以降は未着手。

## 既知の不具合・制限（未修正のまま残るもの）

### 機能欠落（仕様判断待ちのまま凍結）

| ID | 内容 | 状態 |
|---|---|---|
| TSU-007 | Idempotency-Key未実装。二重送信の完全排除は未達（UI無効化+in-flight 409で実質防御はあり） | D1列・UNIQUE制約は準備済み。ヘッダ設計が未決 |
| MIH-004残り | ai_runsのstate依存nullable（flue_run_id/result_hash/error_message等）が`string | null`のままdomainまで貫通 | 完全な設計案は docs/codex/codex-21-d1-schema-migration-design.md SCH-03 |
| ADV-009残り | AIタイムアウト（60s）後もFlue側のprompt実行は中断されない（トークンコストのリーク）。Flueにcancel APIが無い | Flue側のAPI待ちのまま凍結 |
| ADV-011残り | AI投入する会話履歴に上限なし。長い会話ほどトークンコスト増 | truncate方針（トークン数上限）が未決 |
| — | messages.bodyに上限CHECKなし（human入力は4000字でparse拒否済み。AI応答側が未制限） | AI応答長の上限が未確定のため意図的に未設定 |

### 運用リスク（本番投入前に必須だったもの）

| ID | 内容 |
|---|---|
| R3-06 | rate limiter binding欠落時にfail-open（警告ログのみで全許可）。flue buildがwrangler.jsoncのrate_limitsを引き継がない問題への暫定耐性であり、恒久対応未 |
| — | DEV_AUTH_BYPASS_USER_ID が .dev.vars に存在。本番環境に設定すると認証素通りになる（本番には未設定のはず、要確認） |
| — | 依存バージョン未固定: `agents: ^0.16.2`（^付き）、flue runtime beta.2 vs cli beta.1 の版ズレ（codex-12） |
| — | 素の `wrangler dev` は古いdistを配信する罠あり。開発は必ず `flue dev`（pnpm --filter @gs-v2/worker dev）を使う |

### コード品質の残債（動作には影響なし）

| ID | 内容 |
|---|---|
| ARCH-01 | Result形状が不統一（shared `IdParseResult` / worker `SessionResult` がreasonベース、他は`_tag` union） |
| ARCH-02 | DB row→domainのBrand型復元が`as` cast（parse関数化されていない）。api-clientの`res.json() as T`も同様 |
| ARCH-03 | Whyコメントがコード内に残存（AGENTS L0-5「ADR slug参照のみ」違反）。対象一覧は docs/codex/codex-18-arch-agents-audit.md |
| ARCH-04 | 命名規約違反（`data_json`、`const result`等） |
| ARCH-10 | `ChatNotOwned`型の定義位置がsend-message.ts（レイヤー上不自然） |
| WEB-02 | queryFnがApiResultを成功データとして返すため、TanStack Queryのretry/isErrorがHTTPエラーに効かない |
| WEB-04 | /chatの認証保護がuseEffect+navigate（beforeLoad未使用、returnTo保存なし） |
| WEB-09 | optimistic表示の照合が本文一致のみ（同一本文の過去メッセージで仮バブルが早期消滅） |
| WEB-11 | QueryのAbortSignalがapi-clientに未伝搬（unmount後の不要リクエストを中断できない） |
| — | 0004_auth.sqlの日時が`datetime('now')`（ISO形式`T/Z`なし）で0001-0003と不統一（better-auth境界として許容した） |

### 修正済みで再発注意のもの（記録として）

- 全ブラウザhydration不発 → __root.tsxの`<Scripts />`欠落が原因やった（7d8e38a）。TanStack Start利用時の定番罠
- チャット永久in-flight停止 → AI応答書き込みとcompleted遷移の非原子性（9ce8900で根絶）
- 内部route gateのfail-open → secret未設定時`undefined===undefined`（9ce8900でfail-closed化）

## ブロッカー（本番稼働に至らなかった理由）

1. GitHub OAuth App未作成 → 本番secrets（BETTER_AUTH_SECRET / GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET / INTERNAL_ROUTE_SECRET）未投入 → 本番では認証が503
2. D1本番migrationが未適用（`wrangler d1 migrations apply aimani-gs-v2-db --remote` 未実行）
3. Phase 2以降（UI刷新・推薦=Product Boundaryの本丸）が未着手のため、価値検証に届いていない

## 後片付け — 人間の手が要るもの

コードとドキュメントはこのリポジトリで完結。外部リソースの削除は破壊的操作のため実施していない:

- [ ] Cloudflare Workers: `aimani-gs-v2-worker` / `aimani-gs-v2-web` のデプロイ削除（`wrangler delete`、コスト発生源にはならないが放置しない）
- [ ] Cloudflare D1: `aimani-gs-v2-db`（本番側。migrations未適用なら空のはず）削除
- [ ] さくらAI APIトークンの失効（.dev.vars の SAKURA_API_TOKEN）
- [ ] GitHub OAuth App（作成済みの場合のみ）削除
- [ ] ローカル: `apps/worker/.dev.vars` の破棄（トークン類を含む）
- [ ] GitHubリポジトリのアーカイブ化（Settings → Archive this repository）

## 再開する場合の最短経路

1. `pnpm install` → `pnpm test` → 34本green確認
2. ローカルD1: `cd apps/worker && npx wrangler d1 migrations apply aimani-gs-v2-db --local`
3. `apps/worker/.dev.vars` を再作成（SAKURA_API_TOKEN / INTERNAL_ROUTE_SECRET / BETTER_AUTH_SECRET / DEV_AUTH_BYPASS_USER_ID）
4. dev起動2行: `pnpm --filter @gs-v2/worker dev`（8787） / `pnpm --filter @gs-v2/web dev`（5173）
5. 計画は docs/ops/roadmap.md、直近の裁定は docs/ops/nightly/2026-07-09-report.md、レビュー資産は docs/codex/（21本）と docs/investigation/（15本）
