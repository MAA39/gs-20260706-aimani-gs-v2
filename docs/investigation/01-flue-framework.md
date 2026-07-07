# Flue Framework 公式ドキュメント徹底調査

調査日: 2026-07-07
調査方法: Codex (codex-rescue) — Web検索 + 公式ドキュメント + GitHub
出典: https://flueframework.com/ / https://github.com/withastro/flue

---

## 概要

Flueは Astro チーム製の Agent Harness Framework（1.0 Beta）。
「LLM running inside a harness」がコンセプト。ハーネス = セッション、ツール、スキル、命令、ファイルシステム、サンドボックス、サブエージェントをモデルに与える実行環境。

## harness-driven / harness-first

公式定義: agentは「LLM running inside a harness」。Claude CodeやCodexと同じ思想 — 手順をスクリプト化するのではなく、モデルに目標と環境を渡し、読み取り→試行→観察→修正を繰り返させる。

出典: https://flueframework.com/docs/concepts/agents/ / https://flueframework.com/docs/introduction/why-flue/

## Cloudflare対応

- 公式サポートあり
- `agents@^0.14.2`（Cloudflare Agents SDK）を使用
- FlueはDO base classとlifecycle capabilitiesを使い、アプリケーションルーティングはFlue側が持つ
- agent/workflowごとにDurable Object生成
- `FlueRegistry` + SQLite DO migrations

出典: https://flueframework.com/docs/ecosystem/deploy/cloudflare/

## エージェント定義

**「Markdownでエージェントを定義」は不正確。**
エージェント本体は `src/agents/*.ts` の `defineAgent(...)` で定義。
Markdownは `instructions` と `SKILL.md` として読み込む構造。

出典: https://flueframework.com/docs/guide/building-agents/ / https://flueframework.com/docs/guide/skills/

```ts
import { defineAgent, type AgentRouteHandler } from '@flue/runtime';
import instructions from './wall.md' with { type: 'markdown' };
import coaching from '../skills/coaching/SKILL.md' with { type: 'skill' };

export const route: AgentRouteHandler = async (_c, next) => next();

export default defineAgent(() => ({
  model: 'anthropic/claude-sonnet-4-6',
  instructions,
  skills: [coaching],
}));
```

## ツール定義

`defineTool(...)` で、名前、説明、Valibotの `input` / `output`、`run({ input, signal })` を定義。
モデルが選ぶのは引数だけで、認可境界や秘密情報はアプリケーションコード側で閉じるのが公式推奨。

出典: https://flueframework.com/docs/guide/tools/ / https://flueframework.com/docs/api/agent-api/

```ts
import { defineTool } from '@flue/runtime';
import * as v from 'valibot';

export const lookupNote = defineTool({
  name: 'lookup_note',
  description: 'Look up one note owned by the current user.',
  input: v.object({ noteId: v.string() }),
  output: v.object({ title: v.string(), body: v.string() }),
  async run({ input, signal }) {
    return readUserNote(input.noteId, { signal });
  },
});
```

## 会話履歴 / メモリ

永続メモリは「canonical conversation stream」。Cloudflareでは、agent instanceごとにDurable Object SQLiteへ保存:
- モデル可視メッセージ
- assistant output
- tool calls/results
- compaction
- recovery facts

sandbox内ファイルは別物で、会話永続化してもファイルは永続化されない。

出典: https://flueframework.com/docs/concepts/durable-execution/ / https://flueframework.com/docs/guide/database/

## ストリーミング（SSE）

公式はDurable Streams offsetsを使い、HTTPで提供:

```
GET /agents/:name/:id?view=history
GET /agents/:name/:id?view=updates&offset=...&live=sse
GET /runs/:runId?offset=...&live=sse
```

SSEは `event: data`、`event: control`、heartbeat commentsを返す。
**WebSocketは公式に確認できず。**

出典: https://flueframework.com/docs/api/streaming-protocol/

## Claude / Anthropic統合

`model: 'anthropic/claude-sonnet-4-6'` のようなモデル指定子を使い、認証は `ANTHROPIC_API_KEY`。
FlueはPiのprovider integrationを使い、`anthropic`、`openai`、`openrouter` などの環境変数を公式に示す。

出典: https://flueframework.com/docs/getting-started/quickstart/ / https://flueframework.com/docs/guide/models/

## 推奨プロジェクト構造

出典: https://flueframework.com/docs/guide/project-layout/

```
my-project/
  package.json
  flue.config.ts
  src/
    app.ts
    db.ts
    cloudflare.ts
    agents/
      support-assistant.ts
    workflows/
      summarize-ticket.ts
    channels/
      github.ts
    skills/
      review/
        SKILL.md
        references/
          checklist.md
```

## Cloudflareデプロイ

`@flue/runtime`、`@flue/cli`、`wrangler`、`agents@^0.14.2` を使用。
DO migrationはソースではなく `wrangler.jsonc` の履歴として管理し、生成された `dist/<worker>/wrangler.json` でdeploy。

```jsonc
{
  "name": "my-flue-worker",
  "compatibility_date": "2026-06-01",
  "compatibility_flags": ["nodejs_compat"],
  "migrations": [
    { "tag": "v1", "new_sqlite_classes": ["FlueRegistry", "FlueTranslateWorkflow"] }
  ]
}
```

```bash
npx flue build --target cloudflare
npx wrangler deploy --dry-run --config dist/my-flue-worker/wrangler.json
npx wrangler deploy --config dist/my-flue-worker/wrangler.json
```

## Cloudflare Agents SDKとの関係

FlueはCloudflare Agents SDKのDO基盤とnative lifecycleを使うが、routingやハーネス、agent/workflow抽象はFlueが提供。
`extend(...)` により `onStart()`、`scheduleEvery()`、`queue()` などのSDK機能も一部拡張可能。

**override禁止**: `fetch()`、`onRequest()`、`onFiberRecovered()`、`alarm()` はFlue/SDKが使うため。

出典: https://flueframework.com/docs/ecosystem/deploy/cloudflare/

## npmパッケージ一覧（確認済み）

| パッケージ | 用途 |
|---|---|
| `@flue/runtime` | コアランタイム（defineAgent, defineTool等） |
| `@flue/cli` | CLI（build, dev, deploy） |
| `@flue/sdk` | クライアントSDK |
| `@flue/react` | Reactフック（チャットUI用） |
| `@flue/postgres` | Postgres統合 |
| `@flue/opentelemetry` | テレメトリ |
| `@flue/slack` | Slackチャネル |
| `@flue/github` | GitHubチャネル |

## AI壁打ちチャットボットへの適用案

Codexの推論に基づく構成案:

- `src/agents/wall-chat.ts`: 会話継続型agent。`id` は `userId` または `threadId`
- `src/app.ts`: Honoで認証し、`/agents/*` を保護して `flue()` をmount
- Cloudflare: agent instanceごとにDurable Object SQLiteで会話履歴
- UI: `POST /agents/wall-chat/:id` で投稿、`GET ...?view=updates&live=sse` で更新購読
- 壁打ち方針は `skills/coaching/SKILL.md` でMarkdown化
- 永続的なユーザープロフィールや課金情報はFlue DBではなくアプリDB（D1）へ
