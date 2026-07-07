# Linear文書調査サマリ

調査日: 2026-07-07
調査方法: Linear API直叩き (GraphQL) + Linear MCP
対象: aimani-gs-v2 関連の全Linearドキュメント

---

## 調査対象ドキュメント一覧

| # | 文書名 | slug | 主な内容 |
|---|---|---|---|
| 1 | MAP（全体地図） | *(セッション内で取得)* | プロダクト全体の方向性と位置づけ |
| 2 | PLAN（実行計画） | *(セッション内で取得)* | フェーズ分けと優先順位 |
| 3 | SPEC-V2 | *(セッション内で取得)* | V2の機能仕様 |
| 4 | RDRA-V2 | *(セッション内で取得)* | 要件定義ドキュメント |
| 5 | ADR-V2-001〜008 | 各種slug | Architecture Decision Records |
| 6 | v3.1 ドメインモデル | *(セッション内で取得)* | users/members/chats モデル設計 |
| 7 | v3.1 認証境界 | *(セッション内で取得)* | 認証・認可の境界設計 |
| 8 | PHIL/GOAL | *(セッション内で取得)* | 哲学原則とゴール定義 |
| 9 | bad-catalog v3 | *(セッション内で取得)* | 異常系カタログ（BT-V01〜V40） |
| 10 | 協働プレイブック | `c8b77942a094` | Fable×Codex×人間の分業プロトコル |
| 11 | 蠱毒ループ | *(セッション内で取得)* | Stage 0-5 品質パイプライン |

## ADR一覧（確定済み）

| ADR | タイトル | slug | V2への影響 |
|---|---|---|---|
| V2-001 | V1を捨ててV2で作り直す | `1ab78f0eff7f` | V1凍結、V2新規開始 |
| V2-002 | 知識配置原則の採用 | `1f6578fe4e20` | How→Code, What→Tests, Why→ADR |
| V2-003 | Product Boundary | `3e045a22b67b` | AI壁打ち起点の人の発見と接続 |
| V2-006 | Effect-TS見送り | `a51a0c811b47` | Port&Adapter + Result型 + DI引数注入 |
| V2-008 | Phase廃止→垂直スライス | *(slug要確認)* | 認証/DB設計を前提にせず動くものを先に |

## PHIL/GOAL チェーン

### 哲学原則（V2でもそのまま適用）
- **PHIL-001**: 存在価値を安全に出せる場をつくる
- **PHIL-002**: 個人を犠牲にして組織を良くしない
- **PHIL-003**: *(セッション内で確認)*

### ゴール（V2で再定義）
- **GOAL-001〜006**: aimani本体のゴール → G's V2固有のG-V2-01〜06を追加予定

## v3.1設計のV2適用判断

| v3.1の設計 | V2での扱い | 理由 |
|---|---|---|
| person廃止 → users直結 | **採用** | G'sでもusers直結 |
| chat帰属排他(user_id XOR member_id) | **採用** | CHECK制約で保証 |
| member.user_id NULL化(退職=墓標化) | **不採用** | G'sは退場なし、全員active |
| RLS(app.current_user_id()) | **不採用（初期）** | D1にRLSなし → アプリ層ガード |
| テーブル名(chats/messages等) | **採用** | v3.1語彙を踏襲 |
| C層(org_reports→themes等) | **不採用** | G's V2にはない。代わりにCore Loop |
| bad-catalog IDチェーン | **V2用に再導出** | BT-V01〜V06(本人性)はほぼ流用可 |

## bad-catalog v3 → V2再導出

bad-catalog v3はpersonテーブル前提（v3スキーマ）で書かれている。
V2のusers/members/chatsモデルに合わせて再導出が必要。

再利用可能な部分:
- BT-V01〜V06（本人性保証）: ほぼそのまま
- PHIL→GOALチェーン: そのまま使える
- BF（ビジネスフロー）テスト: G's Core Loop用に再定義

## GitHub Issues状況

| # | タイトル | 状態 | 備考 |
|---|---|---|---|
| #1 | V1 close | CLOSED | V1凍結完了 |
| #4 | Turborepo+D1 skeleton | Open | **最初のタスク** |
| #2 | Port&Adapter+Result型 | Open | ADR-V2-006実装 |
| #3 | Flue Agent | Open | Flue統合 |
| #5-#11 | 各種 | Open | 一部ADR番号ズレあり（#10: V2-006をDB設計と誤記） |

**注意**: #5/#7/#10 にADR番号の誤りあり。特に#10は「ADR-V2-006=DB設計」と書かれているが、実際のV2-006はEffect-TS見送り。DB設計はV2-007。
