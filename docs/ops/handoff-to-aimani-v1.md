# Handoff: gs-v2 → aimani-v1 面談チャット体験の現在地

> 作成: 2026-07-07
> 対象リポ: gs-20260706-aimani-gs-v2（G's Academy 壁打ちAI / 個人体験磨き込み）
> 受け手: gs-20260720-aimaniAi-v1（面談→5問→OrgDraft→OrgReport 縦串）

---

## 1. 面談チャット体験で確定したこと

### モデル

**Sakura AI `gpt-oss-120b`**（さくらインターネットのOSSモデル）

```
baseUrl: https://api.ai.sakura.ad.jp/v1
api: openai-completions (OpenAI互換)
contextWindow: 128_000
maxTokens: 4_096
```

GLM系ではない。OpenAI互換APIなのでprovider切り替えは容易。品質は「壁打ちの初手応答」としては十分動いた（E2E実証済み）。ただし構造化出力（JSON mode / function calling）は未検証 — v1の5問構造化出力で使えるかは要確認。

### システムプロンプト（原文・これが動いた形）

```
あなたはG's Academyの壁打ち相手AIです。

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
```

**効いたパターン:**
- 「問いかけで思考を引き出す」+ 「リフレクション」の組み合わせは壁打ちとして自然に機能した
- 「最初の返答は短く」は初手の圧迫感を防ぐのに有効
- 「コードを書かない」「技術的回答をしない」は境界線として明確
- CBT要素・安全応答・構造化出力は **未実装** — このプロンプトは自由会話のみ

**v1への注意:** このプロンプトは「壁打ち（自由会話）」用であって「5問面談」用ではない。v1の面談フローでは構造化出力（質問→回答→次の質問の分岐）が必要になるので、プロンプト設計は別物になる。ただし口調設計の部分（フラット・短い初手・リフレクション）は流用価値あり。

---

## 2. Flue + Workers AI の実装で動いている形

### アーキテクチャ

```
[Browser] → [Web Worker (TanStack Start)]
                ↓ Service Binding (env.API.fetch)
           [API Worker (Hono + Flue)]
                ↓ Durable Object
           [Flue Agent/Workflow DO]
                ↓ HTTP
           [Sakura AI API]
```

- Web Worker と API Worker は **別Workers**、Service Bindingで接続（API Workerはpublic URLを持つがCORS無し）
- Web → API のプロキシは TanStack Start の `server.handlers` catch-all route

### ファイル構成

| ファイル | 役割 |
|---------|------|
| `apps/worker/src/app.ts` | Hono app定義 + Flue routing mount |
| `apps/worker/src/agents/sparring-agent.ts` | Flue agent定義（provider登録 + instructions） |
| `apps/worker/src/workflows/sparring-workflow.ts` | Flue workflow（AI呼び出し + DB書き込み） |
| `apps/worker/src/routes/chat.ts` | Chat HTTP routes (POST /, POST /:chatId/messages, GET /:chatId/messages) |
| `apps/worker/src/routes/member.ts` | Member HTTP routes |
| `apps/worker/flue.config.ts` | Flue CLI設定（target: cloudflare） |
| `apps/worker/wrangler.jsonc` | DO bindings定義 |
| `apps/web/src/routes/api/$.ts` | Service Binding reverse proxy catch-all |
| `apps/web/src/lib/api-proxy.ts` | Proxy helper（hop-by-hop除去、Set-Cookie処理） |

### Agent Worker の構成

Flue の `createAgent` + `registerProvider` パターン:

```ts
const sparringAgent = createAgent<unknown, Env>((ctx) => {
  registerProvider('sakura', {
    api: 'openai-completions',
    baseUrl: 'https://api.ai.sakura.ad.jp/v1',
    apiKey: ctx.env.SAKURA_API_TOKEN,
    models: { 'gpt-oss-120b': { contextWindow: 128_000, maxTokens: 4_096 } },
  });
  return { model: 'sakura/gpt-oss-120b', instructions: SPARRING_INSTRUCTIONS };
});
```

Wrangler側のDO bindings:
```json
{ "name": "FLUE_SPARRING_AGENT", "class_name": "FlueSparringAgentAgent" },
{ "name": "FLUE_SPARRING_WORKFLOW", "class_name": "FlueSparringWorkflowWorkflow" },
{ "name": "FLUE_REGISTRY", "class_name": "FlueRegistry" }
```

### ストリーミング

