# aimani-gs-v2 Flue Agent 統合ガイド

調査日: 2026-07-07  
対象: aimani-gs-v2 `apps/worker`（1 Worker / Hono + Flue 同居）  
参照元: https://github.com/MAA39/gs-20260620-bs-job-board/tree/main/apps/agent

---

## 0. 実読確認

このガイドは bs-job-board の実装を GitHub connector 経由で読み、`@flue/runtime@1.0.0-beta.2` と `@flue/cli@1.0.0-beta.1` のローカル型定義で API 形状を確認して書いている。`git clone` はこの環境では DNS 解決不可だったため失敗した。

読んだ bs-job-board の指定ファイル:

| ファイル | 確認したこと |
|---|---|
| `apps/agent/src/agents/analyst.ts` | `createAgent(() => ({ model, instructions }))`。`route` export なし。 |
| `apps/agent/src/app.ts` | `import { flue } from '@flue/runtime/routing'`、`app.route('/', flue())`。`/workflows/*` と `/runs/*` に host guard。 |
| `apps/agent/src/workflows/generate-replies.ts` | `createAgent<unknown, Env>()`、`FlueContext<unknown, Env>`、`WorkflowRouteHandler`、`init(agent) -> harness.session() -> session.prompt()`、`registerProvider()`。 |
| `apps/agent/flue.config.ts` | `defineConfig({ target: 'cloudflare' })` の最小構成。 |
| `apps/agent/wrangler.jsonc` | Flue DO bindings、`new_sqlite_classes` migrations、`FlueRegistry`。 |
| `apps/agent/package.json` | `@flue/runtime: 1.0.0-beta.2`、`@flue/cli: 1.0.0-beta.1`、`agents: ^0.16.2`、scripts。 |

追加で確認した aimani-gs-v2 の現状:

- `apps/worker/src/index.ts` が Hono router。
- `apps/worker/src/agents/sparring-agent.ts` は prompt 定義のみ。
- `apps/worker/wrangler.jsonc` は D1 `migrations_dir: "../../packages/db/migrations"` 設定済み。
- `apps/worker/package.json` は Flue 未導入。

---

## 1. bs-job-board 基準の Flue API

bs-job-board が使っている対象バージョン:

```json
{
  "dependencies": {
    "@flue/runtime": "1.0.0-beta.2",
    "agents": "^0.16.2",
    "hono": "^4.12.0"
  },
  "devDependencies": {
    "@flue/cli": "1.0.0-beta.1"
  }
}
```

実使用されていた import:

```ts
import {
  createAgent,
  registerProvider,
  type FlueContext,
  type WorkflowRouteHandler,
} from '@flue/runtime';
import { flue } from '@flue/runtime/routing';
import { defineConfig } from '@flue/cli/config';
```

`generate-replies.ts` で確認できた workflow 内の Agent 実行形:

```ts
const harness = await init(replyAgent);
const session = await harness.session();
const response = await session.prompt(buildPrompt(input), {
  signal: AbortSignal.timeout(TIMEOUT_MS),
  thinkingLevel: 'minimal',
});
```

`response` は bs-job-board で `response.text`, `response.usage`, `response.model` を参照していた。

`registerProvider()` の使用形:

```ts
registerProvider(PROVIDER_ID, {
  api: 'openai-completions',
  baseUrl,
  apiKey,
  models: { [modelId]: { contextWindow: 128_000, maxTokens: 1_500 } },
});
```

注意: bs-job-board の workflow は `throw` と `Error` class を使っている。aimani-gs-v2 の L0 では禁止なので、workflow を移植する場合は Result 型へ置き換える。

---

## 2. `createAgent()` exact API

`@flue/runtime@1.0.0-beta.2` の型定義で確認したシグネチャ:

```ts
function createAgent<TPayload = unknown, TEnv = Record<string, any>>(
  initialize: (
    context: AgentCreateContext<TPayload, TEnv>,
  ) => AgentRuntimeConfig | Promise<AgentRuntimeConfig>,
): CreatedAgent<TPayload, TEnv>;
```

