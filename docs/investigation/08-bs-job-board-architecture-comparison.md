# bs-job-board vs aimani-gs-v2 アーキテクチャ比較・移植戦略

調査日: 2026-07-07
調査方法: Codex (codex-rescue) — GitHub API + ローカル比較
対象: https://github.com/MAA39/gs-20260620-bs-job-board vs aimani-gs-v2

---

## 結論

bs-job-boardは「Web SSR」「API/D1正本」「Flue Agent」を3 Workersに分け、Service Bindingでつなぐ叩き台として参考になる。aimani-gs-v2は「1 Worker（Hono + Flue同居）+ Web」に寄せる判断済みなので、3 Worker構成そのものより、境界設計・契約・CIガード・AI run状態管理を移植する。

## 1. bs-job-boardの全体像

- `apps/web`: TanStack Start SSR
- `apps/api`: Hono API兼D1 holder
- `apps/agent`: Flue Agent
- `packages/contracts`: 共有型
- `packages/db`: D1 migration + CRUD

データフロー: Web→APIで投稿 → API→AgentでAI依頼 → Agent→API callbackでAIレス保存 → Web→APIで取得

3 Worker分離の主効果:
- APIだけがD1を持つ
- AgentをAI処理専用に隔離
- WebからAPIをService Bindingでsame-origin proxy的に呼べる
- Agent `workers_dev:false`、Agent側D1禁止CIガード、API/Agent相互Service Binding

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

- `throw new Error` / `Error`継承class / `.rejects.toThrow` → V2ではResult型 + `_tag` union
- コード内ADR理由コメント多い → V2ではLinear ADR正本、コードはslug参照のみ
- `passWithNoTests` → テスト未配置でCIが通る余地 → V2では禁止
- Web/serverFnで `throw new Error` → UI境界でもResult的失敗表現
- CORS trusted originハードコード → 環境別config化
- `post_number` race condition → UNIQUE制約/採番方式再設計
- CDがCIほど整っていない → V2のDoDはD1適用→deploy→URL確認まで自動化

## 5. 1 Worker vs 3 Worker トレードオフ

| 観点 | 1 Worker (V2) | 3 Worker (bs) |
|---|---|---|
| 初期開発速度 | 速い | 遅い |
| Service Binding/CORS | 不要（同一Worker内） | 必要 |
| AI/DB境界 | コード規約+CIで守る | 実行時に強制分離 |
| セキュリティ/blast radius | 弱い | 強い |
| ローカル開発 | シンプル | 複雑 |

推奨: V2初期は1 backend Workerで進め、bsの分離思想を「モジュール境界+CIガード+contracts+Result」で再現。AI負荷や権限境界が固まった時点でAgent Worker分離へ戻せるよう、Flue/AI実行コードは分離しやすいディレクトリ配置にする。

## 6. ブラッシュアップ優先順位

### P0（即時対応）
1. AGENTS.md矛盾解消 ✅済
2. `packages/contracts` 追加: HTTP DTO、AI progress event、公開error code
3. `packages/domain` にPort interface + Result error union
4. D1 migration配置と `wrangler.jsonc` の `migrations_dir` 設定
5. CI追加: typecheck/build/test、throw禁止grep、domain I/O禁止grep
6. 最初の垂直スライスの仕様テスト追加

### P1（垂直スライス実装中に）
7. AI run状態機械、idempotency key、resultHash、SSE progress
8. Web→WorkerのService Binding/same-origin API fetch helper
9. body limit、strict payload validation
10. 認証 `x-user-id` 仮実装 + mutation fail-closed境界 + Better Auth差替えポイント

### P2（垂直スライス後）
11. Better Auth匿名/GitHubログイン
12. deploy workflow自動化
13. Agent分離への移行ADR
14. frontend e2e、AI workflow mock test、observability

## 参照元

- bs README
- `apps/api/src/index.ts`、`apps/api/src/routes/*`
- `apps/agent/src/workflows/generate-replies.ts`
- `apps/web/src/lib/api-fetch.ts`
- `.github/workflows/ci.yml`
