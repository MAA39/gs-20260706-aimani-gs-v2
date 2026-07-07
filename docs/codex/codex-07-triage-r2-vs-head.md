現作業ツリーの現コードを読んだ判定です。

| 指摘ID | 判定 | 根拠となる現コードのファイル:行 | 残作業 |
|---|---|---|---|
| TSU-001 | 修正済み | `apps/worker/src/routes/chat.ts:55-62`, `apps/worker/src/routes/chat.ts:129-130` | 回帰テスト追加 |
| TSU-002 | 修正済み | `packages/contracts/src/api/member.ts:16-18`, `apps/worker/src/routes/member.ts:19-21` | teacher/admin昇格フローの仕様化 |
| TSU-003 | 部分対応 | `packages/db/src/adapters/d1-chat-repository.ts:94-123`, `apps/worker/src/routes/chat.ts:135-142` | `MessageSequenceConflict` をAPIで409等に明示処理 |
| TSU-004 | 未対応 | `apps/worker/src/workflows/sparring-workflow.ts:32-40`, `packages/domain/src/use-cases/send-message.ts:48-61` | 1 chat 1 in-flight / queue / snapshot の実装 |
| TSU-005 | 部分対応 | `apps/worker/src/workflows/sparring-workflow.ts:80-83`, `apps/worker/src/routes/chat.ts:34-41`, `apps/web/src/routes/chat.tsx:57-60` | dispatch失敗・timeout・UI可視化の終端状態 |
| TSU-006 | 修正済み | `apps/worker/src/routes/chat.ts:73-75`, `apps/worker/src/routes/chat.ts:121-123` | 履歴全体のAI投入上限はADV-011側で残 |
| TSU-007 | 未対応 | `packages/domain/src/use-cases/send-message.ts:48-61`, `packages/domain/src/use-cases/start-chat.ts:48-54` | `Idempotency-Key` を受け取りmessage/aiRun重複を抑止 |
| MIH-001 | 未対応 | `apps/web/src/lib/api-client.ts:37`, `apps/web/src/lib/api-client.ts:48`, `apps/web/src/lib/api-client.ts:56`, `apps/worker/src/routes/chat.ts:24` | `throw new Error` をResult返却へ変更 |
| MIH-002 | 未対応 | `apps/worker/src/routes/chat.ts:79-85`, `apps/worker/src/routes/chat.ts:135-142` | `default` を消し、全 `_tag` + `satisfies never` |
| MIH-003 | 部分対応 | `packages/contracts/src/api/parse.ts:35-47`, `apps/worker/src/routes/chat.ts:69`, `apps/worker/src/routes/chat.ts:116-117`, `apps/worker/src/workflows/sparring-workflow.ts:20` | 追加済みparserをroute/workflow境界で実使用、ID parser追加 |
| MIH-004 | 部分対応 | `packages/db/migrations/0001_members.sql:6-9`, `packages/domain/src/models/ai-run.ts:9-15`, `packages/db/migrations/0003_ai_runs.sql:8-14` | aiRun等のnullableをUnion/別テーブル/ADRで整理 |
| MIH-005 | 部分対応 | `packages/db/src/adapters/d1-member-repository.ts:47-67`, `packages/db/src/adapters/d1-ai-run-repository.ts:76-96`, `packages/db/src/adapters/d1-ai-run-repository.ts:247-264` | `appendEvent` の失敗を握り潰す設計の扱いを確定 |
| MIH-006 | 修正済み | `packages/db/src/adapters/d1-chat-repository.ts:94-123` | 同時appendの契約テスト |
| MIH-007 | 部分対応 | `packages/domain/src/use-cases/send-message.ts:31-42`, `apps/worker/src/routes/chat.ts:125-133` | routeからactorを渡す。現状呼び出し引数も未追随 |
| MIH-008 | 未対応 | `.github/workflows/ci.yml:173-179`, `package.json:9` | CIで `pnpm test` 実行、対象テスト追加 |
| MIH-009 | 修正済み | `apps/web/src/routes/chat.tsx:17-24`, `apps/web/src/lib/api-client.ts:33-54`, `apps/worker/src/routes/chat.ts:55-62` | 認証E2Eテスト |
| ADV-001 | 修正済み | `apps/worker/src/routes/chat.ts:55-62`, `apps/worker/src/routes/chat.ts:159-166`, `apps/worker/src/routes/chat.ts:174-175` | 回帰テスト追加 |
| ADV-002 | 部分対応 | `apps/worker/src/app.ts:67-85`, `apps/worker/src/routes/chat.ts:29-32`, `apps/worker/src/workflows/sparring-workflow.ts:20` | workflow payloadのaiRun/chat/trigger整合性検証 |
| ADV-003 | 未対応 | `apps/worker/src/routes/chat.ts:125-130`, `apps/worker/src/routes/chat.ts:170-175` | owner違いと不存在の応答を同一化 |
| ADV-004 | 修正済み | `packages/db/src/adapters/d1-chat-repository.ts:94-123` | API層の409表現はTSU-003残作業 |
| ADV-005 | 未対応 | `apps/worker/src/workflows/sparring-workflow.ts:11-14`, `apps/worker/src/workflows/sparring-workflow.ts:32-40` | `triggerMessageId` 時点の履歴固定 |
| ADV-006 | 修正済み | `apps/worker/src/workflows/sparring-workflow.ts:25-29`, `apps/worker/src/workflows/sparring-workflow.ts:46-49` | `complete` 結果未確認の扱いは別途 |
| ADV-007 | 未対応 | `packages/domain/src/use-cases/send-message.ts:48-62`, `packages/domain/src/use-cases/start-chat.ts:40-54` | human message作成とai_run作成の原子化 |
| ADV-008 | 未対応 | `apps/worker/src/routes/chat.ts:34-41` | dispatch失敗時にaiRunをfailed化 |
| ADV-009 | 未対応 | `apps/worker/src/workflows/sparring-workflow.ts:52-54`, `apps/web/src/routes/chat.tsx:57-60` | AI呼び出しtimeout/abortと失敗可視化 |
| ADV-010 | 未対応 | `packages/db/migrations/0003_ai_runs.sql:4-5`, `packages/db/migrations/0003_ai_runs.sql:19-20` | `chat_id` と `trigger_message_id` の同一chat制約 |
| ADV-011 | 部分対応 | `apps/worker/src/routes/chat.ts:64-74`, `apps/worker/src/routes/chat.ts:111-122`, `apps/worker/src/workflows/sparring-workflow.ts:38-53` | chat body limit、履歴/prompt上限、AI timeout |
| ADV-012 | 未対応 | `apps/web/src/lib/api-client.ts:37`, `apps/web/src/lib/api-client.ts:48`, `apps/web/src/lib/api-client.ts:56`, `apps/worker/src/routes/chat.ts:24` | 全 `throw new Error` 除去 |