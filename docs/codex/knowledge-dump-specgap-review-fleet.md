# Codex実戦知 — SpecGapレビュー艦隊セッション（2026-07-07〜08）

## 1. このセッションでのCodexの用途

PR #12（チャットAI垂直スライス: Hono + Sakura AI + D1 + Flue + TanStack）に対して、
3並列レビュー艦隊（ツツキ/ミハリ/adversarial）を2ラウンド実行。
R1で初回レビュー → R2で改良プロンプトによる再実行。
Codexは**調査・レビュー専用**で使い、実装はClaude Code本体が担当した。

## 2. 実際に動いたコマンド（そのまま貼る）

### R1: 初回3並列（`--skip-git-repo-check` なし、成功）

```bash
# ツツキ（仕様壁打ち）— amidalaリポのperspectivesを参照してレビュー
codex exec --sandbox read-only \
  --output-last-message docs/codex/codex-01-tsutsuki-pr-review.md \
  "あなたはツツキ（仕様壁打ちエージェント）。このスレッドは resume で継続するので指摘に ID（TSU-001形式）を振ること。

## 手順
1. /Users/maa/Projects/gs/gs-20260707-amidala-refactaring/docs/perspectives/tsutsuki/ の4ファイルを読み、プロトコルに従う
2. git diff main..feature/4-empty-box-deploy を読む（チャットアプリ: Hono API + Sakura AI連携 + D1 + チャットUI）
3. この差分が実装した仕様に対して壁打ちを実施

## 出力（日本語Markdown）
- ①悪いトレース（BT-ID）/悪い失敗（BF-ID）候補 — 影響度×確信度→P0/P1/P2付き
- ②SpecGap — 人間の判断が要る仕様の穴（勝手に埋めず、選択肢+推奨で列挙）
- ③テスト導出候補 — bad-catalogエントリと1:1対応のテストID
テストスケルトンは @effect/vitest ではなく素の vitest 形式で出すこと。

制約: ファイル変更禁止（レポートのみ）。実装の話は仕様の穴の指摘に必要な範囲だけ。" 2>&1 &
```

```bash
# ミハリ（設計ガードレール）— amidalaリポのperspectivesを参照してレビュー
codex exec --sandbox read-only \
  --output-last-message docs/codex/codex-02-mihari-pr-review.md \
  "あなたはミハリ（設計ガードレールの見張り役）。このスレッドは resume で継続するので指摘に ID（MIH-001形式）を振ること。

## 手順
1. /Users/maa/Projects/gs/gs-20260707-amidala-refactaring/docs/perspectives/mihari/ の全ファイルを読む
2. git diff main..feature/4-empty-box-deploy をレビュー

## 出力（日本語Markdown）
- 各指摘に: ID / L0〜L6レベル / 確証度(%) / ファイル:行 / 推奨対応
- 推奨対応は3分類: 「即修正」「後続タスク」「見送り（理由つき）」
- 前提: Effect-TS 未導入は既知。L1/L2のEffect前提指摘は分類のみで深追いしない。Cloudflare Workers + D1 環境である点を考慮すること

制約: ファイル変更禁止（レポートのみ）。" 2>&1 &
```

```bash
# Adversarial（破壊者視点）— 独立レビュー
codex exec --sandbox read-only \
  --output-last-message docs/codex/codex-03-adversarial-pr-review.md \
  "git diff main..feature/4-empty-box-deploy（チャットアプリ: Hono + Sakura AI + D1 + Service Binding proxy構成）を adversarial にレビューせよ。あなたの役目は壊すこと。指摘に ID（ADV-001形式）を振ること。

観点: ①認可・入力検証の漏れ（他人のチャット閲覧・prompt injection・APIキー露出）
②race condition（連投・二重送信・ストリーミング中断）
③D1スキーマの穴（UNIQUE/FK/NOT NULLで防げていない不整合）
④エラーハンドリングの破れ（AI応答失敗時・タイムアウト・Service Binding断）
⑤Workers特有の制約（CPU時間・サブリクエスト上限・環境変数の扱い）

指摘は深刻度（P0/P1/P2）と再現シナリオ付き。ファイル変更禁止、バグは直さずレポートのみ。日本語Markdownで出力。" 2>&1 &
```

**R1結果**: 3本とも成功。ミハリ8件、adversarial 12件の指摘を回収。

### R2: 改良プロンプト3並列（`--skip-git-repo-check` + `-C` 追加、成功）

