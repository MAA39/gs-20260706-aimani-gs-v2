# bs-job-board vs aimani-gs-v2 差分分析・ブラッシュアップ提案

調査日: 2026-07-07
調査方法: Codex (codex-rescue) — GitHub API + ローカル比較
対象: https://github.com/MAA39/gs-20260620-bs-job-board vs aimani-gs-v2

---

## 1. bs-job-boardの全体像

3 Workers完全分離モノレポ:
- `apps/web`: TanStack Start SSR
- `apps/api`: Hono API兼D1 holder
- `apps/agent`: Flue Agent

データフロー: Web→APIで投稿 → API→AgentでAI依頼 → Agent→API callbackでAIレス保存 → Web→APIで取得

3 Worker分離の主効果:
- APIだけがD1を持つ
- AgentをAI処理専用に隔離
- WebからAPIをService Bindingでsame-origin proxy的に呼べる

## 2. V2にまだない重要パターン

| パターン | bs-job-board | aimani-gs-v2 | 対応 |
|---|---|---|---|
| packages/contracts | HTTP DTO、AI run event、公開error code | なし | **P0: 追加** |
| Service Binding | Web→API、API→Agent、Agent→API | なし（1 Worker同居なら一部不要） | Web→Worker分はP1 |
| CI | typecheck/build/test + アーキgrepガード | なし | **P0: 追加** |
| Cloudflare Vitest | D1 migrations適用、Miniflare | なし | P1 |
| Better Auth | D1 binding、fail-closed | x-user-id仮実装 | P1（境界だけ作る） |
| CORS/same-origin proxy | Web Worker経由 | なし | P1 |
| AI run状態管理 | queued/generating/repairing/completed/failed + SSE | なし | **P0: 設計** |
| body limit | strict payload validation | なし | P1 |
| internal callback key | 3 Worker分離時に有効 | 1 Worker同居なら不要 | N/A |

## 3. V2に取り入れるべき良い点

### 最優先: AI実行を状態機械としてDBに残す
壁打ち/推薦でもAI処理は失敗・repair・再接続・重複実行が起きる。
bsの `ai_runs` / `ai_run_events` / SSE公開イベント設計はそのまま概念移植可能。

### packages/contracts の導入
- domain = 純粋ロジック（Port interface）
- **contracts = HTTP境界**（DTO、API契約、AI progress event）
- shared = Brand型/Role enum

### CIアーキテクチャガード
bs: Service Binding経由以外のAI直fetch禁止、Agent D1禁止、legacy route復活禁止
V2追加: `throw new Error` 禁止、`packages/domain` I/O禁止、`wrangler.jsonc` `migrations_dir` 必須

## 4. bs-job-board側の改善点（V2で修正すべき）

- `throw new Error` / `Error` 継承class多用 → V2ではResult型 + `_tag` union
- コード内ADR理由コメント多い → V2ではLinear ADR正本、コードはslug参照のみ
- `passWithNoTests` → テスト未配置でCIが通る余地 → V2では禁止
- Web/serverFnで `throw new Error` → UI境界でもResult的失敗表現
- CORS trusted originハードコード → 環境別config化
- `post_number` race condition → UNIQUE制約/採番方式再設計
- CDがCIほど整っていない → V2のDoDはD1適用→deploy→URL確認まで自動化

## 5. AGENTS.md L0とのギャップ

**要対応: AGENTS.mdの矛盾**
- AGENTS.md: 「Flue Agentの設定はapps/agent/に閉じる」
- 設計判断: 「apps/workerにHono + Flue同居」
→ **AGENTS.mdを更新して同居に統一する必要あり**

## 6. 1 Worker vs 3 Worker トレードオフ

| 観点 | 1 Worker (V2) | 3 Worker (bs) |
|---|---|---|
| 初期開発速度 | 速い | 遅い |
| Service Binding/CORS | 不要（同一Worker内） | 必要 |
| AI/DB境界 | コード規約+CIで守る | 実行時に強制分離 |
| セキュリティ/blast radius | 弱い | 強い |
| ローカル開発 | シンプル | 複雑 |

推奨: V2初期は1 backend Workerで進め、bsの分離思想を「モジュール境界+CIガード+contracts+Result」で再現。
AI負荷や権限境界が固まった時点でAgent Worker分離へ戻せるよう、Flue/AI実行コードは分離しやすいディレクトリ配置にする。

## 7. ブラッシュアップ優先順位

### P0（即時対応）
1. AGENTS.md矛盾解消: `apps/agent`分離→`apps/worker`同居に統一
2. `packages/contracts` 追加: HTTP DTO、AI progress event、公開error code
3. D1 migration配置と `wrangler.jsonc` の `migrations_dir` 設定
4. CI追加: typecheck/build/test、throw禁止grep、domain I/O禁止grep
5. 最初の垂直スライスの仕様テスト追加

### P1（垂直スライス実装中に）
6. AI run状態機械、idempotency key、resultHash、SSE progress
7. Web→WorkerのService Binding/same-origin API fetch helper
8. body limit、strict payload validation
9. 認証 `x-user-id` 仮実装 + mutation fail-closed境界 + Better Auth差替えポイント

### P2（垂直スライス後）
10. Better Auth匿名/GitHubログイン
11. deploy workflow自動化
12. Agent分離への移行ADR
13. frontend e2e、AI workflow mock test、observability
