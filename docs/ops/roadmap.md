# aimani G's V2 全体計画（2026-07-08版）

> 「UIがダメ・体験が程遠い」の答え: **今はPhase 1（配管工事）が終わった直後**。
> デザインと「人につなげる」体験はPhase 2/3で、まだ着手していない。
> つまり「途中だから」が正解。ただし何がいつ来るかを以下で固定する。

## 現在地

```
Phase 0 ✅ ──── Phase 1 ✅(95%) ──── Phase 2 ⬅今ここから ──── Phase 3 ──── Phase 4
基盤・空箱      壁打ち配管           見た目と対話の質       人につなげる    外に出す
```

## Phase 1: 壁打ち垂直スライス（✅ 95%）

**できたこと**: チャット→Flue workflow→さくらAI→応答（実測3〜10秒）/ 認証(better-auth)
/ 履歴一覧 / 進捗表示 / セキュリティ・信頼性のレビュー指摘40件超を消化 / テスト34本 / CI

**残り**:
- GitHub OAuth App作成（★人間・5分）→ secrets投入 → devバイパス削除
- message+aiRun作成の原子性（Port設計の裁定要）
- Idempotency-Key（二重送信の完全排除）
- rate_limits: flue buildがwrangler設定から落とす問題の恒久対応（暫定: コードは欠落耐性済み）

**Phase 1の限界（＝今「ダメ」に見える理由）**:
デザイン投資ゼロ（素のCSS）。AIは質問を返すだけで、会話が構造化されない。人が出てこない。

## Phase 2: 見た目と対話の質（次の1〜2営業日）

「デモを人に見せて恥ずかしくない」レベルにする。

| # | 項目 | 中身 | 判断待ち |
|---|---|---|---|
| 2-1 | UIデザイン刷新 | v1（gs-20260630）のデザイン言語を移植: chat-mainグリッド/入力ドック/配色/タイポ。codex-08で資産特定済み | **v1のデザインをベースにしてよいか？別の参照があるか？** |
| 2-2 | サイドバー | 履歴常設（v1 Sidebar移植）。「一覧へ戻る」暫定UIを置き換え | — |
| 2-3 | AI応答の構造化 | 「引用+返答」形式（v1 ChatMessage）+ QuestionSheet（1問ずつ選択肢+自由入力） | **AI出力のJSONスキーマ設計を壁打ちで確定** |
| 2-4 | 進捗のリアルタイム化 | ai_run_events polling→トークンストリーミング検討（Flue次第） | — |

## Phase 3: 人につなげる（本丸・Product Boundary）

codex-15の指摘どおり「壁打ちして終わり」では価値の芯がない。

| # | 項目 | 中身 | 判断待ち |
|---|---|---|---|
| 3-1 | profile/skills整備 | member編集UI + skills入力（推薦の材料） | — |
| 3-2 | 推薦の種の抽出 | 壁打ち会話からタグ/困りごとをAIで構造化保存（recommendation stage） | **推薦ロジックの説明可能性の要求水準** |
| 3-3 | 右パネル推薦 | 「この人に聞けるかも」表示（findBySkills起点の説明可能なstub→AI強化） | — |

## Phase 4: 外に出す

| # | 項目 | 判断待ち |
|---|---|---|
| 4-1 | SharedReport（本人意思での共有・範囲選択） | **共有ポリシー（アイマニ設計原則との整合）** |
| 4-2 | role制御（teacher/mentor側の受け口） | **role昇格フロー** |

## セキュリティ留保（マージ前に裁定）

- ADV-010/MIH-004のmigration再構築 — **本番D1にmigration適用する前が最後の楽なタイミング**
- 本番のDEV_AUTH_BYPASS_USER_IDはOAuth App設定後に必ず削除
- in-flight 409のDB invariant化（部分UNIQUE index）

## 人間にしかできないこと（優先順）

1. `bash scripts/deploy-preview.sh` 実行（2分）→ 実URLで見られるようになる
2. GitHub OAuth App作成（5分）: Settings→Developer settings→OAuth Apps→New
   - Homepage: `https://aimani-gs-v2-web.masa-nekoshinshi39.workers.dev`
   - Callback: `https://aimani-gs-v2-web.masa-nekoshinshi39.workers.dev/api/auth/callback/github`
3. Phase 2-1のデザイン方向の承認（v1ベースか否か）
4. PR #12マージ判断（ADV-010裁定後）
