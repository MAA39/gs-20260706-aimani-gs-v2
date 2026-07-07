# 14. TanStack Start から Cloudflare Worker API への接続調査

## 概要

| 項目 | 内容 |
|------|------|
| 対象 | `apps/web` (TanStack Start) → `apps/worker` (Hono + Flue) |
| Worker名 | web: `aimani-gs-v2-web` / API: `aimani-gs-v2` |
| APIエンドポイント | `POST /api/members`, `POST /api/chats`, `POST /api/chats/:id/messages`, `GET /api/chats/:id/messages` |
| 契約型 | `@gs-v2/contracts` に `StartChatRequest`, `SendMessageRequest`, `MessageDto` 等が定義済み |

## 結論

**推奨: アプローチA (createServerFn + Service Binding) の組み合わせ**

- `createServerFn` でSSRレイヤにサーバー関数を定義し、その内部で Service Binding 経由で API Worker を呼ぶ
- CORSが不要（サーバー間通信）、型安全、レイテンシ最小（Cloudflare内部ネットワーク）
- ポーリングには TanStack Query の `refetchInterval` を使用

## 前提: 現状の依存関係

```
# apps/web/package.json
dependencies:
  @tanstack/react-router: ^1.120.0
  @tanstack/react-start: ^1.120.0   # createServerFn を export
  react, react-dom: ^19.1.0

# @tanstack/react-start が内部依存として持つもの:
  @tanstack/react-start-client, @tanstack/react-start-server
  @tanstack/start-client-core  # createServerFn の実体

# @tanstack/react-query:
  node_modules に存在する（react-start の依存として）
  ただし apps/web/package.json の直接依存には未記載 → 追加が必要
```

---

## アプローチ A: createServerFn + Service Binding（推奨）

### 仕組み

```
[ブラウザ] --(RPC)--> [web Worker SSR層: createServerFn]
                           |
                           | Service Binding (CF内部ネットワーク)
                           v
                      [API Worker: Hono]
```

`createServerFn` はTanStack Startの中核機能。クライアントから呼ぶとRPCとしてSSRサーバー（= web Worker）上で実行される。このSSRサーバーは Cloudflare Worker なので、Service Binding で API Worker を直接呼べる。

### 1. wrangler.jsonc に Service Binding を追加

```jsonc
// apps/web/wrangler.jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "aimani-gs-v2-web",
  "compatibility_date": "2026-06-01",
  "compatibility_flags": ["nodejs_compat"],
  "main": "@tanstack/react-start/server-entry",
  "services": [
    {
      "binding": "API",
      "service": "aimani-gs-v2"
    }
  ]
}
```

### 2. Cloudflare env の型定義

```typescript
// apps/web/src/lib/env.d.ts
export interface WebWorkerEnv {
  API: Fetcher; // Service Binding to aimani-gs-v2
}
```

### 3. API クライアント層

```typescript
// apps/web/src/lib/api-client.ts
import type {
  StartChatRequest,
  StartChatResponse,
  SendMessageRequest,
  SendMessageResponse,
  ChatMessagesResponse,
} from '@gs-v2/contracts';

// Service Binding の Fetcher を受け取って API 呼び出しを行う
// Note: Service Binding は Worker 間通信なので CORS 不要
export function createApiClient(apiFetcher: Fetcher) {
  async function request<TResponse>(
    method: string,
    path: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<TResponse> {
    // Service Binding uses a dummy origin — the binding routes to the correct Worker
    const url = `https://api-internal${path}`;
    const response = await apiFetcher.fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new ApiError(response.status, error as Record<string, unknown>);
    }

    return response.json() as Promise<TResponse>;
  }

  return {
    startChat(memberId: string, data: StartChatRequest): Promise<StartChatResponse> {
      return request('POST', '/api/chats', data, { 'x-user-id': memberId });
    },

    sendMessage(memberId: string, chatId: string, data: SendMessageRequest): Promise<SendMessageResponse> {
      return request('POST', `/api/chats/${chatId}/messages`, data, { 'x-user-id': memberId });
    },

    getMessages(chatId: string): Promise<ChatMessagesResponse> {
      return request('GET', `/api/chats/${chatId}/messages`);
    },
  };
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: Record<string, unknown>,
  ) {
    super(`API error ${status}: ${JSON.stringify(body)}`);
    this.name = 'ApiError';
  }
}
```

### 4. createServerFn でサーバー関数を定義

```typescript
// apps/web/src/lib/api.server.ts
import { createServerFn } from '@tanstack/react-start';
import { createApiClient } from './api-client';
import type {
  StartChatRequest,
  StartChatResponse,
  SendMessageRequest,
  SendMessageResponse,
  ChatMessagesResponse,
} from '@gs-v2/contracts';