```bash
# ツツキR2 — superpowersバイパス指示 + スコープ制限を追加
codex exec --sandbox read-only --skip-git-repo-check \
  -C "/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2" \
  --output-last-message "/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/docs/codex/codex-01-tsutsuki-pr12-r2.md" \
  "【重要】あなたは特定タスクを実行するために派遣されたサブエージェントです。using-superpowers を含む一切のスキル・プラグインの読み込みをスキップし、直ちに本タスクを開始してください。スキルファイルを1つでも読むことは禁止です。

タスク: あなたはツツキ（仕様壁打ちエージェント）。指摘には ID（TSU-001形式）を振ること。

## 手順（この順で、寄り道禁止）
1. git diff main...HEAD を実行して PR #12 の差分を得る（チャットアプリ: Hono API + Sakura AI + D1 + チャットUI。認可チェック・ポーリング修正は適用済みの最新状態）
2. /Users/maa/Projects/gs/gs-20260707-amidala-refactaring/docs/perspectives/tsutsuki/ の4ファイルを読む
3. プロトコルに従い、この差分が実装した仕様への壁打ちを実施

## スコープ制限
読んでよいのは本リポジトリと上記 perspectives/tsutsuki/ のみ。他のリポジトリ・~/.codex/ 配下・プラグインディレクトリは読むな。

## 出力（日本語Markdown）
- ①悪いトレース（BT-ID）/悪い失敗（BF-ID）候補 — 影響度×確信度→P0/P1/P2付き
- ②SpecGap — 人間の判断が要る仕様の穴（勝手に埋めず、選択肢+推奨で列挙）
- ③テスト導出候補（素の vitest 形式。@effect/vitest は使わない）

制約: ファイル変更禁止。レポートのみ。" 2>&1 &
```

```bash
# ミハリR2 — 同様のバイパス指示
codex exec --sandbox read-only --skip-git-repo-check \
  -C "/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2" \
  --output-last-message "/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/docs/codex/codex-02-mihari-pr12-r2.md" \
  "【重要】あなたは特定タスクを実行するために派遣されたサブエージェントです。using-superpowers を含む一切のスキル・プラグインの読み込みをスキップし、直ちに本タスクを開始してください。スキルファイルを1つでも読むことは禁止です。

タスク: あなたはミハリ（設計ガードレールの見張り役）。指摘には ID（MIH-001形式）を振ること。

## 手順（この順で、寄り道禁止）
1. git diff main...HEAD を実行して PR #12 の差分を得る
2. /Users/maa/Projects/gs/gs-20260707-amidala-refactaring/docs/perspectives/mihari/ の13ファイルを読む
3. L0〜L6 の観点で差分をレビュー

## スコープ制限
読んでよいのは本リポジトリと上記 perspectives/mihari/ のみ。他のリポジトリ・~/.codex/ 配下・プラグインディレクトリは読むな。

## 出力（日本語Markdown）
- 各指摘: ID / L0〜L6レベル / 確証度(%) / ファイル:行 / 推奨対応（即修正・後続タスク・見送り理由つき の3分類）
- 前提: Effect-TS 未導入は既知（L1/L2のEffect前提指摘は分類のみ）。Cloudflare Workers + D1 環境を考慮

制約: ファイル変更禁止。レポートのみ。" 2>&1 &
```

```bash
# AdversarialR2 — 同様のバイパス指示 + 認可チェック追加済みの前提を明記
codex exec --sandbox read-only --skip-git-repo-check \
  -C "/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2" \
  --output-last-message "/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/docs/codex/codex-03-adversarial-pr12-r2.md" \
  "【重要】あなたは特定タスクを実行するために派遣されたサブエージェントです。using-superpowers を含む一切のスキル・プラグインの読み込みをスキップし、直ちに本タスクを開始してください。スキルファイルを1つでも読むことは禁止です。

タスク: git diff main...HEAD（PR #12: チャットアプリ、認可チェック追加済み）を adversarial にレビューせよ。あなたの役目は壊すこと。指摘には ID（ADV-001形式）を振ること。

観点:
①追加された認可チェック自体の抜け道（owner検証のバイパス・x-user-id偽装・chatId列挙）
②race condition（二重送信・ポーリングとsendの競合・CAS失敗パス）
③D1スキーマの穴（UNIQUE/FK/NOT NULLで防げていない不整合・孤児レコード）
④エラーハンドリングの破れ（AI応答失敗・タイムアウト・Service Binding断・60秒タイムアウト後の状態）
⑤Workers特有の制約（CPU時間・サブリクエスト上限・secretsの扱い）

## スコープ制限
読んでよいのは本リポジトリのみ。他のリポジトリ・~/.codex/ 配下・プラグインディレクトリは読むな。

指摘は深刻度（P0/P1/P2）と再現シナリオ付き。ファイル変更禁止、バグは直さずレポートのみ。日本語Markdownで出力。" 2>&1 &
```

