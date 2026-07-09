# 09. BS Job Board `packages/contracts` 調査

## 調査対象

- Repository: `MAA39/gs-20260620-bs-job-board`
- URL: https://github.com/MAA39/gs-20260620-bs-job-board
- Branch: `main`
- 対象ディレクトリ: `packages/contracts`

補足: `git clone --depth 1` は `Could not resolve host: github.com` で失敗したため、GitHub の `main.tar.gz` を `/private/tmp` に取得して展開し、ローカル展開物に対して `rg` で確認した。`packages/contracts` の一覧は GitHub Contents API でも照合した。

## 1. ディレクトリ構成と全ファイル一覧

`packages/contracts` の構成は次の通り。

```text
packages/contracts/
├── package.json
├── tsconfig.json
└── src/
    ├── api.ts
    ├── index.ts
    └── thread.ts
```

全ファイル一覧:

| path | 種別 | 備考 |
| --- | --- | --- |
| `packages/contracts/package.json` | JSON | package 定義。`@bs-job-board/contracts` |
| `packages/contracts/tsconfig.json` | JSON | `../config/tsconfig.base.json` を extends |
| `packages/contracts/src/api.ts` | TypeScript | HTTP DTO、AI run SSE event、公開 error code |
| `packages/contracts/src/index.ts` | TypeScript | barrel export |
| `packages/contracts/src/thread.ts` | TypeScript | thread/post 関連の public 型 |

`.ts` ファイルは `src/api.ts`、`src/index.ts`、`src/thread.ts` の3件のみ。

## 2. 各型定義ファイルの中身

### `packages/contracts/src/thread.ts`

export されている type alias は次の8件。`interface` と `enum` は定義されていない。

| export 名 | 定義内容 |
| --- | --- |
| `ThreadStatus` | `'open' | 'fixed'` |
| `AuthorType` | `'human' | 'ai'` |
| `PostRole` | `'analyst' | 'structure' | 'transform' | 'comment' | 'thinking' | null` |
| `Thread` | `{ id: string; title: string; body: string; status: ThreadStatus; created_at: string }` |
| `Post` | `{ id: string; thread_id: string; post_number: number; author_type: AuthorType; author_name: string; role: PostRole; body: string; source_post_number: number | null; user_id: string | null; created_at: string }` |
| `ThreadDetail` | `Thread & { posts: Post[] }` |
| `CreateThreadInput` | `{ title: string; body: string }` |
| `CreatePostInput` | `{ body: string }` |

`CreatePostInput` の直前には、server-owned fields である `author_type` や `role` は public API input として受け付けない、というコメントがある。

### `packages/contracts/src/api.ts`

export されている type alias は次の6件。`interface` と `enum` は定義されていない。

| export 名 | 定義内容 |
| --- | --- |
| `ApiError` | `{ error: string }` |
| `CreateThreadResponse` | `{ id: string; title: string; ai_run: { id: string } }` |
| `CreatePostResponse` | `{ id: string; post_number: number; ai_run: { id: string } }` |
| `PublicAiErrorCode` | `(typeof PUBLIC_AI_ERROR_CODES)[number]` |
| `PublicAiRunEvent` | public SSE event の union |
| `AiRunProgress` | Web hook 用の進捗状態 union |

type 以外で export されている値/関数:

| export 名 | 内容 |
| --- | --- |
| `PUBLIC_AI_ERROR_CODES` | 公開境界で許可する AI error code の `as const` 配列 |
| `isPublicAiErrorCode` | `unknown` を `PublicAiErrorCode` に絞り込む type guard |

`PUBLIC_AI_ERROR_CODES` の値:

```ts
[
  'AI_CONFIGURATION_ERROR',
  'AI_PROVIDER_TIMEOUT',
  'AI_OUTPUT_INVALID',
  'AI_INPUT_INVALID',
  'AI_RUN_FAILED',
  'AI_DISPATCH_FAILED',
  'AI_EVENT_INVALID',
]
```

`PublicAiRunEvent` の variant:

| variant | shape |
| --- | --- |
| queued/admitted/generating/repairing | `{ status: 'queued' | 'admitted' | 'generating' | 'repairing' }` |
| completed | `{ status: 'completed'; post_ids: readonly string[] }` |
| failed | `{ status: 'failed'; error_code: PublicAiErrorCode }` |

