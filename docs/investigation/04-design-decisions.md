# 確定設計判断一覧

決定日: 2026-07-07
決定方法: セッション内壁打ち（まさかずさん判断）

---

## 判断ポイント1: AI壁打ちエンジン

**結論: Flue Framework**

選択肢:
- ~~Cloudflare Agents SDK (AIChatAgent)~~ — 壁打ちにはピッタリだがFlueの方がharness-drivenで表現力が高い
- **Flue Framework** ← 選択 — Astro team製、1.0 Beta、harness-driven Agent framework
- ~~Direct Hono + Anthropic API~~ — 最もシンプルだが永続化等を全て自前実装

判断根拠: まさかずさんがFlueの本格活用を希望。Beta段階だが「もっと良い使い方が見たいし知りたい」。

## 判断ポイント2: 退場/退職概念

**結論: 退場なし + Role分け必須**

- G'sコミュニティ = 1つのorganization
- 全員activeのまま、退場/退職フローなし
- v3.1の「退職=member.user_id NULL化=墓標化」は**不採用**
- 在校生/卒業生/チューター等をRoleで分類し、権限・見える範囲を制御

判断根拠: G'sでは卒業生も在校生も同じコミュニティで使い続ける想定。「ずっと使える」。

## 判断ポイント3: 最初の垂直スライス範囲

**結論: 壁打ち + 右パネル推薦まで（Core Loop骨格、1週間目標）**

Day 1: 空箱デプロイ（Turborepo + Hono + Flue + TanStack Start）
Day 2-3: D1スキーマ + 壁打ちAPI（Flue defineAgent + Claude API）
Day 4-5: フロントUI + 右パネル推薦スタブ
Day 6-7: 質問カード + 4択返答 + 統合テスト

認証はx-user-idヘッダー仮実装（ADR-V2-004で後から差替え）。

## 判断ポイント4: DB戦略

**結論: D1 + DI（Port & Adapter）→ PMF後にPostgres移行**

- D1（SQLite）でスタート — 初期コスト最小化
- DI（Port & Adapter）を入れて移行パス確保
- packages/domain = Port interface（DB非依存）
- packages/db = D1Adapter implements Port → 将来 PgAdapter
- DI切替ポイントはアプリ起動時の1箇所のみ

判断根拠: 「D1で今回活用するけど、DIを入れるようにして。うまく本番稼働してユーザーもついたらPostgresに移す」

## 判断ポイント5: モノレポ構成

**結論: 1 Worker（Hono + Flue同居）+ 1 Frontend**

Flue調査結果を反映し、apps/api + apps/agent の2 Worker構成を廃止。
Flueの公式パターンがHono同居（src/app.tsにflue() mount）のため、1 Workerに統合。

```
apps/
  worker/         # Hono + Flue 同居 (1 CF Worker)
  web/            # TanStack Start (SSR)
packages/
  domain/         # 純粋TS、I/O禁止、Port interface + Result型
  db/             # Drizzle + D1 Adapter → 将来 PgAdapter
  shared/         # Brand型、Role enum、共通型
```

DB 2層:
- D1 = ビジネスデータ（users/roles/cards等）→ Port&Adapter → 将来Postgres
- DO SQLite = Flue会話履歴（Flue自動管理、触らない）

## 共通制約（全判断に適用）

- Result型: `{ok:true;value}|{ok:false;error}` + `_tag` union（ADR-V2-006）
- DI: 引数注入 `deps: {repo, clock, idGen}`（ADR-V2-006）
- throw禁止（AGENTS.md L0-3）
- Effect-TS不使用（ADR-V2-006で明示的に見送り済み）
- テスト名は仕様書（AGENTS.md L0-2）
- ADRはLinear正本（AGENTS.md L0-5）