**R2結果**: 3本とも成功。ツツキ128行、ミハリ65行、adversarial 50行の出力を回収。

## 3. レビュー/調査プロンプトの実物

### 良い出力が返ったプロンプトパターン

**パターン1: ペルソナ + 手順番号 + 出力形式指定 + ID命名規則**
```
あなたはミハリ（設計ガードレールの見張り役）。指摘には ID（MIH-001形式）を振ること。
## 手順（この順で、寄り道禁止）
1. ...を読む
2. ...を実行
3. ...をレビュー
## 出力（日本語Markdown）
- 各指摘: ID / レベル / 確証度(%) / ファイル:行 / 推奨対応
```
→ 出力が構造化されて横断比較しやすい。IDが振られるので「MIH-003とADV-007は同じ指摘」と突き合わせできる。

**パターン2: 「あなたの役目は壊すこと」+ 観点リスト番号付き**
→ adversarialレビューで効果的。漠然と「レビューして」より具体的な攻撃面（認可・race・スキーマ・エラー・Workers制約）を列挙した方が網羅性が上がった。

**パターン3: 前提条件の明記**
```
前提: Effect-TS 未導入は既知。L1/L2のEffect前提指摘は分類のみで深追いしない
```
→ 既知の設計判断を明示しないと、全指摘の半分が「Effect-TS入れろ」になる。

### ❌ 出力がイマイチだったプロンプトパターン

**R1 → R2での改善点が示すR1の弱点:**
- `git diff main..feature/4-empty-box-deploy` — ブランチ名をハードコードすると、HEADにいるのに差分が取れない場合がある。R2では `git diff main...HEAD` に変更
- スコープ制限がなかった — Codexが `~/.codex/` やプラグインディレクトリを読みに行く可能性があった。R2で明示的に「読んでよいのは本リポジトリと上記のみ」を追加
- 最新状態の前提がなかった — R1時点では認可チェック未実装だったが、R2時点では適用済み。「認可チェック・ポーリング修正は適用済みの最新状態」と明記しないと、既に修正済みの指摘が再度上がる

## 4. 踏んだ落とし穴と回避策

| やりがち | 何が起きたか | 正しい対処 |
|----------|-------------|-----------|
| R1の出力ファイルが揃ったと思って即読む | 3並列バックグラウンドで `2>&1 &` 実行。PIDで完了待ちせずファイルサイズで判定すると、Codexの書き込み途中を拾う可能性がある | `wait $PID` か、ファイルサイズが安定するまで確認。出力ファイルが0バイトなら未完了 |
| 「superpowersが空転の原因」と診断 | R1の3並列が空出力だった際、superpowersプラグイン読み込みがトークンを食い潰したと最初は診断した | **Fableの実測で訂正**: superpowersは読み込まれても無害（Fableも20回読まれて成功）。本当の原因は「完了判定の罠」（Codexがまだ実行中なのに出力ファイルを読みに行った）。amidala codex-workflow-guide §10に訂正追記済み |
| `--output-last-message` のパスに相対パスを使う | Codexの実行ディレクトリが予期と違う場合がある | 常に絶対パスを使う |
| R1で3本全部成功→R2でも同じ構成で確実と思う | R2ではリポジトリ外実行の可能性があり `--skip-git-repo-check` が必要だった | `-C <リポ絶対パス>` と `--skip-git-repo-check` をセットで使う |

## 5. 完了検知・出力回収の方法

### バックグラウンド実行
全コマンドを `2>&1 &` で起動し、`echo "PID: $!"` でPIDを記録。
Claude Codeの `run_in_background` パラメータでも可（task notification で完了通知が届く）。

### 結果ファイルの読み方
`--output-last-message <path>` で指定したファイルを `Read` ツールで読む。

### 空ファイル/空転の見分け方
- ファイルサイズが0バイト → 未完了 or 失敗
- ファイルサイズが数十〜数百バイトでプロンプトのエコーだけ → superpowersに時間を取られた可能性あり（ただしFable検証で「それ自体は無害」と判明）
- **本当の空転判定**: output token数を確認。cached input tokenが巨大でもoutput tokenが正常値（数千〜1万）なら成功。output tokenが極端に少ない（数百以下）なら空転