`AiRunProgress` の variant:

| variant | shape |
| --- | --- |
| idle | `{ status: 'idle' }` |
| connecting | `{ status: 'connecting' }` |
| reconnecting | `{ status: 'reconnecting' }` |
| connection_failed | `{ status: 'connection_failed' }` |
| queued/admitted/generating/repairing | `{ status: 'queued' | 'admitted' | 'generating' | 'repairing' }` |
| completed | `{ status: 'completed'; postIds: readonly string[] }` |
| failed | `{ status: 'failed'; errorCode: PublicAiErrorCode }` |

`PublicAiRunEvent` は wire DTO として `post_ids` / `error_code` の snake_case、`AiRunProgress` は Web hook 用 state として `postIds` / `errorCode` の camelCase になっている。

### `packages/contracts/src/index.ts`

barrel export のみ。`thread.ts` と `api.ts` から公開 API を再 export している。

`thread.ts` からの type export:

- `ThreadStatus`
- `AuthorType`
- `PostRole`
- `Thread`
- `Post`
- `ThreadDetail`
- `CreateThreadInput`
- `CreatePostInput`

`api.ts` からの type export:

- `ApiError`
- `CreateThreadResponse`
- `CreatePostResponse`
- `PublicAiErrorCode`
- `PublicAiRunEvent`
- `AiRunProgress`

`api.ts` からの value export:

- `PUBLIC_AI_ERROR_CODES`
- `isPublicAiErrorCode`

## 3. import 状況

検索対象:

```text
apps/web
apps/api
apps/agent
```

検索文字列:

```text
@bs-job-board/contracts
```

### `apps/web`

`apps/web/package.json` に依存がある。

```json
"@bs-job-board/contracts": "workspace:*"
```

import しているファイル:

| path | import 名 | 用途 |
| --- | --- | --- |
| `apps/web/src/routes/index.tsx` | `Thread` | `ThreadWithReactions = Thread & { reaction_count: number }` |
| `apps/web/src/routes/index.tsx` | `CreateThreadResponse` | `/api/v1/threads` POST の JSON response cast |
| `apps/web/src/routes/threads.$id.tsx` | `ThreadDetail` | `/api/v1/threads/:id` GET の JSON response cast、component props/state |
| `apps/web/src/routes/threads.$id.tsx` | `Post` | `thread.posts` から `Map<number, Post[]>` を作る箇所 |
| `apps/web/src/routes/threads.$id.tsx` | `CreatePostResponse` | `/api/v1/threads/:id/posts` POST の JSON response cast |
| `apps/web/src/lib/use-ai-run-progress.ts` | `AiRunProgress` | hook の戻り値、state、status label の型 |
| `apps/web/src/lib/use-ai-run-progress.ts` | `PublicAiRunEvent` | SSE message parser の戻り値 |
| `apps/web/src/lib/use-ai-run-progress.ts` | `PublicAiErrorCode` | failed event の error code 絞り込み |
| `apps/web/src/lib/use-ai-run-progress.ts` | `isPublicAiErrorCode` | `record.error_code` の runtime guard |

`apps/web` ではすべて package root の `@bs-job-board/contracts` から import しており、`@bs-job-board/contracts/src/...` のような subpath import は確認できなかった。

### `apps/api`

`apps/api/package.json` に依存がある。

```json
"@bs-job-board/contracts": "workspace:*"
```

import しているファイル:

| path | import 名 | 用途 |
| --- | --- | --- |
| `apps/api/src/routes/ai-run-events.ts` | `PublicAiRunEvent` | DB event JSON から public SSE event へ map する `mapToPublicEvent` の戻り値 |
| `apps/api/src/routes/ai-run-events.ts` | `PublicAiErrorCode` | failed event の error code 型 |
| `apps/api/src/routes/ai-run-events.ts` | `isPublicAiErrorCode` | DB event 内 `error_code` の runtime guard |
| `apps/api/src/routes/pump-ai-run-events.ts` | `PublicAiRunEvent` | SSE に書き出す fallback failed event の `satisfies PublicAiRunEvent`、mapper callback の戻り値 |
| `apps/api/src/__tests__/ai-run-events.unit.test.ts` | `PublicAiRunEvent` | test ファイル内の type import |

