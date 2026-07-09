# 独立コードレビュー（Sonnet） — feature/4-empty-box-deploy

対象: `git diff main..feature/4-empty-box-deploy`
構成: Hono API (CF Workers) / Sakura AI / D1 / TanStack Start (Service Binding逆プロキシ)

凡例: P0=マージ前に必須修正、P1=早期修正推奨、P2=改善提案

---

## 1. 正しさのバグ（Correctness）

### SON-001 / P1 / `apps/worker/src/routes/chat.ts:253-278` (`GET /:chatId/messages`)
このエンドポイントだけ `x-user-id` ヘッダのチェックがない。POST系2つのエンドポイントは `memberId` を要求しているのに、メッセージ一覧取得は誰でも `chatId`（UUID）さえ知れば認可なしで読める。他人の壁打ちログを閲覧できてしまう非対称な認可漏れ。

### SON-002 / P1 / `apps/worker/src/routes/chat.ts:215-251` (`POST /:chatId/messages`)
`x-user-id` ヘッダの値は存在チェックのみで、対象 `chatId` の `chat.memberId` と一致するかの検証が一切ない（`chatRepo.findById` すら呼ばれていない）。任意のメンバーIDを名乗れば他人のチャットに任意のメッセージを送信できる。ヘッダはクライアントが自由に設定できる値なので、実質認可なし。

### SON-003 / P1 / `apps/worker/src/workflows/sparring-workflow.ts:361-362`
```ts
const admitResult = await aiRunRepo.markAdmitted(input.aiRunId);
if (!admitResult.ok) return;
```
CAS遷移が失敗した場合、`aiRunRepo.fail()` を呼ばずに黙って `return` している（他の失敗パスは全て `fail()` を呼んでいるのと非対称）。ワークフローが再実行された場合や競合時、`ai_runs.status` が `queued` のまま固まり、フロントは `waitingForAi` のポーリングを永遠に続ける（SON-006参照）。

### SON-004 / P1 / `packages/db/src/adapters/d1-chat-repository.ts:1042-1076`（`getNextSequence` + `appendMessage`）と `packages/db/src/adapters/d1-ai-run-repository.ts:945-958`（`appendEvent`）
`sequence` は「`MAX(sequence)` を読む→+1して`INSERT`」という非アトミックな2段階操作で、`db.batch()` やトランザクションで束ねられていない。同一 `chatId`／`aiRunId` に対して並行書き込みが発生すると（例: ネットワーク再送によるPOST二重送信、将来的な同時ワークフロー実行）、`UNIQUE(chat_id, sequence)` / `UNIQUE(ai_run_id, sequence)` 制約違反が発生しうる。この例外は `Result` 型でラップされておらず、素の例外としてHonoのエラーハンドラに落ちる（500だがエラーコード体系から外れる）。

### SON-005 / P2 / `packages/domain/src/use-cases/start-chat.ts` / `send-message.ts`、`packages/domain/src/ports/ai-run-repository.ts:CreateQueuedRunInput.idempotencyKey`
`ai_runs.idempotency_key` は UNIQUE 制約付きでスキーマとポートに定義されているが、`startChat`/`sendMessage` のどちらも `idempotencyKey` を実際に渡していない。設計意図（重複実行防止）が配線されておらず、二重送信時に `aiRun` が重複作成される（SON-004のD1書き込み競合とも関連）。

### SON-006 / P1 / `apps/web/src/routes/chat.tsx:500-516`
`waitingForAi` を解除するタイムアウトが存在しない。ワークフロー側で例外が握りつぶされた場合（SON-003）や `aiRunRepo.fail()` が呼ばれてもフロントはそれを一切購読していない（`ai_run_events` / SSE的な仕組みは `contracts/events/ai-run-progress.ts` に定義されているのに未使用）ため、「考え中...」が無限に表示され続けるケースがある。

### SON-007 / P2 / `apps/worker/src/routes/chat.ts:153-168`（`triggerWorkflow`）
`executionCtx as ExecutionContext` のキャストで、渡している値は `{ waitUntil, passThroughOnException }` のみの部分実装。`appFetch` の内部実装（Flueランタイム側）がそれ以外のプロパティに依存すると実行時エラーになりうる型安全性の穴。

---

## 2. 重複・簡略化（Duplication / Simplification）

### SON-008 / P2 / `apps/web/src/lib/api-fetch.ts`
このファイル全体（`getApi()`）がどこからもimportされていないデッドコードで、`apps/web/src/routes/api/$.ts` 内に同種の `cloudflare:workers` 動的import + try/catchフォールバックロジックが再実装されている。二重管理になっており、削除するか `api-proxy.ts` 側に統合すべき。

### SON-009 / P2 / `apps/worker/src/routes/chat.ts:179-251`
`POST /` と `POST /:chatId/messages` の先頭（`x-user-id` 存在チェック→400、`message.trim()` 検証→400、`buildDeps` 呼び出し）がほぼ同一コードのコピペ。Honoミドルウェア化すべき。

### SON-010 / P2 / `packages/contracts/src/index.ts:603-605`
同一ファイル `./api/chat.js` から3行に分けて `export type` している（`StartChatRequest/Response`、`SendMessageRequest/Response`、`ChatMessagesResponse/MessageDto`）。1つの `export type {...} from './api/chat.js'` にまとめられる。

### SON-011 / P2 / `packages/db/src/adapters/d1-ai-run-repository.ts:837-943`
`markAdmitted`（`casTransition`経由）、`markGenerating`、`markRepairing`、`complete`、`fail` の5メソッドが「UPDATE + `changes`チェック + `appendEvent`」というほぼ同じ形を手書きで繰り返している（`casTransition` ヘルパーがあるのに `markGenerating`/`markRepairing`/`complete`/`fail` はそれを使わず個別実装）。共通化すれば行数を半減できる。