**未実装。** 現在はワークフロー内で `session.prompt()` を await して全文取得 → DBに保存 → フロントは2秒ポーリングで取得、という同期モデル。`ai_run_events` テーブル（SSE向けイベントストリーム）はスキーマ定義済みだが未配線。contracts に `AiRunProgressEvent` 型も定義済みだが未使用。

### Validation / Repair / Fallback

**未実装。** `ai_runs.status` に `repairing` ステータスとCAS遷移（`markRepairing`）は定義・実装済みだが、実際にrepairフローを起動するロジックはない。AI応答のバリデーション（構造化出力チェック等）も未実装。

### ワークフロー内のAI呼び出しフロー

```
1. aiRunRepo.markAdmitted(aiRunId)     ← CAS: queued→admitted
2. chatRepo.listMessages(chatId)        ← 全履歴取得
3. 履歴を "[sender]: body" で連結
4. init(sparringAgent) → session()
5. aiRunRepo.markGenerating(aiRunId, flueRunId)  ← CAS: admitted→generating
6. session.prompt(連結履歴)              ← Sakura AI呼び出し（同期）
7. chatRepo.appendMessage(aiMessageId, { senderType: 'ai', body })
8. aiRunRepo.complete({ aiRunId, resultMessageIds, tokens, hash })
```

全体が try/catch で囲まれ、失敗時は `aiRunRepo.fail()` を呼ぶ。

---

## 3. Effect-TS / DI基盤

**Effect-TSは使っていない（ADR-V2-006で見送り済み）。**

代わりに自前の軽量Result型 + Port & Adapter パターン:

### Result型

```ts
// packages/domain/src/result.ts
export type Result<T, E extends { _tag: string }> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export function ok<T>(value: T): { ok: true; value: T }
export function err<E extends { _tag: string }>(error: E): { ok: false; error: E }
```

### Port定義（v1で流用可能）

| ファイル | Port interface | エラー型 |
|---------|---------------|---------|
| `packages/domain/src/ports/chat-repository.ts` | `ChatRepository` | `ChatNotFound \| ChatArchived \| MessageSequenceConflict \| ChatDbFailure` |
| `packages/domain/src/ports/ai-run-repository.ts` | `AiRunRepository` | `AiRunNotFound \| InvalidAiRunTransition \| AiRunConflict \| AiRunDbFailure` |
| `packages/domain/src/ports/member-repository.ts` | `MemberRepository` | `MemberNotFound \| MemberDbFailure` |

### DI パターン

Effect Layer ではなく、**use case関数の引数にDeps interfaceを渡す** 素朴なDI:

```ts
export interface StartChatDeps {
  readonly memberRepo: MemberRepository;
  readonly chatRepo: ChatRepository;
  readonly aiRunRepo: AiRunRepository;
  readonly idGen: () => string;
}

export async function startChat(
  deps: StartChatDeps,
  memberId: MemberId,
  messageBody: string,
): Promise<Result<StartChatOutput, StartChatError>> { ... }
```

route handler側で `buildDeps(c.env.DB)` して注入。テスト時はモック差し替え可能（ただしテストは0本）。

### Brand型

```ts
// packages/shared/src/index.ts
type Brand<T, B extends string> = T & { readonly __brand: B };
export type MemberId = Brand<string, 'MemberId'>;
export type ChatId = Brand<string, 'ChatId'>;
// ... etc
```

v1の26テーブルに対応するBrand型があるなら、パターンは同じ。`as MemberId` のキャストで入れる形。

---

## 4. 踏んだ地雷

### Flue関連

1. **`session.name` が常に `"default"` を返す** — `flue_run_id` に使おうとしたら UNIQUE制約違反で2回目以降のworkflowが全滅。解決: `${aiRunId}-${crypto.randomUUID().slice(0,8)}` で一意化。

2. **ワークフロー起動は `app.fetch(syntheticRequest)` パターン** — Flue の routing 経由で内部ディスパッチする。`new Request('http://internal/workflows/...')` のような合成Requestを作って `waitUntil` 内で投げる。ドキュメントが薄いので `bs-job-board`（参考実装）を読むのが最速。

3. **Flue DO class名の命名規則** — `Flue{AgentName}Agent`, `Flue{WorkflowName}Workflow`, `FlueRegistry` の3つが必要。wrangler.jsonc の `durable_objects.bindings` と `migrations.new_sqlite_classes` の両方に書く。

