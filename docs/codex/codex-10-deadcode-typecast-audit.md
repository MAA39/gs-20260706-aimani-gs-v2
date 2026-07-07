対象は `apps/worker/src/`、`apps/web/src/`、`packages/`。`node_modules/.wrangler/routeTree.gen.ts` は除外。ファイル変更はしていません。

**① デッドコード**

| ファイル:行 | コード断片 | 判定 | 推奨対応 |
|---|---|---|---|
| `packages/contracts/src/api/member.ts:3` | `export interface MemberDto` | repo内参照なし。`CreateMember` 関連DTO残骸候補 | 使うなら member API response 契約に採用。使わないなら削除 |
| `packages/contracts/src/events/ai-run-progress.ts:1` | `export type AiRunProgressEvent =` | `index.ts` re-export のみ。実消費なし | SSE/進捗通知で使う予定がなければ削除 |
| `packages/contracts/src/errors.ts:1,10,12` | `ErrorCode`, `type ErrorCode`, `ApiError` | `index.ts` re-export と自己参照のみ | API error 契約として route/client に寄せるか削除 |
| `packages/shared/src/index.ts:3` | `export type UserId` | 参照ゼロ | 直近で使わないなら削除 |
| `packages/shared/src/index.ts:9` | `export type QuestionCardId` | 参照ゼロ | question card 実装まで削除またはADR/Issueに紐付け |
| `packages/domain/src/ports/member-repository.ts:12` | `findByRole(...)` | public port method。実呼び出しなし。DB/Fake実装のみ | use-case が出るまで port/db/fake から削除 |
| `packages/domain/src/ports/member-repository.ts:13` | `findBySkills(...)` | public port method。実呼び出しなし。DB/Fake実装のみ | 同上 |
| `packages/domain/src/ports/chat-repository.ts:14` | `findByMember(...)` | public port method。実呼び出しなし。DB/Fake実装のみ | チャット一覧use-caseがなければ削除 |
| `packages/domain/src/ports/ai-run-repository.ts:16` | `markRepairing(...)` | public port method。実呼び出しなし。DB/Fake実装のみ | repair workflow 未実装なら削除かIssue化 |
| `packages/domain/src/ports/ai-run-repository.ts:20` | `listEventsAfter(...)` | public port method。実呼び出しなし。DB/Fake実装のみ | progress polling/SSE 未実装なら削除 |
| 全対象 | 未使用 import | `tsc --noUnusedLocals --noUnusedParameters` で未検出 | 対応不要 |
| 全対象 | 未使用ファイル | 明確な未使用ファイルは上記 contracts の実消費なし公開ファイルのみ | re-export を公開APIとみなすか整理方針を決める |

**② `as` キャスト**

| ファイル:行 | コード断片 | 判定 | 推奨対応 |
|---|---|---|---|
| `apps/web/src/lib/api-client.ts:43` | `body as Record<string, unknown>` | C: `object !== null` 後の局所narrow | 許容 |
| `apps/web/src/lib/api-client.ts:72` | `(await res.json()) as T` | A: 外部APIレスポンスをparseなしで直接cast | response parser を追加 |
| `apps/web/src/lib/api-proxy.ts:24` | `headers as Headers & ...` | C: 非標準メソッド検出用。直後に `typeof` guard | 許容 |
| `apps/web/src/routeTree.gen.ts:20,25,30` | `} as any)` | C: TanStack生成ファイル | 手編集せず生成に任せる |
| `apps/web/src/routes/api/$.ts:13` | `as unknown as { env: ... }` | B: CF runtime 境界の二段階cast | `env?.API?.fetch` の関数guardを追加 |
| `apps/web/src/routes/chat.tsx:348,412,440` | `'wrap'/'center'/'none' as const` | C: CSS literal固定 | 許容 |
| `apps/worker/src/auth.ts:26` | `db as any` | B: adapter境界で `any` | adapter用型ラッパーに閉じ込める |
| `apps/worker/src/lib/auth-helpers.ts:32-34` | response object `as const` | C: literal固定 | 許容 |
| `apps/worker/src/middleware/body-limit.ts:8` | `BODY_LIMITS ... as const` | C: literal固定 | 許容 |
| `apps/worker/src/routes/chat.ts:56` | `session.user.id as MemberId` | A: auth session id をparseなしBrand化 | `parseMemberId` を通す |
| `apps/worker/src/routes/chat.ts:81` | `crypto.randomUUID() as MessageId` | C: id生成直後のBrand付与 | 許容 |
| `apps/worker/src/routes/chat.ts:95` | `executionCtx as ExecutionContext` | C: Hono/Workers型橋渡し | 許容。型alias化すると読みやすい |
| `apps/worker/src/routes/member.ts:45` | `(session.ok ? session.user.id : crypto.randomUUID()) as MemberId` | A: session branch がparseなし | session id だけ `parseMemberId` |
| `apps/worker/src/workflows/sparring-workflow.ts:24` | `payload as Record<string, unknown>` | C: object guard 後、各ID parseあり | 許容 |
| `apps/worker/src/workflows/sparring-workflow.ts:50,124` | `crypto.randomUUID() as MessageId` | C: id生成直後のBrand付与 | 許容 |
| `packages/contracts/src/errors.ts:8` | `} as const` | C: literal固定 | 許容 |
| `packages/db/src/adapters/d1-ai-run-repository.ts:35-39,54-55` | `row.* as ...` | B: DB row → domain model | row parser/enum検証を追加 |
| `packages/db/src/adapters/d1-chat-repository.ts:27-30,38-40` | `row.* as ...` | B: DB row → domain model | row parser/enum検証を追加 |
| `packages/db/src/adapters/d1-member-repository.ts:24,26` | `row.* as ...` | B: DB row → domain model | `role` enum検証を追加 |
| `packages/domain/src/use-cases/start-chat.ts:36,40,48` | `deps.idGen() as ...` | C: idGen直後のBrand付与 | 許容 |
| `packages/domain/src/use-cases/send-message.ts:62,70` | `deps.idGen() as ...` | C: idGen直後のBrand付与 | 許容 |
| `packages/domain/src/use-cases/__tests__/fixtures.ts:13-16,169` | test helper Brand casts | C: テストfixture用 | 許容。169行目は冗長なので削除可 |
| `packages/shared/src/index.ts:24` | `raw as T` | C: parse成功後のBrand付与 | 許容 |
| `packages/shared/src/index.ts:50,57,63,69,79` | enum-like object `as const` | C: literal固定 | 許容 |

**③ throw**

| ファイル:行 | コード断片 | 判定 | 推奨対応 |
|---|---|---|---|
| 全対象 | `throw` / `throw new Error` | 0件 | 対応不要 |