`apps/api` でもすべて package root の `@bs-job-board/contracts` から import している。

### `apps/agent`

`apps/agent` には `@bs-job-board/contracts` の import は確認できなかった。`apps/agent/package.json` の dependencies にも `@bs-job-board/contracts` はない。

`apps/agent` 配下に存在するファイルは次の通り。

- `apps/agent/flue.config.ts`
- `apps/agent/package.json`
- `apps/agent/src/agents/analyst.ts`
- `apps/agent/src/app.ts`
- `apps/agent/src/workflows/generate-replies.ts`
- `apps/agent/tsconfig.json`
- `apps/agent/wrangler.jsonc`

## 4. `package.json` の exports 設定

`packages/contracts/package.json` の内容:

```json
{
  "name": "@bs-job-board/contracts",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.8.0"
  }
}
```

公開 entrypoint は `"."` のみで、`./src/index.ts` に向けている。`src/index.ts` が public barrel になっているため、consumer は `@bs-job-board/contracts` から import する形に統一されている。

`tsconfig.json` は次の構成。

```json
{
  "extends": "../config/tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

## 5. V2 で `packages/contracts` を作る場合の参考ポイント

BS 側の `packages/contracts` は、runtime dependency を持たず、HTTP DTO と SSE public event を app 間で共有する薄い package として使われている。V2 の既存 packages も `@gs-v2/domain`、`@gs-v2/shared`、`@gs-v2/db` が `"exports": { ".": "./src/index.ts" }` の形なので、V2 で作るなら `@gs-v2/contracts` も同じ public barrel 方式に揃えるのが自然。

参考にできる点:

- `src/index.ts` だけを public entrypoint にし、consumer は `@gs-v2/contracts` から import する。
- `package.json` は V2 既存 package と同じく `private: true`、`type: "module"`、`exports: { ".": "./src/index.ts" }`、`typecheck: "tsc --noEmit"` に揃える。
- `tsconfig.json` は V2 既存 packages と同じ `../config/tsconfig.base.json` を extends し、`include` は `src/**/*.ts` で揃えるのが現行構成に近い。
- BS の `PUBLIC_AI_ERROR_CODES` のように、公開境界で許可する code を `as const` 配列で定義し、そこから union 型を導出し、`isPublicAiErrorCode` のような type guard だけを公開する形は、API/SSE 境界の runtime guard と型を一致させやすい。
- BS は wire event の `PublicAiRunEvent` と Web 内部状態の `AiRunProgress` を分けている。V2 でも HTTP/SSE の wire DTO と UI hook/state は分けると、snake_case/camelCase や public/private 境界を混ぜにくい。
- BS の `ApiError` は `{ error: string }` だが、V2 の AGENTS.md では Result 型と `_tag` union を絶対ルールにしている。V2 で error DTO を作る場合は、free-form string だけを正本にせず、公開 error code / `_tag` union を contracts 側で型化する方が V2 ルールに合う。
- BS の id/date は `string` そのまま。V2 には `packages/shared/src/index.ts` に `UserId`、`ChatId`、`MessageId`、`QuestionCardId` の Brand 型が既にあるため、contracts に載せる ID を plain `string` にするか Brand 型にするかは、API boundary の JSON との相性を決めてから統一した方がよい。
- BS では `apps/web` と `apps/api` が contracts を直接 import し、`apps/agent` は import していない。V2 では現行 app が `apps/web` と `apps/worker` なので、共有 DTO が必要な app だけに `@gs-v2/contracts: workspace:*` を追加するのが最小構成。
- `packages/domain` は I/O 禁止という V2 ルールがある。contracts も BS と同じく型・純粋な guard・公開定数に限定すれば、domain / worker / web の境界で扱いやすい。

## 確認メモ

- `packages/contracts` 配下の `.ts` は3件すべて列挙済み。
- export されている type alias はすべて列挙済み。`interface` / `enum` は存在しない。
- type 以外の export として `PUBLIC_AI_ERROR_CODES` と `isPublicAiErrorCode` も列挙済み。
- `apps/web`、`apps/api`、`apps/agent` はそれぞれ `rg -n "@bs-job-board/contracts"` で確認した。
- `apps/agent` は import / dependency ともに該当なし。
