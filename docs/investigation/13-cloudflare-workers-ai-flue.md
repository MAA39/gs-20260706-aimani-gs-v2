# Cloudflare Workers AI と Flue 1.0-beta.2 調査

調査日: 2026-07-07  
対象: aimani-gs-v2 `apps/worker` / `@flue/runtime@1.0.0-beta.2` / `@flue/cli@1.0.0-beta.1`

---

## 結論

- Flue `1.0.0-beta.2` は Cloudflare target で Workers AI binding をネイティブサポートしている。`model: 'cloudflare/@cf/...'` の形で指定できる。
- `apps/worker/wrangler.jsonc` に Workers AI binding はまだない。使う場合は top-level に `"ai": { "binding": "AI" }` を追加する。
- Cloudflare Workers 上で binding を使う場合、Flue CLI が `cloudflare` provider を自動登録するため、通常はアプリ側で `registerProvider('cloudflare', ...)` は不要。
- `registerProvider()` は Workers AI を OpenAI 互換 HTTP endpoint として登録する用途にも使える。ただし、この経路は `CLOUDFLARE_ACCOUNT_ID` と API token が必要で、Cloudflare Worker 内では binding 経路のほうが素直。
- bs-job-board は Workers AI binding ではなく Sakura AI 系の OpenAI 互換 provider を使っていた。`apps/agent/wrangler.jsonc` に `ai` binding はない。
- 日本語品質は未実測。Cloudflare カタログ上で多言語対応を確認できた候補はあるが、「日本語に強い」と断定できるのは実測後。

---

## 確認したソース

ローカル:

- `apps/worker/package.json`
- `apps/worker/wrangler.jsonc`
- `apps/worker/src/agents/sparring-agent.ts`
- `node_modules/.pnpm/@flue+runtime@1.0.0-beta.2_*/node_modules/@flue/runtime/dist/index.d.mts`
- `node_modules/.pnpm/@flue+runtime@1.0.0-beta.2_*/node_modules/@flue/runtime/dist/providers-*.d.mts`
- `node_modules/.pnpm/@flue+runtime@1.0.0-beta.2_*/node_modules/@flue/runtime/dist/providers-*.mjs`
- `node_modules/.pnpm/@flue+runtime@1.0.0-beta.2_*/node_modules/@flue/runtime/dist/cloudflare/internal.mjs`
- `node_modules/.pnpm/@flue+runtime@1.0.0-beta.2_*/node_modules/@flue/runtime/docs/guide/models.md`
- `node_modules/.pnpm/@flue+runtime@1.0.0-beta.2_*/node_modules/@flue/runtime/docs/api/provider-api.md`
- `node_modules/.pnpm/@flue+cli@1.0.0-beta.1_*/node_modules/@flue/cli/dist/flue.js`
- `node_modules/.pnpm/@flue+runtime@1.0.0-beta.2_*/node_modules/@earendil-works/pi-ai/dist/index.js`
- `node_modules/.pnpm/@cloudflare+workers-types@*/node_modules/@cloudflare/workers-types/index.ts`

Cloudflare 公式:

- Workers AI binding: https://developers.cloudflare.com/workers-ai/configuration/bindings/
- OpenAI compatible endpoints: https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/
- Workers AI model catalog: https://developers.cloudflare.com/workers-ai/models/
- Workers AI pricing: https://developers.cloudflare.com/workers-ai/platform/pricing/

bs-job-board:

- https://github.com/MAA39/gs-20260620-bs-job-board
- `gh` CLI での取得はネットワーク接続エラーで失敗した。代替として GitHub connector で該当ファイルを取得して確認した。

---

## 1. Workers AI binding 設定

Cloudflare 公式ドキュメントで確認した `wrangler.jsonc` の binding 形:

```jsonc
{
  "ai": {
    "binding": "AI"
  }
}
```

この binding は Worker 内で `env.AI` として利用できる。`env.AI.run(model, input)` の第一引数に model ID、第二引数に入力 object を渡す。