`AgentCreateContext`:

```ts
interface AgentCreateContext<TPayload = unknown, TEnv = Record<string, any>> {
  readonly id: string;
  readonly env: TEnv;
  readonly payload: TPayload | undefined;
}
```

`CreatedAgent`:

```ts
interface CreatedAgent<TPayload = unknown, TEnv = Record<string, any>> {
  readonly __flueCreatedAgent: true;
  initialize(
    context: AgentCreateContext<TPayload, TEnv>,
  ): AgentRuntimeConfig | Promise<AgentRuntimeConfig>;
}
```

bs-job-board の最小実例:

```ts
export default createAgent(() => ({
  model: 'sakura/gpt-oss-120b',
  instructions: '...',
}));
```

bs-job-board の Env 型付き実例:

```ts
const replyAgent = createAgent<unknown, Env>(({ env }) => ({
  model: `${PROVIDER_ID}/${env.SAKURA_MODEL_ID?.trim() || DEFAULT_MODEL_ID}`,
  thinkingLevel: 'minimal',
  instructions: 'Return only the requested JSON object and follow the supplied constraints.',
}));
```

---

## 3. `flue()` Hono mount exact syntax

bs-job-board の `apps/agent/src/app.ts` で確認した mount:

```ts
import { flue } from '@flue/runtime/routing';
import { Hono, type Context, type Next } from 'hono';

const INTERNAL_HOSTS = new Set(['agent', 'localhost', '127.0.0.1', '[::1]', '::1']);

const app = new Hono();
app.get('/health', (context) => context.json({ ok: true }));
app.use('/workflows/*', allowInternalHost);
app.use('/runs/*', allowInternalHost);
app.route('/', flue());

async function allowInternalHost(context: Context, next: Next) {
  if (!INTERNAL_HOSTS.has(new URL(context.req.url).hostname)) return context.notFound();
  return next();
}

export default app;
```

`@flue/runtime/routing` の型定義で確認した `flue()`:

```ts
function flue(): Hono;
```

Flue が mount 配下に持つ主な route:

- `GET /openapi.json`
- `POST /agents/:name/:id`
- `GET /agents/:name/:id`
- `HEAD /agents/:name/:id`
- `POST /workflows/:name`
- `GET /runs/:runId`
- `GET /runs/:runId?meta`
- `HEAD /runs/:runId`
- `* /channels/:name/*`

Agent / workflow の HTTP invocation は、各 module が `route` export を持つ場合だけ公開される。bs-job-board の `analyst.ts` は `route` export がないため HTTP 非公開だった。

---

## 4. `wrangler.jsonc` DO bindings + migrations

aimani-gs-v2 の既存 D1 設定は残す。追加が必要なのは Flue 用 Durable Object と top-level `migrations`。

`sparring-agent.ts` のファイル名は Flue の agent name として `sparring-agent` になる。`@flue/cli@1.0.0-beta.1` の生成規則は:

```ts
function agentClassName(name) {
  return `Flue${pascalCaseName(name)}Agent`;
}

function agentBindingName(name) {
  return `FLUE_${name.replace(/-/g, "_").toUpperCase()}_AGENT`;
}
```

したがって `sparring-agent.ts` の class / binding は次になる。

| agent file | agent name | binding | class |
|---|---|---|---|
| `src/agents/sparring-agent.ts` | `sparring-agent` | `FLUE_SPARRING_AGENT_AGENT` | `FlueSparringAgentAgent` |

`Agent` が二重になるのはファイル名由来。違和感を避けるならファイル名を `sparring.ts` に変えるが、今回の指定ファイルは `sparring-agent.ts` なので、ここでは `FlueSparringAgentAgent` で書く。

`apps/worker/wrangler.jsonc` の追加後イメージ:

