対象は `git diff main..feature/4-empty-box-deploy` です。作業ツリーには未コミット修正がありましたが、下記はブランチ差分基準で見ています。ファイル変更はしていません。

## 指摘

### MIH-001
- レベル: L1（L0絶対ルール3にも抵触）
- 確証度: 100%
- ファイル:行: `apps/web/src/lib/api-client.ts:36`, `:49`, `:62`, `:68`
- 問題: `throw new Error` が残っており、`.github/workflows/ci.yml:169` の repository throw guard でCI失敗する。
- 推奨対応: 即修正
- 対応案: API clientも `Result` を返すか、UI境界で扱うエラー型に変換する。少なくとも `throw new Error` は除去。

### MIH-002
- レベル: L3
- 確証度: 90%
- ファイル:行: `apps/worker/wrangler.jsonc:6`
- 問題: `main` が `src/index.ts` を指しているが、ブランチ上に `apps/worker/src/index.ts` が存在しない。デプロイ/直接wrangler運用で入口不整合になる。
- 推奨対応: 即修正
- 対応案: `src/index.ts` で `app.ts` を re-export するか、Flue/Wranglerの正式入口を `src/app.ts` に統一する。

### MIH-003
- レベル: L3
- 確証度: 95%
- ファイル:行: `apps/worker/src/routes/chat.ts:75`, `:88`, `:113`; `apps/web/src/lib/api-client.ts:66`
- 問題: ブランチ差分上、`POST /:chatId/messages` は `x-user-id` の存在だけ見て `chat.memberId` と照合しない。`GET /:chatId/messages` はヘッダーすら要求しない。D1にRLSがない前提なので、アプリ層ガードが必要。
- 推奨対応: 即修正
- 対応案: 送信/取得とも `chat.memberId === memberId` を確認し、403契約テストを追加。フロントの取得にも `x-user-id` を渡す。

### MIH-004
- レベル: L5
- 確証度: 90%
- ファイル:行: `packages/db/src/adapters/d1-chat-repository.ts:76`, `:104`; `packages/db/src/adapters/d1-ai-run-repository.ts:196`
- 問題: `MAX(sequence)+1` を読んでからINSERTする非アトミック採番。Workersの並行POST/再送で `UNIQUE(chat_id, sequence)` / `UNIQUE(ai_run_id, sequence)` に衝突し、しかも例外が `Result` に包まれない。
- 推奨対応: 即修正
- 対応案: 単一SQLまたはD1の安全なトランザクション/リトライで採番し、制約違反は `MessageSequenceConflict` 等に変換する。

### MIH-005
- レベル: L2
- 確証度: 88%
- ファイル:行: `apps/worker/src/routes/chat.ts:45`, `:82`; `apps/worker/src/routes/member.ts:10`; `apps/worker/src/workflows/sparring-workflow.ts:20`
- 問題: 外部入力を `c.req.json<T>()` / `payload as SparringPayload` で型アサーションしている。壊れたJSON、未知role、不正payloadが400/ResultではなくDB CHECK例外や500に流れる。
- 推奨対応: 即修正
- 対応案: Effect-TSは深追いせず、軽量な `parseXxx(): Result<Parsed, InvalidRequest>` を境界に置く。

### MIH-006
- レベル: L1
- 確証度: 85%
- ファイル:行: `apps/worker/src/routes/chat.ts:57`, `:96`; `apps/worker/src/routes/member.ts:29`
- 問題: `switch` が `default` でcatch-allしており、新しい `_tag` が増えてもコンパイルで漏れない。L0の「switch/satisfies neverで網羅」に反する。
- 推奨対応: 即修正
- 対応案: `_tag` ごとに明示変換し、defaultではなく `const _exhaustive: never = result.error` で落とす。

### MIH-007
- レベル: L6
- 確証度: 100%
- ファイル:行: `.github/workflows/ci.yml:173`; `apps/worker/package.json:5`; `packages/domain/package.json:9`; `packages/db/package.json:10`
- 問題: CIの `test-slot` は echo のみ。ブランチ上に実テストも package test script もない。今回の認可漏れや400/403/409契約がCIで検知不能。
- 推奨対応: 即修正
- 対応案: 最低限、HTTP契約テストを追加し、CIで `pnpm test` を実行する。テスト名は仕様文にする。

### MIH-008
- レベル: L5
- 確証度: 80%
- ファイル:行: `packages/db/migrations/0001_members.sql:10`, `0002_chats_messages.sql:5`, `0003_ai_runs.sql:8`; `packages/domain/src/models/ai-run.ts:9`
- 問題: nullableカラムがdomain型の `string | null` に貫通している。特に `ai_runs` はstatus別の状態をnullableフィールドで表している。
- 推奨対応: 後続タスク
- 対応案: URL/title等はnullable理由をADR/コメントではなく正本に残す。`AiRun` は `_tag` unionで queued/generating/completed/failed を分けるか、イベント/別テーブル化を検討。

## 見送り

Effect-TS未導入そのもの、`Effect.fail` / `catchTags` / `Schema` 未使用そのものは、依頼の前提どおり指摘ID化していません。ADR-V2-006のResult型方針に寄せて見ています。