aimani-gs-v2 の `apps/worker/wrangler.jsonc` は、現状 D1 と Flue Durable Object binding はあるが Workers AI binding はない。Workers AI を使う場合の差分イメージ:

```jsonc
{
  "name": "aimani-gs-v2",
  "main": "dist/index.js",
  "compatibility_date": "2026-06-01",
  "compatibility_flags": ["nodejs_compat"],
  "ai": {
    "binding": "AI"
  }
}
```

`ai` は top-level の設定。既存の `d1_databases`、`durable_objects`、`migrations`、`vars` と並べる。

未確認:

- aimani-gs-v2 で `remote: true` が必要かは未確認。Cloudflare Docs には local development 用の remote binding 設定があるが、今回の調査では deploy 実行や `flue dev` 実行まではしていない。

---

## 2. Flue は Workers AI をネイティブサポートしているか

結論: サポートしている。

`@flue/runtime` の同梱 docs `docs/guide/models.md` に Cloudflare Workers AI 用の provider ID として `cloudflare/...` が記載されている。Cloudflare target では、`cloudflare/` より後ろの文字列が Workers AI の model ID として `env.AI.run(...)` に渡される。

例:

```ts
export default createAgent<unknown, Env>(() => ({
  model: 'cloudflare/@cf/google/gemma-4-26b-a4b-it',
  instructions: SPARRING_INSTRUCTIONS,
}));
```

Flue CLI の Cloudflare entry 生成コードでも、Cloudflare target では次の登録が自動生成されることを確認した。

```ts
registerApiProvider(getCloudflareAIBindingApiProvider());

if (!hasRegisteredProvider('cloudflare')) {
  registerProvider('cloudflare', {
    api: 'cloudflare-ai-binding',
    binding: env.AI,
  });
}
```

つまり、Cloudflare target で `model: 'cloudflare/@cf/...'` を使うだけなら、ユーザーコードで provider 登録を書く必要はない。

`@flue/runtime/dist/cloudflare/internal.mjs` では、binding がない場合に `cloudflare/...` model は Cloudflare target と `wrangler.jsonc` の `"ai": { "binding": "AI" }` を要求するエラーになる実装も確認した。

---

## 3. `createAgent()` と model 指定

`@flue/runtime@1.0.0-beta.2` の型定義で確認した `createAgent()`:

```ts
function createAgent<TPayload = unknown, TEnv = Record<string, any>>(
  initialize: (
    context: AgentCreateContext<TPayload, TEnv>,
  ) => AgentRuntimeConfig | Promise<AgentRuntimeConfig>,
): CreatedAgent<TPayload, TEnv>;
```

現在の aimani-gs-v2:

```ts
export default createAgent<unknown, Env>(() => ({
  model: 'anthropic/claude-sonnet-4-20250514',
  instructions: SPARRING_INSTRUCTIONS,
}));
```

Workers AI binding へ切り替える場合の model 指定候補:

```ts
export default createAgent<unknown, Env>(() => ({
  model: 'cloudflare/@cf/google/gemma-4-26b-a4b-it',
  instructions: SPARRING_INSTRUCTIONS,
}));
```

Flue は model specifier を先頭の `/` で provider ID と model ID に分ける。したがって `cloudflare/@cf/openai/gpt-oss-20b` は provider ID が `cloudflare`、model ID が `@cf/openai/gpt-oss-20b` になる。

---

## 4. `registerProvider()` で Workers AI を登録する方法

### 4.1 Workers AI binding を明示登録する

通常は Flue CLI が自動登録するため不要。AI Gateway の設定を変えるなど、`cloudflare` provider を上書きしたい場合だけ `app.ts` などで先に登録する。

Flue 同梱 docs で確認した形:

```ts
import { env } from 'cloudflare:workers';
import { registerProvider } from '@flue/runtime';

registerProvider('cloudflare', {
  api: 'cloudflare-ai-binding',
  binding: env.AI,
  gateway: {
    id: 'production-agent-traffic',
    cacheTtl: 300,
    metadata: { application: 'support' },
    collectLog: true,
  },
});
```

