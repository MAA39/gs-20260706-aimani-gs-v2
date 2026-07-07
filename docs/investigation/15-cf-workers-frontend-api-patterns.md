# 15 - Cloudflare Workers: Frontend-API 接続パターン調査

## 推奨: Option 1 — Service Binding + Reverse Proxy

**bs-job-board で実証済み。** TanStack Start (web worker) から Hono API (worker) への接続は
Service Binding が最適解。レイテンシゼロ、CORS 不要、認証ヘッダー透過転送、SSE ストリーミング対応済み。

---

## 現状の構成

```
aimani-gs-v2/
├── apps/web/          # TanStack Start + @cloudflare/vite-plugin
│   └── wrangler.jsonc # name: "aimani-gs-v2-web"  ← Service Binding 未設定
├── apps/worker/       # Hono API + Flue + Durable Objects + D1
│   └── wrangler.jsonc # name: "aimani-gs-v2"
```

web → worker の接続が未設定。以下の 4 パターンを比較した。

---

## Option 1: Service Binding (推奨)

### 概要

Web Worker が `env.API.fetch()` で API Worker を直接呼び出す。
Cloudflare 内部ネットワークで完結し、public internet を経由しない。

### 設定

**apps/web/wrangler.jsonc:**
```jsonc
{
  "name": "aimani-gs-v2-web",
  "compatibility_date": "2026-06-01",
  "compatibility_flags": ["nodejs_compat"],
  "main": "@tanstack/react-start/server-entry",
  "services": [
    {
      "binding": "API",
      "service": "aimani-gs-v2"  // worker の name と一致
    }
  ]
}
```

### env へのアクセス方法

TanStack Start + @cloudflare/vite-plugin 環境では `cloudflare:workers` モジュールから取得する。