4. **Flue build が必要** — コード変更後、`pnpm flue build` → `pnpm wrangler deploy` の順。buildしないとキャッシュが残って変更が反映されない。

### Workers AI / Sakura AI

5. **Sakura API のrate limit** — 明確な文書なし。今のところ壁打ち程度の負荷では問題なし。大量並行は未検証。

6. **構造化出力（JSON mode / function calling）** — 未検証。Sakura API が OpenAI互換とはいえ、`response_format: { type: "json_object" }` や tool calling がサポートされてるかは不明。v1の5問フローで使うなら先に検証すべき。

### ローカル開発

7. **`wrangler dev` でFlue DOがそのまま動かない** — ローカルではDO + D1の組み合わせが不安定。本番デプロイして確認するのが確実だった。

8. **Service Binding はローカルで動かない** — `cloudflare:workers` の dynamic import が dev server では失敗する。api-proxy.ts に try/catch フォールバックを入れてある。

### D1

9. **sequence採番の非アトミック性** — `MAX(sequence)+1` を読んでからINSERTは並行書き込みでUNIQUE違反。レビューで3系統（Sonnet/Mihari/Adversarial）から指摘あり。D1 batch APIか単一SQLでの採番に変更が必要。v1では最初から `INSERT INTO ... SELECT COALESCE(MAX(sequence),0)+1` の単一SQL方式にしたほうがいい。

---

## 5. 体験面の学び

### Q1「鏡 vs 材料」に繋がる発見

このプロトタイプで実証されたのは **「鏡」側の最小形** — ユーザーの発言をリフレクションして「何に詰まってるか」を整理する体験。

- プロンプトの「ユーザーの言葉を言い換えて確認する（リフレクション）」は実際に機能した
- 「答えを教えない」「コードを書かない」の禁止ルールがあることで、AIが「材料を出す側」に回らず「鏡」に留まれた
- ただし「推薦の種を見つけたら内部的にメモする」は未配線 — これが「材料」側への橋渡しになるはず

**v1への示唆:** 面談5問は「材料を集める」フェーズ（構造化質問→OrgDraft生成）。鏡の体験（自由会話で整理）と材料の体験（構造化質問で抽出）は別のプロンプト設計が要る。gs-v2は鏡だけ実証した形。

---

## 再利用可能なファイルリスト（v1で参照すべき順）

### 最優先（設計パターンとして流用）

| ファイル | 流用ポイント |
|---------|------------|
| `packages/domain/src/result.ts` | Result型の定義（12行）。そのまま使える |
| `packages/shared/src/index.ts` | Brand型パターン + const object enumパターン |
| `packages/domain/src/ports/*.ts` | Port interface + _tag union error型の設計パターン |
| `packages/domain/src/use-cases/start-chat.ts` | Deps injection + Result伝搬パターンの見本 |

### 参考（構成パターンとして）

| ファイル | 流用ポイント |
|---------|------------|
| `apps/worker/src/agents/sparring-agent.ts` | Flue agent定義の書き方（registerProvider + createAgent） |
| `apps/worker/src/workflows/sparring-workflow.ts` | Flue workflow内のCAS状態遷移 + AI呼び出しパターン |
| `apps/worker/src/routes/chat.ts` | Hono route → use case → Result分岐 → HTTP応答の配線 |
| `apps/web/src/lib/api-proxy.ts` | Service Binding reverse proxy（hop-by-hop/Set-Cookie処理） |
| `apps/web/src/routes/api/$.ts` | TanStack Start catch-all route for Service Binding |
| `packages/db/migrations/0003_ai_runs.sql` | CAS状態遷移のスキーマ設計（CHECK + UNIQUE） |

### 注意（既知の問題あり）

| ファイル | 問題 |
|---------|------|
| `packages/db/src/adapters/d1-chat-repository.ts` | sequence非アトミック採番（P0指摘済み・未修正） |
| `apps/web/src/lib/api-client.ts` | throw new Error残存（CI guard抵触・未修正） |
| `apps/worker/src/routes/chat.ts:54,100` | switch default catch-all（exhaustive checkなし・未修正） |

---

## 本番URL（動作確認用）

- API Worker: `https://aimani-gs-v2.masa-nekoshinshi39.workers.dev/`
- Web: `https://aimani-gs-v2-web.masa-nekoshinshi39.workers.dev/`
- PR #12: feature/4-empty-box-deploy（認可チェック追加済み）