`gateway: false` を指定すると、Flue は `env.AI.run()` の options に gateway 設定を渡さない。

### 4.2 Workers AI を OpenAI 互換 HTTP provider として登録する

Cloudflare 公式ドキュメントで、Workers AI は OpenAI 互換 endpoint として `/v1/chat/completions` を提供することを確認した。

endpoint:

```text
https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1
```

Flue の `registerProvider()` は `api: 'openai-completions'`、`baseUrl`、`apiKey` を受け取る。したがって、Workers AI を OpenAI 互換 provider として登録する場合は次の形になる。

```ts
import { registerProvider } from '@flue/runtime';

registerProvider('cf-workers-ai-http', {
  api: 'openai-completions',
  baseUrl: `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/ai/v1`,
  apiKey: env.CLOUDFLARE_API_KEY,
  models: {
    '@cf/openai/gpt-oss-20b': {
      contextWindow: 128_000,
      maxTokens: 16_384,
    },
  },
});
```

使う側:

```ts
export default createAgent<unknown, Env>(() => ({
  model: 'cf-workers-ai-http/@cf/openai/gpt-oss-20b',
  instructions: SPARRING_INSTRUCTIONS,
}));
```

注意:

- この構成は Flue の provider API と Cloudflare の OpenAI 互換 endpoint を突き合わせた構成。今回、実通信はしていない。
- Cloudflare Worker 内で Workers AI を呼ぶだけなら、API token を持たせる HTTP 経路より `cloudflare/...` binding 経路を優先したほうがよい。

---

## 5. 日本語対応候補モデル

前提:

- Workers AI model catalog と pricing に掲載されている model ID だけを書く。
- `@earendil-works/pi-ai` の Cloudflare Workers AI catalog と `@cloudflare/workers-types` に含まれる model ID も照合した。
- 日本語応答品質は未実測。下表の「日本語観点」は、公式カタログで多言語対応が読める範囲に限定する。

| 候補 | Flue model 指定 | 確認できたこと | 日本語観点 | 価格メモ |
|---|---|---|---|---|
| Gemma 4 26B A4B IT | `cloudflare/@cf/google/gemma-4-26b-a4b-it` | Cloudflare catalog / pricing / pi-ai catalog で確認。Function calling、reasoning、vision 表示あり。 | Gemma 3 には Cloudflare catalog 上で多言語対応の記載があるが、Gemma 4 26B 個別の日本語品質は未確認。 | `$0.100/M` input、`$0.300/M` output。 |
| Qwen3 30B A3B FP8 | `cloudflare/@cf/qwen/qwen3-30b-a3b-fp8` | Cloudflare catalog / pricing / pi-ai catalog で確認。reasoning 表示あり。 | Cloudflare catalog に multilingual support の記載あり。日本語品質は未実測。 | `$0.051/M` input、`$0.335/M` output。 |
| GLM-4.7-Flash | `cloudflare/@cf/zai-org/glm-4.7-flash` | Cloudflare catalog / pricing / pi-ai catalog で確認。131,072 token context、function calling、reasoning 表示あり。 | Cloudflare catalog に 100+ languages の記載あり。日本語品質は未実測。 | `$0.060/M` input、`$0.400/M` output。 |
| GPT OSS 20B | `cloudflare/@cf/openai/gpt-oss-20b` | Cloudflare catalog / pricing / pi-ai catalog で確認。低レイテンシ用途と説明されている。 | 日本語品質は未確認。 | `$0.200/M` input、`$0.300/M` output。 |
| GPT OSS 120B | `cloudflare/@cf/openai/gpt-oss-120b` | Cloudflare catalog / pricing / pi-ai catalog で確認。production / general purpose / high reasoning 用途と説明されている。 | 日本語品質は未確認。bs-job-board は Sakura AI 経由で同名 model を使っているが、Cloudflare 版とは provider が異なる。 | `$0.350/M` input、`$0.750/M` output。 |
| Llama 4 Scout 17B 16E Instruct | `cloudflare/@cf/meta/llama-4-scout-17b-16e-instruct` | Cloudflare catalog / pricing / pi-ai catalog で確認。text と image understanding の説明あり。 | 日本語品質は未確認。 | `$0.270/M` input、`$0.850/M` output。 |
| Mistral Small 3.1 24B Instruct | `cloudflare/@cf/mistralai/mistral-small-3.1-24b-instruct` | Cloudflare catalog / pricing / pi-ai catalog で確認。128k context、vision understanding の説明あり。 | 日本語品質は未確認。 | `$0.351/M` input、`$0.555/M` output。 |
| Granite 4.0 H Micro | `cloudflare/@cf/ibm-granite/granite-4.0-h-micro` | Cloudflare catalog / pricing / pi-ai catalog で確認。agentic task、instruction following、function calling 用途の説明あり。 | 日本語品質は未確認。 | `$0.017/M` input、`$0.112/M` output。 |

