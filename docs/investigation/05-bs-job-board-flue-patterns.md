# bs-job-board Flue Agent 実装パターン調査

調査日: 2026-07-07
調査方法: Codex (codex-rescue) — GitHub API経由
対象: https://github.com/MAA39/gs-20260620-bs-job-board/tree/main/apps/agent
bs-job-board概要: G's Academy課題、ブルシット・ジョブ解体掲示板（3 Workers完全分離モノレポ）

---

## 1. flue.config.ts

最小構成。Cloudflare向けビルドを指定するだけ。

```ts
import { defineConfig } from '@flue/cli/config';

export default defineConfig({
  target: 'cloudflare',
});
```

## 2. Agent定義（src/agents/analyst.ts）

**注意: 実APIは `createAgent()` であり `defineAgent()` ではない。**

```ts
export default createAgent(() => ({
  model: 'sakura/gpt-oss-120b',
  instructions: '...',
}));
```

- `route` export なし → HTTP非公開Agent（内部workflowからのみ呼ばれる）
- skills/tools/sandbox は未指定
- instructionsに2ch風匿名掲示板住民としての振る舞いを定義

## 3. Hono連携（src/app.ts）

```ts
const app = new Hono();

app.get('/health', ...);
app.use('/workflows/*', allowInternalHost);
app.use('/runs/*', allowInternalHost);
app.route('/', flue());

export default app;
```

- `/workflows/*` と `/runs/*` を Host allowlist で内部限定
- 許可ホスト: `agent`, `localhost`, `127.0.0.1`, IPv6 localhost
- `/agents/*` は `route` export がないためHTTP公開しない設計
- `flue()` をHonoにマウントする形

## 4. Workflow（src/workflows/generate-replies.ts）

```ts
export const route: WorkflowRouteHandler = async (_c, next) => next();

export async function run({ payload, env, init }: FlueContext<unknown, Env>) {
  const harness = await init(replyAgent);
  const session = await harness.session();
  const response = await session.prompt(buildPrompt(input), { thinkingLevel: 'minimal' });
  // ...
}
```

主な流れ:
1. `registerProvider()` で外部AIをOpenAI互換APIとして登録
2. `replyAgent` は `createAgent<unknown, Env>()`
3. `thinkingLevel: 'minimal'`
4. API Service Binding `env.API.fetch()` でコールバック（generating/repairing/complete/fail）
5. AI出力はJSONとして手動parse
6. 失敗時はrepair promptを投げ直す（リトライ）
7. usageは初回+repair分を累積
8. 結果ハッシュはSHA-256

**V2移植時の注意: このファイルは `throw` と `Error` class を使用 → Result型に置換必要**

## 5. wrangler.jsonc DO設定

```jsonc
"durable_objects": {
  "bindings": [
    { "name": "FLUE_ANALYST_AGENT", "class_name": "FlueAnalystAgent" },
    { "name": "FLUE_GENERATE_REPLIES_WORKFLOW", "class_name": "FlueGenerateRepliesWorkflow" },
    { "name": "FLUE_REGISTRY", "class_name": "FlueRegistry" }
  ]
},
"migrations": [
  { "tag": "v1", "new_sqlite_classes": ["FlueRegistry", "FlueAnalystAgent"] },
  { "tag": "v2", "new_sqlite_classes": ["FlueGenerateRepliesWorkflow"] }
]
```

## 6. 依存関係

```json
"dependencies": {
  "@flue/runtime": "1.0.0-beta.2",
  "agents": "^0.16.2",
  "hono": "^4.12.0"
},
"devDependencies": {
  "@flue/cli": "1.0.0-beta.1",
  "@cloudflare/workers-types": "^4.20250620.0"
}
```

scripts: `flue dev`, `flue build --target cloudflare`, `tsc --noEmit`, `flue deploy`

## 7. .flue-vite.wrangler.jsonc

Flue/Vite dev用の補助Wrangler設定。通常の `wrangler.jsonc` は `dist/` のビルド出力を指すが、
こちらは `.flue-vite/_entry.ts` を Worker entrypoint として指す。

DO bindings、migrations、service bindingを通常設定と同期させる役割。

## V2適用まとめ

| bs-job-boardパターン | V2での扱い |
|---|---|
| `createAgent()` API | 採用（Flue 1.0-beta.2） |
| Hono + `flue()` マウント | 採用（apps/worker/src/app.ts） |
| Agent HTTP非公開（route exportなし） | 壁打ちAgentは route export あり（HTTP公開） |
| Workflow（run + init + session.prompt） | 推薦生成で活用可能 |
| Service Binding（Agent→API通信） | 1 Worker同居なら不要 |
| throw使用 | **禁止** → Result型に置換 |
| DO migrations直列 | 採用 |
| `.flue-vite.wrangler.jsonc` | 必要（dev環境用） |