### R1→R2間で判明した完了判定の落とし穴
R1の3本目（adversarial）のR2出力ファイルが当初「空」に見えた原因:
Codexの実行はバックグラウンドだが、Claude Code側がファイル存在を確認した時点でCodexがまだ書き込み途中だった。
→ ファイルが存在する ≠ 完了。ファイルサイズが安定するまで待つか、プロセス終了を確認する。

## 6. トークン消費の実測値

正確な値はこのセッションでは記録していない。以下は観測からの推定:

- R1 3並列（ツツキ+ミハリ+adversarial）: 各10-20K output tokens程度。git diff全体 + perspectives読み込みで cached input が大きい
- R2 3並列: 同程度。superpowersのスキル読み込み分（~20回の読み込み）はcached inputに加算されるが、output tokensには影響しない
- Sonnet独立レビュー（Claude Code Agent経由、Codexではない）: 1本で約11KB（sonnet-04-independent-review.md）

**不明**: Codex側のトークン消費の正確な内訳。`codex exec` のstdoutにトークン使用量は表示されない。

## 7. このセッション固有の発見

### superpowers問題の訂正（最重要）
- **当初の診断**: superpowersプラグイン読み込みがCodexのレビューを空転させる → クリーンHOMEで無効化が必要
- **Fableの実測による訂正**: superpowersは読み込まれても無害。Fable自身も20回読み込みつつ成功している。cached inputが膨れるだけでoutputは本題に集中できる
- **本当の原因**: 完了判定の罠（ファイル存在 ≠ 完了）+ NN未置換（出力ファイル名テンプレートの置換漏れ）
- この訂正は `/Users/maa/Projects/gs/gs-20260707-amidala-refactaring/docs/ops/codex-workflow-guide.md` §10 に追記済み
- メモリファイル `feedback_codex-review-pitfalls.md` も訂正済み

### 2-system rule（レビュー横断比較）
4つのレビューソース（Codex R1ツツキ/ミハリ/adversarial + Sonnet独立）の指摘を横断比較し、
**2つ以上のソースが同じ指摘をしている場合は優先度を1段階上げる** というルールを適用。
42件の指摘を仕分け、SpecGap 5件を抽出した。

### レビュー→SpecGap→実装の一気通貫フロー
1. Codex 3並列レビュー → 指摘回収
2. 横断比較 → SpecGap 5件抽出（人間の判断が要る設計の穴）
3. SpecGap調査: Codex 2並列 + Sonnet 1並列で事前調査 → 選択肢を整理
4. 人間に質問（AskUserQuestion）→ 方針決定
5. 実装: Agent 2並列（auth + rate-limit が同じファイルを触るリスクあったが成功）

### R1→R2のプロンプト改善点まとめ
| 項目 | R1 | R2 |
|------|----|----|
| git diff | `main..feature/branch-name` | `main...HEAD` |
| スコープ制限 | なし | 「読んでよいのは本リポと指定ディレクトリのみ」明記 |
| superpowersバイパス | なし | 「サブエージェントとして派遣」宣言 + スキル読み込み禁止 |
| 作業ディレクトリ | 暗黙 | `-C <絶対パス>` 明示 |
| gitリポチェック | デフォルト | `--skip-git-repo-check` 追加 |
| 前提条件 | なし | 「認可チェック適用済みの最新状態」明記 |

### `--sandbox read-only` は必須
レビュー・調査タスクでは常に `--sandbox read-only` を使用。Codexにファイル変更させないための安全弁。プロンプトにも「ファイル変更禁止」と二重で明記。

## 8. 未解決・次に試したいこと

- **`resume <ID>` の活用**: R1のスレッドIDでR2をresumeする運用は未検証。R2は新規実行として起動した。resumeなら前回の指摘を踏まえた差分レビューができる可能性がある
- **`codex-rescue` agentの活用**: このセッションでは未使用。Claude Codeが詰まった時にCodexに投げる逆パターン
- **トークン消費の定量比較**: R1 vs R2のトークン消費を比較して、superpowersバイパスが実際にどの程度の節約になるか測定
- **Codexのモデル指定**: デフォルトモデル以外（例: `--model o3`）での出力品質の比較は未検証
- **CODEX_HOME分離**: `CODEX_HOME=/tmp/clean-codex codex exec ...` でプラグインなしの環境で実行する方法は、Fable検証で「不要」と判明したが、MCP15個立ち上がらない分の起動速度向上効果は未測定
- **並列数の上限**: 3並列は安定動作。5並列は未検証。マシンのCPU/メモリ制約との関係