一次候補としては、多言語明記と価格のバランスで `@cf/qwen/qwen3-30b-a3b-fp8` と `@cf/zai-org/glm-4.7-flash`、Gemma 系の周辺情報と価格から `@cf/google/gemma-4-26b-a4b-it` を小さく実測する価値がある。ただし、これはカタログ情報からの候補化であり、実際の日本語品質評価ではない。

---

## 6. Workers AI 価格

Cloudflare 公式 pricing で確認した内容:

- Workers AI は Free / Paid Workers plan の両方に含まれる。
- Free allocation は 10,000 Neurons/day。
- Paid plan でも毎日 10,000 Neurons までは free allocation。
- 10,000 Neurons/day を超える分は `$0.011 / 1,000 Neurons`。
- reset は毎日 `00:00 UTC`。
- pricing page は token 表記と Neurons 表記を並べている。内部 billing は Neurons。

LLM 価格例:

| Model | Token price |
|---|---:|
| `@cf/qwen/qwen3-30b-a3b-fp8` | `$0.051/M` input、`$0.335/M` output |
| `@cf/zai-org/glm-4.7-flash` | `$0.060/M` input、`$0.400/M` output |
| `@cf/google/gemma-4-26b-a4b-it` | `$0.100/M` input、`$0.300/M` output |
| `@cf/openai/gpt-oss-20b` | `$0.200/M` input、`$0.300/M` output |
| `@cf/openai/gpt-oss-120b` | `$0.350/M` input、`$0.750/M` output |
| `@cf/meta/llama-4-scout-17b-16e-instruct` | `$0.270/M` input、`$0.850/M` output |
| `@cf/mistralai/mistral-small-3.1-24b-instruct` | `$0.351/M` input、`$0.555/M` output |
| `@cf/ibm-granite/granite-4.0-h-micro` | `$0.017/M` input、`$0.112/M` output |

注意:

- Cloudflare の実請求は account の Workers plan、free allocation、Neurons 換算、model pricing の組み合わせで決まる。
- 今回は実アカウントの billing dashboard は見ていない。
- Flue の `response.usage` が返す token 使用量と Cloudflare の billing 表示が完全にどう対応するかは未確認。

---

## 7. bs-job-board の provider 調査

`gh` CLI で `MAA39/gs-20260620-bs-job-board` の取得を試したが、この環境では `api.github.com` 接続エラーで失敗した。代替として GitHub connector で実ファイルを取得して確認した。

確認したこと:

- `apps/agent/package.json` は `@flue/runtime@1.0.0-beta.2`、`@flue/cli@1.0.0-beta.1`。
- `apps/agent/flue.config.ts` は `defineConfig({ target: 'cloudflare' })`。
- `apps/agent/wrangler.jsonc` と `.flue-vite.wrangler.jsonc` に `ai` binding はない。
- `apps/agent/src/workflows/generate-replies.ts` で Sakura AI を OpenAI 互換 provider として登録している。

`generate-replies.ts` で確認した provider 登録:

```ts
const PROVIDER_ID = 'sakura-ai';
const DEFAULT_MODEL_ID = 'gpt-oss-120b';
const DEFAULT_BASE_URL = 'https://api.ai.sakura.ad.jp/v1';

registerProvider(PROVIDER_ID, {
  api: 'openai-completions',
  baseUrl,
  apiKey,
  models: { [modelId]: { contextWindow: 128_000, maxTokens: 1_500 } },
});
```

