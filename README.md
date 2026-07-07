# アイマニAI for G's V2

> 「言語化 → 本人意思で外に出す → 受け手に届く」のC面縦串を、設計から作り直す

## V1（gs-20260630-aimani-gs）からの変更点

- **設計優先**: ADR/SPECを先に書き、チケット駆動で1枚ずつ実装
- **技術基盤**: Port & Adapter + Result型（throw撲滅・DIは引数注入で予約）/ Flue Agent / CQRS-lite
- **知識配置**: How→コード、What→テスト、Why/Why not→ADR（Linear）
- **蠱毒ループ**: Job Contract → Claude/Codex協業 → レビュー → DoD

## 技術スタック

- TypeScript / Hono / Cloudflare Workers / D1
- TanStack Start（SSR）
- Port & Adapter + Result型（packages/domain、I/O禁止・Effect-TSは見送り＝ADR-V2-006）
- Flue 1.0-beta（Hono + Flue同居構成、apps/worker内）
- Turborepo

## モノレポ構成

```
apps/
  worker/         # Hono + Flue 同居 (1 CF Worker) — API + AI壁打ちAgent
  web/            # TanStack Start (SSR) — フロントエンド
packages/
  domain/         # 純粋TS、I/O禁止、Port interface + Result型
  db/             # Drizzle + D1 Adapter → 将来 PgAdapter
  shared/         # Brand型、Role enum、共通型
  config/         # tsconfig.base.json
```

## 本番URL

- Worker API: https://aimani-gs-v2.masa-nekoshinshi39.workers.dev/
- Web: https://aimani-gs-v2-web.masa-nekoshinshi39.workers.dev/

## 正本の場所

| 知識 | 場所 | 理由 |
|---|---|---|
| How（どう動くか） | コード | 変更すれば自動更新 |
| What（何をすべきか） | テストコード | CIが嘘を許さない |
| Why / Why not | Linear ADR | イミュータブル。supersede方式 |
| Issue / タスク | GitHub Issues | コードと近い場所に |

## 関連リポ・正本

- V1（凍結）: [gs-20260630-aimani-gs](https://github.com/MAA39/gs-20260630-aimani-gs)
- 本体設計: [aimani-v31](https://github.com/MAA39/aimani-v31)（private）
- 実験プロトコル: Linear slug `8eebc54bf6bb`
- V1→V2判断: Linear ADR slug（後述）

## ADR（Linear正本）

| # | タイトル | slug |
|---|---|---|
| V2-001 | V1を捨ててV2で作り直す | `1ab78f0eff7f` |
| V2-002 | 知識配置原則の採用 | `1f6578fe4e20` |
| V2-003 | Product Boundary（AI壁打ち起点の人の発見と接続） | `3e045a22b67b` |
| V2-006 | Effect-TS見送り（Port & Adapter + Result型） | `a51a0c811b47` |