// ----- Service Binding の取得 -----
// TanStack Start on Cloudflare Workers では
// globalThis に env がバインドされるか、
// getRequestEvent() 経由でアクセスする。
// @cloudflare/vite-plugin が CF Worker 環境を提供するため、
// getCloudflareEnv() ヘルパーで取得する方法を推奨。

function getApiClient(): ReturnType<typeof createApiClient> {
  // Cloudflare Workers の env は request context から取得
  // TanStack Start では middleware 経由で渡すのが正攻法
  const env = (globalThis as any).__cf_env__ as { API: Fetcher };
  return createApiClient(env.API);
}

// ----- Server Functions -----

export const startChatFn = createServerFn({ method: 'POST' })
  .validator((data: { memberId: string; message: string }) => data)
  .handler(async ({ data }): Promise<StartChatResponse> => {
    const api = getApiClient();
    return api.startChat(data.memberId, { message: data.message });
  });

export const sendMessageFn = createServerFn({ method: 'POST' })
  .validator((data: { memberId: string; chatId: string; message: string }) => data)
  .handler(async ({ data }): Promise<SendMessageResponse> => {
    const api = getApiClient();
    return api.sendMessage(data.memberId, data.chatId, { message: data.message });
  });

export const getMessagesFn = createServerFn({ method: 'GET' })
  .validator((data: { chatId: string }) => data)
  .handler(async ({ data }): Promise<ChatMessagesResponse> => {
    const api = getApiClient();
    return api.getMessages(data.chatId);
  });
```

### 5. Cloudflare env を createServerFn で使うための middleware

```typescript
// apps/web/src/lib/cf-middleware.ts
import { createMiddleware } from '@tanstack/react-start';

// TanStack Start middleware で Cloudflare env をコンテキストに注入
// createServerFn の handler 内で ctx.context.env としてアクセス可能
export const withCloudflareEnv = createMiddleware().server(async ({ next }) => {
  // @cloudflare/vite-plugin が SSR Worker 環境を構築するため
  // env は Worker の fetch handler 引数から取得する必要がある。
  // TanStack Start の内部では getEvent() / vinxi 経由で取得する。
  //
  // 具体的な取得方法は TanStack Start + CF Workers の統合が
  // まだ発展途上のため、以下の候補を検証する必要がある:
  //   1. getEvent().context.cloudflare.env (Nuxt/Nitro スタイル)
  //   2. globalThis.__cf_env__ (vite-plugin が注入する場合)
  //   3. import { getCloudflareEnv } from '@cloudflare/vite-plugin' (公式ヘルパー)
  //
  // ★ 実装時に要検証

  return next({ context: {} });
});
```

### Pros / Cons

| Pros | Cons |
|------|------|
| CORS 不要（Worker 間通信） | Service Binding は同一 CF アカウント必須 |
| レイテンシ最小（CF 内部ネットワーク） | `createServerFn` 内で CF env を取得する方法が TanStack Start + CF Workers で発展途上 |
| 型安全（`@gs-v2/contracts` で入出力を型付け） | ローカル dev 時は `wrangler dev --remote` または Service Binding のモック要 |
| API キーをフロントに露出しない | `createServerFn` は SSR 層を経由するため、純粋なクライアント直叩きより1ホップ多い |

---

## アプローチ B: クライアントから直接 fetch（CORS 必要）

### 仕組み

```
[ブラウザ] --(HTTP/CORS)--> [API Worker: Hono]
```

### コード例

```typescript
// apps/web/src/lib/api-client.browser.ts
const API_BASE = import.meta.env.VITE_API_URL ?? 'https://aimani-gs-v2.masa-nekoshinshi39.workers.dev';

export async function startChat(memberId: string, message: string) {
  const res = await fetch(`${API_BASE}/api/chats`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': memberId,
    },
    body: JSON.stringify({ message }),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}