同 workflow の `createAgent()`:

```ts
const replyAgent = createAgent<unknown, Env>(({ env }) => ({
  model: `${PROVIDER_ID}/${env.SAKURA_MODEL_ID?.trim() || DEFAULT_MODEL_ID}`,
  thinkingLevel: 'minimal',
  instructions: 'Return only the requested JSON object and follow the supplied constraints.',
}));
```

別ファイル `apps/agent/src/agents/analyst.ts` では次の model 指定も確認した。

```ts
export default createAgent(() => ({
  model: 'sakura/gpt-oss-120b',
  instructions: '...',
}));
```

未確認:

- `sakura` provider ID の登録元は、今回取得した該当ファイル群内では確認できていない。
- Sakura AI の価格、レート制限、モデル提供条件は今回の調査範囲外。

---

## 8. aimani-gs-v2 への適用パターン

### A. Workers AI binding を使う

最小方針:

1. `apps/worker/wrangler.jsonc` に `"ai": { "binding": "AI" }` を追加する。
2. `apps/worker/src/agents/sparring-agent.ts` の model を `cloudflare/@cf/...` に変更する。
3. `registerProvider()` は書かない。
4. `flue build --target cloudflare` または既存 build で生成 entry を確認する。

例:

```ts
export default createAgent<unknown, Env>(() => ({
  model: 'cloudflare/@cf/qwen/qwen3-30b-a3b-fp8',
  instructions: SPARRING_INSTRUCTIONS,
}));
```

### B. Workers AI OpenAI 互換 HTTP endpoint を使う

最小方針:

1. `CLOUDFLARE_ACCOUNT_ID` と `CLOUDFLARE_API_KEY` を Worker secret / env に持つ。
2. `registerProvider('cf-workers-ai-http', { api: 'openai-completions', ... })` を `app.ts` 側で登録する。
3. agent の model を `cf-workers-ai-http/@cf/...` にする。

この方法は Cloudflare 外から呼ぶ場合や、binding を使わない構成では有効。ただし aimani-gs-v2 は Cloudflare Workers project なので、まずは A の binding 経路で検証するほうが単純。

### C. Sakura AI を使う

bs-job-board と同じ構成に寄せるなら、`registerProvider()` で Sakura AI の OpenAI 互換 endpoint を登録する。

```ts
registerProvider('sakura-ai', {
  api: 'openai-completions',
  baseUrl: 'https://api.ai.sakura.ad.jp/v1',
  apiKey: env.SAKURA_API_TOKEN,
  models: {
    'gpt-oss-120b': {
      contextWindow: 128_000,
      maxTokens: 1_500,
    },
  },
});
```

未確認:

- Sakura AI の現在の公式 API 仕様、価格、認証方式は今回検証していない。上記は bs-job-board の実装から確認した利用形。

---

## 9. 残る未確認事項

- 日本語応答品質、JSON 追従率、レイテンシ、コストは未実測。
- `cloudflare/@cf/...` を aimani-gs-v2 の `flue dev` / deploy 環境で実行していない。
- Cloudflare account 側の Workers AI 利用可否、Free allocation の残量、billing dashboard は未確認。
- Sakura AI の現行 pricing / model catalog / SLA は未確認。
- `gh` CLI では bs-job-board を取得できなかったため、GitHub connector で確認した。

---

## 次の検証案

コード変更をする場合は、まず `cloudflare` binding 経路で小さく試す。

1. `apps/worker/wrangler.jsonc` に `ai` binding を追加。
2. 候補 model を 2-3 個だけ選び、同じ日本語プロンプトで比較。
3. 比較軸は日本語自然さ、壁打ち品質、JSON/構造化出力の安定性、latency、`response.usage`、Cloudflare dashboard の課金表示。
4. 良ければ `anthropic/claude-sonnet-4-20250514` から段階的に切り替える。
