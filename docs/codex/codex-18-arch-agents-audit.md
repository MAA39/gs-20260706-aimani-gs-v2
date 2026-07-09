監査対象32ファイルを読み取りのみで確認しました。変更・テスト実行はしていません。

**(1) ガードレール違反**

- **ARCH-01 [P1] Result系エラーが `_tag` union に統一されていない**
  - `packages/shared/src/index.ts:9` `IdParseResult` が `reason` ベース。
  - `apps/worker/src/auth.ts:40` `SessionResult` が `reason` ベース。
  - `apps/worker/src/lib/auth-helpers.ts:41` `reason` の `if` 分岐で、`switch` + `satisfies never` になっていない。

- **ARCH-02 [P1] Brand型境界が string / `as` で抜けている**
  - Port型: `packages/domain/src/ports/ai-run-repository.ts:13`, `packages/domain/src/ports/member-repository.ts:12`
  - domain内ID生成cast: `packages/domain/src/use-cases/start-chat.ts:36,42,50`, `packages/domain/src/use-cases/send-message.ts:62,70`
  - DB row mapper cast: `packages/db/src/adapters/d1-member-repository.ts:24,26`, `packages/db/src/adapters/d1-chat-repository.ts:27,28,30,38,39,40`, `packages/db/src/adapters/d1-ai-run-repository.ts:35,36,37,38,39,54,55`
  - worker UUID cast: `apps/worker/src/routes/member.ts:48`, `apps/worker/src/routes/chat.ts:85`, `apps/worker/src/workflows/sparring-workflow.ts:50,127`
  - `any`: `apps/worker/src/auth.ts:26`

- **ARCH-03 [P2] Why / 設計判断コメントがコード内に残っている**
  - 実装: `packages/shared/src/index.ts:13,14`, `packages/contracts/src/api/member.ts:16`, `packages/domain/src/use-cases/start-chat.ts:37`, `packages/domain/src/use-cases/send-message.ts:55`, `packages/db/src/adapters/d1-chat-repository.ts:102`, `packages/db/src/adapters/d1-ai-run-repository.ts:263`
  - worker: `apps/worker/src/app.ts:22,28,57`, `apps/worker/src/auth.ts:46,57`, `apps/worker/src/lib/auth-helpers.ts:10`, `apps/worker/src/middleware/body-limit.ts:6`, `apps/worker/src/routes/ai-run.ts:20`, `apps/worker/src/routes/member.ts:46`, `apps/worker/src/routes/chat.ts:30,69,80,83`, `apps/worker/src/workflows/sparring-workflow.ts:45,58,71,82,83,89,108,109`
  - テスト内コメントも厳密には対象: `packages/shared/src/parse-id.test.ts:4`, `packages/contracts/src/api/parse.test.ts:9,34,58`, `packages/domain/src/use-cases/__tests__/list-chat-messages.test.ts:6`, `packages/domain/src/use-cases/__tests__/send-message.test.ts:20,48,77`, `packages/domain/src/use-cases/__tests__/start-chat.test.ts:21`

- **ARCH-04 [P2] 命名規約 `data/result/run` 違反**
  - `data`: `packages/domain/src/models/ai-run.ts:25`, `packages/db/src/adapters/d1-ai-run-repository.ts:58,264,274`
  - `run`: `apps/worker/src/workflows/sparring-workflow.ts:35`
  - 実装内 `const result`: `apps/worker/src/routes/ai-run.ts:61`, `apps/worker/src/routes/chat.ts:167,200,250,289`, `apps/worker/src/routes/member.ts:49,76`, `packages/db/src/adapters/d1-ai-run-repository.ts:125,146,167,197,246`
  - テスト内 `const result`: `packages/contracts/src/api/parse.test.ts:13,48,60`, `packages/shared/src/parse-id.test.ts:8,17,23`, domain各use-case testの `result` 変数群。

- **確認済み: `throw` 直書きと domain I/O は検出なし**
  - `throw` / `new Error` は対象TS内にありません。
  - `packages/domain/src` はDB/crypto/fetch/new Date等の直接I/Oを持っていません。

**(2) 検討外れの実装**

- **ARCH-05 [P1] use-caseが複数DB writeを直列実行するが、Unit of Workがない**
  - `startChat`: `packages/domain/src/use-cases/start-chat.ts:39,43,51`
  - `sendMessage`: `packages/domain/src/use-cases/send-message.ts:63,71`
  - 途中失敗で「chatだけ作成」「human messageだけ作成」「AI runなし」が起き得る構造です。

- **ARCH-06 [P1] 1チャット1 active run制約がアプリ側チェックだけ**
  - `packages/domain/src/use-cases/send-message.ts:55`
  - `packages/db/src/adapters/d1-ai-run-repository.ts:105`
  - 並行送信時に双方が active run なしと見て、複数 queued run を作れる余地があります。

- **ARCH-07 [P1] AI run状態とevent logが非atomic**
  - `packages/db/src/adapters/d1-ai-run-repository.ts:138,159,184,213,259,263`
  - 状態遷移成功後にevent追記失敗を握りつぶすため、status APIとprogress/event APIの正本が分裂します。

- **ARCH-08 [P1] member作成APIだけ認証境界がズレている**
  - `apps/worker/src/routes/member.ts:45,46,48`
  - session失敗時に匿名UUIDへフォールバックして作成可能。chat側は認証必須なので境界が不一致です。

- **ARCH-09 [P2] API error contractと実際のHTTPエラーが乖離**
  - contract: `packages/contracts/src/errors.ts:1`
  - 実装側追加コード: `apps/worker/src/routes/chat.ts:36,38,40,155`, `apps/worker/src/routes/member.ts:23`
  - `ErrorCode` にないコードをrouteが返しています。

- **ARCH-10 [P2] 所有者チェックとHTTP変換が重複**
  - domain: `packages/domain/src/use-cases/list-chat-messages.ts:22`, `packages/domain/src/use-cases/get-ai-run-status.ts:27`, `packages/domain/src/use-cases/send-message.ts:47`
  - HTTP mapper: `apps/worker/src/routes/chat.ts:22`, `apps/worker/src/routes/ai-run.ts:16`
  - `ChatNotOwned` が `send-message.ts` 由来なのもレイヤー上の置き場が不自然です。

**(3) リファクタリング提案トップ5**

| 優先 | 影響度×工数 | Before | After |
|---|---:|---|---|
| 1 | 高×中〜大 | `startChat/sendMessage` が複数repoを直列write | `ChatCommandRepository` または `UnitOfWork` を作り、chat/message/ai_run作成を1トランザクション境界に集約 |
| 2 | 高×中 | Result形状が domain/shared/auth/contracts で分散 | `Result<T,E extends {_tag:string}>` を shared に置き、parse/authも `_tag` error union + exhaustive switch に統一 |
| 3 | 高×中 | ID/enumを `as` で復元 | `IdGen<TBrand>`、DB mapperのparse関数、`findActiveByChatId(chatId: ChatId)`、`findByRole(role: Role)` に変更 |
| 4 | 高×中〜大 | AI run status更新とevent追記が別処理 | lifecycle専用repoで状態更新+event追記を同一DB操作にし、active run一意制約もDB側へ寄せる |
| 5 | 中×中 | routeごとにauth/member/error/DTO変換が重複 | workerに `http-boundary` 層を作り、認証、member保証、ErrorCode変換、DTO mapperを集約 |