**apps/web/src/lib/api-fetch.ts:**
```typescript
/**
 * getApi — Web serverFn → API Worker 呼び出しヘルパー
 *
 * Service Binding (env.API) を使い、必要に応じて
 * incoming request の Cookie/Authorization を転送する。
 */

type ApiFn = (url: string, init?: RequestInit) => Promise<Response>;

export async function getApi(options?: {
  cookie?: string | null;
  authorization?: string | null;
  forwardedHost?: string | null;
  forwardedProto?: string | null;
}): Promise<ApiFn> {
  const injectHeaders = (init?: RequestInit): RequestInit => {
    if (!options) return init ?? {};
    const headers = new Headers(init?.headers);
    if (options.cookie) headers.set('cookie', options.cookie);
    if (options.authorization) headers.set('authorization', options.authorization);
    if (options.forwardedHost) headers.set('x-forwarded-host', options.forwardedHost);
    if (options.forwardedProto) headers.set('x-forwarded-proto', options.forwardedProto);
    return { ...init, headers };
  };

  try {
    // Cloudflare Workers 環境: Service Binding 経由
    const { env } = (await import('cloudflare:workers')) as unknown as {
      env: { API: { fetch: typeof fetch } };
    };
    return (url: string, init?: RequestInit) =>
      env.API.fetch(`https://api${url}`, injectHeaders(init));
  } catch {
    // ローカル開発: localhost fallback
    return (url: string, init?: RequestInit) =>
      fetch(`http://localhost:8787${url}`, injectHeaders(init));
  }
}
```

**重要: `await import('cloudflare:workers')`** がキーポイント。
`@cloudflare/vite-plugin` が `cloudflare({ viteEnvironment: { name: 'ssr' } })` で設定されていれば、
SSR 側（server functions / server routes）でこのモジュールが利用可能になる。

### ブラウザ直 → API のプロキシルート

ブラウザから `/api/*` へのリクエストを API Worker に転送する catch-all server route。

**apps/web/src/routes/api/$.ts:**
```typescript
import { createFileRoute } from '@tanstack/react-router';
import { proxyApiRequest } from '../../lib/api-proxy';

async function proxy({
  request,
  params,
}: {
  request: Request;
  params: { _splat: string };
}): Promise<Response> {
  const { env } = (await import('cloudflare:workers')) as unknown as {
    env: { API: { fetch: (input: RequestInfo, init?: RequestInit) => Promise<Response> } };
  };

  if (!env?.API) {
    return new Response(
      JSON.stringify({ error: 'API service unavailable' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }

  return await proxyApiRequest(request, env.API, params._splat);
}

export const Route = createFileRoute('/api/$')({
  server: {
    handlers: {
      GET: proxy, POST: proxy, PUT: proxy,
      PATCH: proxy, DELETE: proxy, OPTIONS: proxy,
    },
  },
});
```

### proxyApiRequest ヘルパー

hop-by-hop ヘッダー除去、Set-Cookie 透過、SSE ストリーム対応の本格的な reverse proxy。
bs-job-board の `apps/web/src/lib/api-proxy.ts` を参照（約 115 行、テスト付き）。

### 2 つの呼び出しパス

| パス | 用途 | 仕組み |
|------|------|--------|
| serverFn 内から | TanStack Query の queryFn 等 | `getApi()` → `env.API.fetch()` |
| ブラウザ直 `/api/*` | SSE ストリーム、WebSocket 等 | `/api/$` server route → `proxyApiRequest()` |

### ローカル開発

`wrangler dev` は Service Binding をローカルでもエミュレートする。
ただし web と worker を別々に `wrangler dev` で起動する場合、localhost fallback が必要。

```
# ターミナル 1: API Worker
cd apps/worker && pnpm dev  # port 8787

# ターミナル 2: Web (Vite dev)
cd apps/web && pnpm dev     # port 5173 → localhost:8787 fallback
```

### Pros

- **レイテンシゼロ**: Cloudflare 内部呼び出し、DNS/TLS/TCP ハンドシェイクなし
- **CORS 不要**: same-origin 扱い
- **課金効率**: Service Binding の fetch は subrequest 課金のみ（別 Worker のリクエスト課金なし）
- **認証透過**: Cookie/Authorization をそのまま転送可能
- **bs-job-board 実証済み**: 同じスタック構成で動作確認済み
- **セキュリティ**: API Worker を public internet に露出する必要がない

### Cons

- **Worker 間の型共有**: `cloudflare:workers` の型は手動キャスト（`as unknown as`）が必要
- **ローカル開発**: try/catch + localhost fallback のボイラープレートが必要
- **デプロイ順序**: API Worker を先にデプロイする必要がある（binding 先が存在しないとエラー）

---

## Option 2: Custom Domain + Path-based Routing

### 概要

同一ドメインの異なるパスで web と worker をルーティングする。
例: `aimani.example.com/*` → web、`aimani.example.com/api/*` → worker。

### 設定方法

#### 方式 A: Workers Routes

```toml
# worker の wrangler.toml
routes = [
  { pattern = "aimani.example.com/api/*", zone_name = "example.com" }
]
```

Web Worker は `aimani.example.com/*` に Custom Domain でデプロイ。
問題: `/api/*` が先に worker にマッチするため web にはルーティングされない。

#### 方式 B: Dispatcher Worker（親ルーター）

```typescript
// dispatcher worker
export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      return env.API_WORKER.fetch(request);
    }
    return env.WEB_WORKER.fetch(request);
  }
};
```

### Pros

- ブラウザから見て完全 same-origin（Cookie/CORS の問題なし）
- 単一ドメインで管理できる

### Cons

- **余分な Worker**: Dispatcher を追加するか、Routes の設定が複雑
- **Service Binding と本質的に同じ**: 結局 Dispatcher 内で `env.XXX.fetch()` を使う
- **Option 1 の上位互換ではない**: Option 1 の方がシンプルで同等以上の機能

---

## Option 3: CORS + 別ドメイン直接通信

### 概要

API Worker を `api.aimani.example.com` 等の別ドメインに公開し、
ブラウザから直接 fetch する。

### 設定

**API Worker (Hono):**
```typescript
import { cors } from 'hono/cors';

const app = new Hono();
app.use('/api/*', cors({
  origin: ['https://aimani.example.com'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true,
}));
```

### Pros

- 構成がシンプル（Worker 間の依存なし）
- API を外部にも公開しやすい

### Cons

- **レイテンシ増加**: ブラウザ → API で DNS/TLS/TCP が発生
- **CORS preflight**: 非 simple request で OPTIONS リクエストが増加
- **Cookie 制限**: cross-origin Cookie は SameSite=None + Secure が必要、Safari で制限あり
- **セキュリティ**: API Worker を public internet に露出する必要がある
- **SSE/WebSocket**: CORS の制約で追加設定が必要
- **serverFn 非活用**: TanStack Start の server functions を活かせない

---

## Option 4: Single Worker（統合）

### 概要

web と worker を 1 つの Cloudflare Worker に統合する。
`@cloudflare/vite-plugin` が TanStack Start の SSR を処理し、
同じ Worker 内で Hono API も動かす。

### 設定

```typescript
// 単一の app.ts
import { Hono } from 'hono';
const apiApp = new Hono();
apiApp.get('/api/health', (c) => c.json({ status: 'ok' }));
// ... API routes

// TanStack Start の SSR handler が残りを処理
```

### Pros

- **最シンプル**: Worker 1 つ、wrangler.jsonc 1 つ
- **共有 bindings**: D1/DO/KV を直接参照（fetch 不要）

### Cons

- **関心の分離なし**: フロントとバックエンドのデプロイが結合
- **Durable Objects の制約**: aimani-gs-v2 は Flue framework の DO（Agent/Workflow/Registry）を使用。
  これを TanStack Start の Vite ビルドに組み込むのは困難
- **スケーリング独立性なし**: API だけスケールしたい場合に不可能
- **テスト**: API の単体テストが web のビルドに依存する
- **Flue との互換性**: `@flue/cli` が独自の Vite 設定 + wrangler 設定を生成するため、
  `@cloudflare/vite-plugin` との統合が未検証

---

## bs-job-board からの学び

bs-job-board は **Option 1 を採用**しており、以下の 3 層構造を持つ:

```
bs-job-board-web  ──[Service Binding]──▸  bs-job-board-api  ──[Service Binding]──▸  bs-job-board-agent
```

### 実装の要点

1. **api-fetch.ts**: serverFn から API を呼ぶ薄いヘルパー。`cloudflare:workers` の dynamic import + localhost fallback
2. **api-proxy.ts**: ブラウザ直リクエスト用の reverse proxy。hop-by-hop ヘッダー除去、Set-Cookie 透過、SSE 対応
3. **routes/api/$.ts**: TanStack Router の catch-all server route で全 HTTP メソッドをプロキシ
4. **vite.config.ts**: `cloudflare({ viteEnvironment: { name: 'ssr' } })` が `cloudflare:workers` モジュールを有効化

### aimani-gs-v2 への適用

bs-job-board のコードをほぼそのまま移植可能:

| bs-job-board | aimani-gs-v2 |
|---|---|
| `bs-job-board-api` | `aimani-gs-v2` (worker) |
| `bs-job-board-web` | `aimani-gs-v2-web` |
| wrangler の `service: "bs-job-board-api"` | `service: "aimani-gs-v2"` |

---

## 結論

**Option 1 (Service Binding) を採用する。**

理由:
1. bs-job-board で同一スタック（TanStack Start + Hono + D1 + DO）での実証済み
2. レイテンシ・課金・セキュリティすべてで最優秀
3. aimani-gs-v2 は Flue の Durable Objects を使うため Single Worker 統合は現実的でない
4. CORS 方式は serverFn の利点を捨てることになり、TanStack Start を使う意味が薄れる
5. 実装コードが bs-job-board からほぼコピー可能

### 実装手順

1. `apps/web/wrangler.jsonc` に `services` 設定を追加
2. `apps/web/src/lib/api-fetch.ts` を作成（bs-job-board から移植）
3. `apps/web/src/lib/api-proxy.ts` を作成（bs-job-board から移植）
4. `apps/web/src/routes/api/$.ts` を作成（catch-all proxy route）
5. `apps/web/vite.config.ts` に `cloudflare({ viteEnvironment: { name: 'ssr' } })` を確認
6. ローカル開発の動作確認（worker → web の順に起動）