---

## 3. フロントエンドUXギャップ

### SON-012 / P1 / `apps/web/src/routes/chat.tsx:544-555`（`handleSubmit`）
送信失敗時のフォールバックが皆無。`setInput('')` を `mutate()` 呼び出し前に同期実行しているため、`startMutation`/`sendMutation` が失敗（ネットワークエラー、`createMember`/`startChat`/`sendMessage` の非2xx）してもユーザーが入力したテキストは消えたまま復元されず、エラーメッセージも表示されない。ユーザーからは「送信したのに何も起きない」ように見える。

### SON-013 / P1 / `apps/web/src/lib/api-client.ts:71-111`
全APIコール関数が `res.ok` チェック後 `throw new Error(...)` するのみで、レスポンスボディの `{ code, message }`（`ApiError`型が`contracts`に存在するのに未使用）を読んでいない。エラーコード（`MEMBER_NOT_FOUND`, `CHAT_ARCHIVED`等）がフロントに一切伝搬せず、ユーザー向けの意味あるエラー表示ができない構造になっている。

### SON-014 / P2 / `apps/web/src/routes/chat.tsx`
ローディング状態の表示が「考え中...」バブルのみで、`messagesQuery.isLoading`（既存チャットを開いた直後の初回フェッチ中）や `startMutation.isPending`（メンバー作成〜チャット開始の間）に対する専用の視覚フィードバックがない。特に `member.ensure()` 内の `createMember` 呼び出しは初回だけ余分なラウンドトリップが発生するが、ボタンが disabled になる以外の表示はない。

### SON-015 / P2 / `apps/web/src/routes/chat.tsx:629-738`（`styles`オブジェクト）
アクセシビリティ観点: `<input>` に `aria-label` が無い（placeholderのみ）。メッセージ一覧 (`styles.messages`) に `aria-live` / `role="log"` が無く、新着AIメッセージがスクリーンリーダーに通知されない。「考え中...」インジケータも `aria-live="polite"` 等のマークアップが無い。

### SON-016 / P2 / `apps/web/src/routes/chat.tsx:518-520`
自動スクロールの `useEffect` の依存配列が `[messages.length]` のみで、`waitingForAi` の変化（＝「考え中...」バブルの出現）では発火しない。AI応答待ちインジケータが表示された瞬間は画面下端まで自動スクロールされない可能性がある。

### SON-017 / P2 / `apps/web/src/routes/index.tsx` / `chat.tsx`
どちらのページにも空状態以外の「エラー画面」「オフライン時の表示」が無い。`chat.tsx` の空状態 (`!chatId && messages.length === 0`) は良いが、`messagesQuery.isError`（チャット取得失敗）の分岐が存在しない。

---

## 4. テストカバレッジの欠落

### SON-018 / P0 / リポジトリ全体
`*.test.ts` / `*.spec.ts` が1件も存在しない。ルート `package.json` は `"test": "turbo test"` を定義し `turbo.json` にも `test` タスクがあるが、どのワークスペースパッケージにも `test` スクリプトが定義されていないため実質何も実行されない。CIの `test-slot` ジョブも `echo "Reserved for real test execution..."` というプレースホルダのみで、実際のテスト実行は一切行われていない。ドメイン層（CAS状態遷移、Result型分岐）・アダプタ層（D1リポジトリ）・ユースケース（`startChat`/`sendMessage`）いずれも未検証のままマージされる。

### SON-019 / P1 / `packages/domain/src/use-cases/start-chat.ts` / `send-message.ts`
最も価値の高いテスト対象。`MemberNotFound`/`ChatNotFound`/`ChatArchived` の分岐、`Result` の伝搬（`if (!x.ok) return x` パターン）はpureな関数でモック注入によるユニットテストが容易なはずだが皆無。

### SON-020 / P1 / `packages/db/src/adapters/d1-ai-run-repository.ts`（CAS遷移: `markAdmitted`/`markGenerating`/`markRepairing`/`complete`/`fail`）
状態遷移ガード（`WHERE status = 'admitted'` 等）が意図通り機能するかを検証するテストがない。特にSON-003/SON-004で指摘した競合系の振る舞いは、テストがあれば設計時点で気づけた可能性が高い。

### SON-021 / P1 / `apps/worker/src/routes/chat.ts` / `member.ts`
HTTPレベルの契約テスト（400/404/409のレスポンスコードとエラーコード）が皆無。SON-001/SON-002の認可漏れも、`x-user-id` と `chatId` の組み合わせテストケースがあれば発見できた可能性がある。

### SON-022 / P2 / `apps/web/src/lib/api-proxy.ts`
Hop-by-hopヘッダ除去、`Set-Cookie` の複数値処理（`getAll`/`getSetCookie`のフォールバック分岐）など細かいロジックがあるにもかかわらずテストがない。Cloudflare Workers環境依存の部分だが、`Headers`操作部分は純粋関数として切り出してテスト可能。

---

## サマリー

- **P0**: 1件（SON-018 テスト基盤が実質空）
- **P1**: 8件（認可漏れ2件、ワークフロー失敗の握りつぶし、D1書き込み競合、UXでのエラー握りつぶし2件、テストカバレッジ3件）
- **P2**: 13件（デッドコード、重複、a11y、細かいUXギャップ）

最も優先すべきは **SON-001/SON-002（認可漏れ）** と **SON-003/SON-006（AI応答が返らないまま無限に待ち続ける導線）** — MVPとしてデプロイした場合にユーザーが直接体感する/セキュリティ上問題になる不具合のため。
