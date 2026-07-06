# アイマニAI for G's V2

> 「言語化 → 本人意思で外に出す → 受け手に届く」のC面縦串を、設計から作り直す

## V1（gs-20260630-aimani-gs）からの変更点

- **設計優先**: ADR/SPECを先に書き、チケット駆動で1枚ずつ実装
- **技術基盤**: Effect-TS（throw撲滅・Layer DI）/ Flue Agent / CQRS
- **知識配置**: How→コード、What→テスト、Why/Why not→ADR（Linear）
- **蠱毒ループ**: Job Contract → Claude/Codex協業 → レビュー → DoD

## 技術スタック

- TypeScript / Hono / Cloudflare Workers / D1
- TanStack Start（SSR）
- Effect-TS（packages/domain）
- Flue（Agent Worker）
- Turborepo

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