```jsonc
{
  "$schema": "https://workers.cloudflare.com/schema/wrangler.json",
  "name": "aimani-gs-v2",
  "compatibility_date": "2026-06-01",
  "compatibility_flags": ["nodejs_compat"],
  "main": "src/index.ts",
  "observability": {
    "enabled": true
  },
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "aimani-gs-v2-db",
      "database_id": "28d215ff-053d-4ffd-b312-300bd9eafb8f",
      "migrations_dir": "../../packages/db/migrations"
    }
  ],
  "durable_objects": {
    "bindings": [
      { "name": "FLUE_SPARRING_AGENT_AGENT", "class_name": "FlueSparringAgentAgent" },
      { "name": "FLUE_REGISTRY", "class_name": "FlueRegistry" }
    ]
  },
  "migrations": [
    { "tag": "v1", "new_sqlite_classes": ["FlueRegistry", "FlueSparringAgentAgent"] }
  ]
}
```

bs-job-board の `wrangler.jsonc` は `durable_objects.bindings` を明示していた。Flue の packaged docs では「Flue の `FLUE_*` bindings は build 時に生成・merge されるため、source `wrangler.jsonc` では migrations を所有する」と説明されている。bs-job-board と同じ運用を優先するなら上記のように明示する。Flue CLI の生成 config へ寄せるなら、最低限 `migrations` を source に残し、build 出力の Wrangler config を deploy 対象にする。

D1 の `migrations_dir` と DO の `migrations` は別物。D1 migration は `packages/db/migrations/` の直列番号運用を維持する。

---

## 5. `apps/worker/flue.config.ts`

bs-job-board と同じ最小構成:

```ts
import { defineConfig } from '@flue/cli/config';

export default defineConfig({
  target: 'cloudflare',
});
```

`defineConfig()` の型定義:

```ts
function defineConfig(config: UserFlueConfig): UserFlueConfig;
```

`UserFlueConfig` で受け付ける主な field:

- `target?: 'node' | 'cloudflare'`
- `root?: string`
- `output?: string`

`apps/worker` の package script から実行するなら `root` は省略でよい。

---

## 6. `apps/worker/src/agents/sparring-agent.ts` full implementation

bs-job-board の `analyst.ts` と同じ `createAgent()` 最小構成に、既存 prompt を載せる。

このコードは `route` を export しない。bs-job-board の `analyst.ts` と同じく HTTP 非公開 Agent になる。直接 `POST /agents/sparring-agent/:id` を公開したい場合は `AgentRouteHandler` の `route` export が必要だが、bs-job-board の指定 Agent では観測していないため、この grounded guide の実装例には含めない。

```ts
import { createAgent } from '@flue/runtime';

export const SPARRING_INSTRUCTIONS = `あなたはG's Academyの壁打ち相手AIです。

## あなたの役割
- ユーザーの「詰まっている状態」を一緒に整理する
- 答えを教えるのではなく、問いかけで思考を引き出す
- 壁打ちの文脈から「この人に聞けるかも」という推薦の種を見つける

## 会話スタイル
- フラットで親しみやすい口調（敬語だが硬すぎない）
- 最初の返答は短く。長い返答は会話が進んでから
- 「何に詰まっているか」「何を試したか」「誰に聞きたいか」を自然に引き出す
- ユーザーの言葉を言い換えて確認する（リフレクション）

## やってはいけないこと
- コードを書く（ChatGPTの役割ではない）
- 具体的な技術的回答をする（人につなげるのが目的）
- 長文で圧倒する
- 「頑張って！」等の空虚な励まし

## 推薦の種を見つけたら
会話の中で技術テーマ・悩みの方向性が見えたら、内部的にメモする。
これは後でG'sメンバーとのマッチングに使われる。
`;

export default createAgent(() => ({
  model: 'sakura/gpt-oss-120b',
  thinkingLevel: 'minimal',
  instructions: SPARRING_INSTRUCTIONS,
}));
```

`model: 'sakura/gpt-oss-120b'` は bs-job-board の `analyst.ts` で実際に使われていた指定子。`thinkingLevel: 'minimal'` は `generate-replies.ts` の `replyAgent` と `session.prompt()` で使われていた。

