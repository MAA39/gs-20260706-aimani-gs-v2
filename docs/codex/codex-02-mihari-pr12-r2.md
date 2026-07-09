**ミハリレビュー**

前提: Effect-TS未導入は既知として、L1/L2は「Effect導入」ではなく、現行Result型・Brand型で同等の網羅性を作る前提で分類しています。ファイル変更はしていません。

### MIH-001
- レベル: L1 エラーハンドリング
- 確証度: 100%
- ファイル: [apps/web/src/lib/api-client.ts](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/apps/web/src/lib/api-client.ts:36):36,49,62,70 / [.github/workflows/ci.yml](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/.github/workflows/ci.yml:169):169
- 指摘: `throw new Error` が追加されており、AGENTS L0とCIのrepository throw guardに違反します。
- 推奨対応: 即修正。`Promise<Result<T, ApiClientError>>` などに寄せ、React Query側もResultを見てUI分岐する。

### MIH-002
- レベル: L1 エラーハンドリング
- 確証度: 95%
- ファイル: [apps/worker/src/routes/chat.ts](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/apps/worker/src/routes/chat.ts:53):53-59,99-107,140-141
- 指摘: `_tag` の `switch` が `default` で丸めており、新しいエラー追加時に網羅漏れを検出できません。
- 推奨対応: 即修正。`default` を消し、全 `_tag` を列挙した上で `satisfies never` 相当の到達不能チェックを入れる。

### MIH-003
- レベル: L2 型安全
- 確証度: 95%
- ファイル: [apps/worker/src/routes/chat.ts](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/apps/worker/src/routes/chat.ts:40):40,45,81,82,123,128 / [apps/worker/src/routes/member.ts](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/apps/worker/src/routes/member.ts:10):10,16,37 / [apps/worker/src/workflows/sparring-workflow.ts](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/apps/worker/src/workflows/sparring-workflow.ts:20):20
- 指摘: `c.req.json<T>()` と `as MemberId/ChatId/SparringPayload` が境界parseをせず型証明を捨てています。
- 推奨対応: 即修正。Effect未導入なら手書きparserでよいので、contracts/sharedに `parseMemberId` / `parseChatId` / request parserを置き、失敗をResultで400へ返す。

### MIH-004
- レベル: L5 DB設計
- 確証度: 98%
- ファイル: [packages/db/migrations/0001_members.sql](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/packages/db/migrations/0001_members.sql:10):10-12 / [0002_chats_messages.sql](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/packages/db/migrations/0002_chats_messages.sql:5):5 / [0003_ai_runs.sql](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/packages/db/migrations/0003_ai_runs.sql:8):8,9,13,14 / [packages/domain/src/models/ai-run.ts](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/packages/domain/src/models/ai-run.ts:9):9,10,14,15
- 指摘: nullableカラムがそのまま `string | null` としてDomainまで貫通しています。
- 推奨対応: 即修正。新規migrationなので、適用前にNOT NULL + DEFAULT、別テーブル分離、または状態Union化へ直す。nullable維持ならADR/SpecGap理由が必要。

### MIH-005
- レベル: L1 エラーハンドリング
- 確証度: 90%
- ファイル: [packages/db/src/adapters/d1-member-repository.ts](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/packages/db/src/adapters/d1-member-repository.ts:79):79-98 / [packages/db/src/adapters/d1-chat-repository.ts](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/packages/db/src/adapters/d1-chat-repository.ts:52):52-55,81-84 / [packages/db/src/adapters/d1-ai-run-repository.ts](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/packages/db/src/adapters/d1-ai-run-repository.ts:70):70-83
- 指摘: D1の`.run()`/`.all()`失敗がResultに包まれず、`*DbFailure` や `*Conflict` 型が実装で活きていません。
- 推奨対応: 即修正。D1例外・CHECK/UNIQUE/FOREIGN KEY失敗をcatchして、既存のResultエラーUnionへ写像する。

### MIH-006
- レベル: L5 DB設計
- 確証度: 85%
- ファイル: [packages/db/src/adapters/d1-chat-repository.ts](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/packages/db/src/adapters/d1-chat-repository.ts:104):104-109 / [packages/db/src/adapters/d1-ai-run-repository.ts](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/packages/db/src/adapters/d1-ai-run-repository.ts:196):196-209
- 指摘: `MAX(sequence)+1` は並行appendで同じsequenceを採番し、D1のUNIQUE制約違反に落ちます。
- 推奨対応: 即修正。insert時の競合をResultの `MessageSequenceConflict` 等に写像してretryするか、sequence採番をDB側の一文/トランザクション相当に寄せる。

### MIH-007
- レベル: L3 アーキテクチャ
- 確証度: 88%
- ファイル: [packages/domain/src/use-cases/send-message.ts](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/packages/domain/src/use-cases/send-message.ts:24):24-28 / [apps/worker/src/routes/chat.ts](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/apps/worker/src/routes/chat.ts:89):89-95
- 指摘: 「自分のchatにだけ送信できる」という業務ルールがHono route側にあり、usecaseはactorなしで任意chatへ送信可能です。
- 推奨対応: 即修正。`sendMessage` に `actorMemberId` を渡し、Domain/UseCase側で所有者チェックして `MemberNotAuthorized` を返す。

### MIH-008
- レベル: L6 テスト契約
- 確証度: 100%
- ファイル: [.github/workflows/ci.yml](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/.github/workflows/ci.yml:173):173-179 / [package.json](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/package.json:9):9
- 指摘: rootに `test` scriptはあるのにCIは実テストを実行せずechoのみです。差分にもテストファイルがありません。
- 推奨対応: 即修正。少なくとも `startChat`、`sendMessage`、所有者違い403、archived chat 409、D1競合系の契約テストを追加し、CIで `pnpm test` を実行する。

### MIH-009
- レベル: L6 / SpecGap
- 確証度: 80%
- ファイル: [apps/web/src/routes/chat.tsx](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/apps/web/src/routes/chat.tsx:16):16-29 / [apps/web/src/lib/api-client.ts](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/apps/web/src/lib/api-client.ts:45):45,58 / [apps/worker/src/routes/chat.ts](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/apps/worker/src/routes/chat.ts:40):40,76,123
- 指摘: SpecGap: `localStorage` のmemberIdと `x-user-id` headerを本人性として信頼しています。匿名MVPなら仕様化、本人性が必要なら未定義です。
- 推奨対応: 後続タスク。bad-catalogに本人性/なりすましのBTを追加し、認証導入前の許容範囲をPRコメントで明示する。