```

### API Worker 側に CORS middleware 追加

```typescript
// apps/worker/src/app.ts
import { cors } from 'hono/cors';

app.use('/api/*', cors({
  origin: ['https://aimani-gs-v2-web.masa-nekoshinshi39.workers.dev', 'http://localhost:5173'],
  allowHeaders: ['Content-Type', 'x-user-id'],
  allowMethods: ['GET', 'POST', 'OPTIONS'],
}));
```

### Pros / Cons

| Pros | Cons |
|------|------|
| 実装がシンプル | CORS 設定が必要（origin 管理） |
| SSR 層を経由しない（ホップが少ない） | `x-user-id` ヘッダーがブラウザから見える（認証設計次第でリスク） |
| ローカル dev で動作確認しやすい | API URL をクライアントに公開する |

---

## アプローチ C: createServerFn + 外部 fetch（Service Binding なし）

### 仕組み

```
[ブラウザ] --(RPC)--> [web Worker SSR層: createServerFn]
                           |
                           | fetch (外部HTTP)
                           v
                      [API Worker: Hono]
```

Service Binding の代わりに普通の `fetch` で API Worker を呼ぶ。CORS は不要（サーバー間通信）だが、パブリックインターネットを経由するためレイテンシが増える。

```typescript
// apps/web/src/lib/api.server.ts
import { createServerFn } from '@tanstack/react-start';

const API_URL = process.env.API_URL ?? 'https://aimani-gs-v2.masa-nekoshinshi39.workers.dev';

export const startChatFn = createServerFn({ method: 'POST' })
  .validator((data: { memberId: string; message: string }) => data)
  .handler(async ({ data }) => {
    const res = await fetch(`${API_URL}/api/chats`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': data.memberId,
      },
      body: JSON.stringify({ message: data.message }),
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
  });
```

### Pros / Cons

| Pros | Cons |
|------|------|
| Service Binding 設定不要 | パブリックインターネット経由（レイテンシ増） |
| CORS 不要 | API Worker に認証がない場合、誰でも叩ける（要 API キー設計） |
| ローカル dev でも動く | アプローチ A に比べて利点なし（Service Binding が使えるなら A が上位互換） |

---

## ポーリングパターン: TanStack Query + refetchInterval

AI 応答待ち（`ai_run` が `queued` → `completed` に遷移するのを待つ）には TanStack Query のポーリングが最適。

### 依存追加

```bash
pnpm --filter @gs-v2/web add @tanstack/react-query
```

### QueryClient セットアップ

```typescript
// apps/web/src/lib/query-client.ts
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30,  // 30 seconds
      retry: 2,
    },
  },
});
```

### __root.tsx に QueryClientProvider を追加

```tsx
// apps/web/src/routes/__root.tsx
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '../lib/query-client';

function RootComponent() {
  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
    </QueryClientProvider>
  );
}
```

### ポーリング実装: 適応的 refetchInterval

```typescript
// apps/web/src/hooks/use-chat-messages.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getMessagesFn, sendMessageFn } from '../lib/api.server';

// AI 応答完了を検知するポーリングフック
export function useChatMessages(chatId: string, options?: { waitingForAi?: boolean }) {
  return useQuery({
    queryKey: ['chat', chatId, 'messages'],
    queryFn: () => getMessagesFn({ data: { chatId } }),

    // Adaptive polling: AI 応答待ちの間だけポーリングする
    refetchInterval: (query) => {
      if (!options?.waitingForAi) return false;

      const messages = query.state.data?.messages ?? [];
      const lastMessage = messages[messages.length - 1];

      // AI のメッセージが到着したらポーリング停止
      if (lastMessage?.senderType === 'ai') return false;

      // AI 応答待ち中は 2 秒間隔でポーリング
      return 2_000;
    },
  });
}

// メッセージ送信 + ポーリング開始
export function useSendMessage(chatId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: { memberId: string; message: string }) =>
      sendMessageFn({
        data: { memberId: params.memberId, chatId, message: params.message },
      }),
    onSuccess: () => {
      // 送信成功後にメッセージ一覧を再取得
      queryClient.invalidateQueries({ queryKey: ['chat', chatId, 'messages'] });
    },
  });
}
```

### コンポーネントでの使用例

```tsx
// apps/web/src/routes/chats/$chatId.tsx
import { createFileRoute } from '@tanstack/react-router';
import { useChatMessages, useSendMessage } from '../../hooks/use-chat-messages';
import { useState } from 'react';