---

## 7. `apps/worker/src/index.ts` modified version with `flue()` mount

現行 router を維持し、bs-job-board と同じ `app.route('/', flue())` を末尾に追加する。

```ts
import { flue } from '@flue/runtime/routing';
import { Hono, type Context, type Next } from 'hono';
import { chatRoutes } from './routes/chat.js';
import { memberRoutes } from './routes/member.js';

export interface Env {
  DB: D1Database;
}

const INTERNAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

const app = new Hono<{ Bindings: Env }>();

app.get('/', (c) => c.json({ status: 'ok', service: 'aimani-gs-v2' }));
app.get('/api/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.route('/api/chats', chatRoutes);
app.route('/api/members', memberRoutes);

app.use('/workflows/*', allowInternalHost);
app.use('/runs/*', allowInternalHost);
app.route('/', flue());

async function allowInternalHost(context: Context, next: Next) {
  if (!INTERNAL_HOSTS.has(new URL(context.req.url).hostname)) {
    return context.notFound();
  }

  return next();
}

export default app;
```

SpecGap: Flue CLI の標準 discovery は `src/app.ts` で、bs-job-board も `apps/agent/src/app.ts` を使っていた。`src/index.ts` だけに mount しても、`flue build` が authored Hono app として拾わない可能性が高い。実装時は次のどちらかを選ぶ必要がある。

- `src/index.ts` の router を `src/app.ts` に移し、Wrangler / package 側も Flue CLI 前提へ寄せる。
- `src/app.ts` を追加して `index.ts` の default app を re-export する。

例:

```ts
export { default } from './index.js';
```

この `app.ts` 追加は今回の required output には含めていないが、Flue CLI で既存 `/api/*` route を同居させるには必要になる。

---

## 8. `apps/worker/package.json` dependency additions

最小追加:

```json
{
  "dependencies": {
    "@flue/runtime": "1.0.0-beta.2",
    "agents": "^0.16.2"
  },
  "devDependencies": {
    "@flue/cli": "1.0.0-beta.1"
  }
}
```

bs-job-board と同じ scripts に寄せるなら:

```json
{
  "scripts": {
    "dev": "flue dev",
    "build": "flue build --target cloudflare",
    "typecheck": "tsc --noEmit",
    "deploy": "flue deploy"
  }
}
```

現行 `apps/worker/package.json` には `hono: ^4.7.0` が既にある。bs-job-board は `hono: ^4.12.0` だったので、Flue 導入時に合わせて上げる判断はあり。ただし「dependency additions」だけなら `@flue/runtime`, `agents`, `@flue/cli` が追加対象。

---

## 9. 導入順序

実装時の順序:

1. `apps/worker/package.json` に Flue dependencies を追加する。
2. `apps/worker/flue.config.ts` を作成する。
3. `apps/worker/src/agents/sparring-agent.ts` を `createAgent()` 実装へ置き換える。
4. `apps/worker/src/index.ts` に `flue()` mount を追加する。
5. Flue CLI discovery のため、`apps/worker/src/app.ts` の追加または router rename 方針を決める。
6. `apps/worker/wrangler.jsonc` に Flue DO migrations を追加する。D1 `migrations_dir` は維持する。
7. `pnpm --filter @gs-v2/worker typecheck` を実行する。
8. `pnpm --filter @gs-v2/worker build` または `pnpm --filter @gs-v2/worker flue build --target cloudflare` 相当を実行し、生成 Wrangler config の DO bindings を確認する。

注意点:

- `packages/domain` へ Flue や Hono を入れない。Flue 設定は `apps/worker` に閉じる。
- bs-job-board の workflow 実装は `throw` を使うため、そのままコピーしない。
- `sparring-agent.ts` に `route` export を追加しない限り、HTTP direct agent route は公開されない。
- `/runs/*` は workflow run の payload / result / error を読み得るので、公開するなら認可 guard が必要。
