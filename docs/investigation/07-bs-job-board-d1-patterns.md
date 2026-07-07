# bs-job-board D1スキーマ・クエリ・パイプライン調査

調査日: 2026-07-07
調査方法: Codex (codex-rescue) — GitHub API経由
対象: https://github.com/MAA39/gs-20260620-bs-job-board/tree/main/packages/db

---

## 1. migrations 0001〜0008 全体像

4層: 掲示板本体 → リアクション → Better Auth → AI run lifecycle

| migration | 内容 |
|---|---|
| 0001_init | threads(id,title,body,status,created_at) + posts(id,thread_id FK,post_number,author_type,author_name,role,body,created_at) + idx_posts_thread |
| 0002_add_reactions | threads.reaction_count INTEGER NOT NULL DEFAULT 0 |
| 0003_user_reactions | reactions(id,thread_id FK,user_id,created_at, UNIQUE(thread_id,user_id)) |
| 0004_source_post | posts.source_post_number INTEGER |
| 0005_better_auth | "user", "session", "account", "verification" — Better Auth標準テーブル |
| 0006_user_id | posts.user_id TEXT REFERENCES "user"(id) |
| 0007_unique_post_number | UNIQUE INDEX idx_unique_post_number ON posts(thread_id, post_number) |
| 0008_ai_runs | posts.parent_post_id FK, ai_runs, ai_run_events, ai_run_posts + AI系INDEX群 |

### ai_runs テーブル制約（参考）
- stage CHECK(initial/deep_dive)
- status CHECK(queued/admitted/generating/repairing/completed/failed)
- idempotency_key UNIQUE
- flue_run_id UNIQUE
- token/cost系は非負
- error_message <= 500文字

### ai_run_events
- json_valid(data_json)
- UNIQUE(ai_run_id, sequence)

### ai_run_posts
- PRIMARY KEY(ai_run_id, ordinal)
- post_id UNIQUE
- ordinal BETWEEN 0 AND 4

### 未設定のCHECK制約（bs側の弱点）
threads.status, posts.author_type, posts.role にDB上のCHECKなし → V2では追加すべき

## 2. queries.ts — D1クエリパターン

D1直叩き（Drizzleなし）:
```ts
const thread = await db
  .prepare('SELECT * FROM threads WHERE id = ?')
  .bind(threadId)
  .first<Thread>();
```

- `.all<T>()` — 複数行取得
- `.first<T>()` — 1行取得
- `.run()` — INSERT/UPDATE/DELETE
- `db.batch([...])` — D1の疑似トランザクション

createThread: `crypto.randomUUID()` をクエリ層で呼ぶ → V2では `deps.idGen` で注入
toggleReaction: 存在確認→DELETE or INSERT + UPDATE を batch
listThreadsSorted: sort union → ORDER BY文字列マップ（SQL injection対策）

## 3. types.ts — 型定義パターン

良い点:
- `D1PreparedStatementLike` / `D1DatabaseClient` でFake DB差込み可能
- `AiRunStage` / `AiRunStatus` がliteral union
- command input型が明確

V2との衝突:
- `DbConflictError extends Error` / `InvalidTransitionError extends Error` → throw禁止
- Brand型なし、string ID → `packages/shared` のBrand型を使う
- `db` がinput型に直接入る → domain PortではなくD1 command API寄り

## 4. ai-pipeline.ts — AI実行ライフサイクル

### 状態機械
```
queued → admitted → generating → completed
                  ↓           ↓
              repairing → completed
                  ↓
                failed
```

### 主要関数
- `createQueuedRun`: ai_runs + queued event を同一batchで作成。EXISTS検証あり
- `markRunAdmitted`: queued → admitted
- `markRunGenerating`: admitted → generating、flue_run_id更新
- `markRunRepairing`: generating → repairing、attempt_count+1
- `failRun`: non-terminal → failed
- `completeRunAtomic`: generating|repairing → completed + AI posts作成 + usage保存 + event
- `listAiRunEventsAfter`: SSE向けイベント差分取得
- `getAiGenerationContext`: source post以前の直近8件取得（role='thinking'除外）
- `createThreadWithInitialPostAndQueuedRun`: thread + human post + queued run を atomic作成

### CAS風状態遷移（移植価値あり）
```sql
UPDATE ai_runs SET status = 'generating' WHERE id = ? AND status = 'admitted'
```
`changes() > 0` の時だけeventを作る → 楽観ロック的パターン

## 5. index.ts export構成

```json
"exports": {
  ".": "./src/index.ts",
  "./ai-pipeline": "./src/ai-pipeline.ts",
  "./migrations/*": "./migrations/*"
}
```

通常クエリは root export、AI pipeline は別 export path

## 6. テスト構成

### unit (vitest.config.ts)
- `src/**/*.test.ts` 対象
- integration test除外
- `--passWithNoTests` 付き（V2では禁止すべき）

### integration (Cloudflare Workers pool)
```ts
const migrations = await readD1Migrations('migrations');
cloudflareTest({
  miniflare: { bindings: { TEST_MIGRATIONS: migrations } },
  wrangler: { configPath: '../../apps/api/wrangler.jsonc' },
});
```

テスト名は仕様書:
- 「queued run と queued event が atomic に作られる」
- 「completed → failed は InvalidTransitionError」
- 「same hash → duplicate success」

## 7. V2移植ギャップ分析

| bs-job-board | aimani-gs-v2での扱い |
|---|---|
| throw Error / Error class | Result<T, E> + _tag unionへ変換 |
| db: D1Database を関数引数に直渡し | domain Portを定義、D1はadapterに閉じる |
| crypto.randomUUID() をquery層で実行 | deps.idGen で注入 |
| contracts row型を返す | packages/domain のdomain型へmap |
| string ID | packages/shared のBrand型を使う |
| Better Auth DDL | 当初x-user-id仮実装、無条件コピーしない |
| MAX(post_number)+1 | UNIQUE制約 + 競合Result/リトライ方針が必要 |

### 移植すべき中核
1. AI run lifecycleのDDL（状態機械テーブル設計）
2. CAS風状態遷移SQL（WHERE status = ... + changes() > 0）
3. event整合性パターン
4. Cloudflare D1 integration test構成

### 作り直すべきもの
- Error class → Result型
- throw → ok/error return
- D1直渡しAPI → Port interface
- UUID生成 → DI
- Better Auth表 → 認証は後から
- contracts直結型 → domain型にmap

### V2 Port interface移植イメージ

```ts
// packages/domain/src/ports/ai-run-repository.ts
export type AiRunError =
  | { _tag: 'AiRunNotFound'; aiRunId: string }
  | { _tag: 'InvalidAiRunTransition'; aiRunId: string; to: string }
  | { _tag: 'AiRunConflict'; reason: 'IdempotencyKey' | 'ResultHash' }
  | { _tag: 'DbFailure'; operation: string };

export interface AiRunRepository {
  createQueued(input: {...}): Promise<Result<{aiRunId: string}, AiRunError>>;
  markGenerating(input: {...}): Promise<Result<void, AiRunError>>;
  complete(input: {...}): Promise<Result<{messageIds: MessageId[]; duplicate: boolean}, AiRunError>>;
}
```