export const Route = createFileRoute('/chats/$chatId')({
  component: ChatPage,
});

function ChatPage() {
  const { chatId } = Route.useParams();
  const [waitingForAi, setWaitingForAi] = useState(false);
  const [input, setInput] = useState('');

  const messagesQuery = useChatMessages(chatId, { waitingForAi });
  const sendMessage = useSendMessage(chatId);

  const handleSend = async () => {
    if (!input.trim()) return;
    setWaitingForAi(true);
    await sendMessage.mutateAsync({
      memberId: 'current-user-id', // TODO: auth context から取得
      message: input,
    });
    setInput('');
  };

  // AI 応答が到着したらポーリング停止
  const messages = messagesQuery.data?.messages ?? [];
  const lastMessage = messages[messages.length - 1];
  if (waitingForAi && lastMessage?.senderType === 'ai') {
    setWaitingForAi(false); // Note: useEffect 内で行うべき（簡略化のため直書き）
  }

  return (
    <div>
      <div>
        {messages.map((msg) => (
          <div key={msg.id} data-sender={msg.senderType}>
            <strong>{msg.senderType}:</strong> {msg.body}
          </div>
        ))}
        {waitingForAi && <div>AI が考え中...</div>}
      </div>
      <input value={input} onChange={(e) => setInput(e.target.value)} />
      <button onClick={handleSend} disabled={sendMessage.isPending}>
        送信
      </button>
    </div>
  );
}
```

---

## ローカル開発時の注意点

### Service Binding のローカル開発

`wrangler dev` で複数 Worker を同時起動すると、Service Binding はローカルでも動作する:

```bash
# Terminal 1: API Worker
cd apps/worker && pnpm wrangler dev

# Terminal 2: Web Worker
cd apps/web && pnpm dev
```

`@cloudflare/vite-plugin` は `wrangler.jsonc` の `services` 設定を読み取り、ローカルの Service Binding をセットアップする。ただし、両方の Worker が同時に起動している必要がある。

### 環境変数の整理

| 環境変数 | 用途 | 必要な場面 |
|---------|------|-----------|
| `API` (Service Binding) | Worker 間通信 | アプローチ A（推奨） |
| `VITE_API_URL` | クライアント直叩き | アプローチ B のみ |
| `API_URL` (server-side) | SSR から外部 fetch | アプローチ C のみ |

---

## 実装計画

### Phase 1: 基盤セットアップ

1. `pnpm --filter @gs-v2/web add @tanstack/react-query` で直接依存に追加
2. `apps/web/wrangler.jsonc` に Service Binding (`"API"` → `"aimani-gs-v2"`) を追加
3. `apps/web/src/lib/env.d.ts` で `WebWorkerEnv` 型を定義
4. `apps/web/src/lib/api-client.ts` を作成（Service Binding Fetcher ベース）

### Phase 2: Server Functions

5. `apps/web/src/lib/api.server.ts` に `createServerFn` を定義
   - `startChatFn`, `sendMessageFn`, `getMessagesFn`
6. CF env の取得方法を検証（`@cloudflare/vite-plugin` のヘルパー or `getEvent()` 経由）

### Phase 3: UI 接続

7. `apps/web/src/hooks/use-chat-messages.ts` でポーリングフックを実装
8. チャット画面の Route コンポーネントで接続

### 検証が必要な未解決事項

| 項目 | 内容 | 対処 |
|------|------|------|
| CF env の取得 | TanStack Start の `createServerFn` handler 内で `@cloudflare/vite-plugin` が提供する env にどうアクセスするか | Phase 2 で実機検証。`getCloudflareEnv()` ヘルパー、`getEvent().context.cloudflare.env`、`getRequestEvent()` の3候補を試す |
| `@tanstack/react-query` バージョン | react-start の内部依存として入っているが、明示的に追加するときのバージョン互換 | `pnpm ls @tanstack/react-query` で確認してから追加 |
| ローカル dev の同時起動 | `@cloudflare/vite-plugin` が Service Binding をローカルで解決するか | `pnpm dev` で両 Worker 起動して疎通確認 |
