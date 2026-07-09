# v1フロント資産の採用判断（2026-07-08夜間）

調査: docs/codex/codex-08-v1-frontend-assets.md（v1 = gs-20260630-aimani-gs をCodexで調査）

## 採用（実装済み）

| v1資産 | 判断理由 | v2実装箇所 |
|---|---|---|
| Enter送信 / Shift+Enter改行 / IME変換確定保護 | 日本語チャットの必須UX。`isComposing`保護が特に重要 | apps/web/src/routes/chat.tsx `handleKeyDown` |
| textarea入力（rows=2） | 複数行の相談文が主用途。input type=textでは書きにくい | 同上 |
| 空状態の主問いかけ「何に困っていますか？」 | v1で検証済みの開始コピー | 同上 empty state |
| カテゴリ開始ボタン4種（課題/チーム開発/進路/面談準備） | 白紙不安の解消。クリック1回で壁打ち開始できる導線 | 同上 starterButtons |
| プライバシー文言「あなたが出すまで誰にも見えません」 | アイマニ設計原則（PR永久private）の明文化。信頼の入口 | 同上 privacyNote |
| placeholder「困っていることを書いてください...」/「送る」 | v1の実文言。敷居が低い | 同上 |

## 不採用（今夜のスコープ外、理由つき）

| v1資産 | 理由 |
|---|---|
| サイドバー（チャット履歴一覧） | v2に`GET /api/chats`（一覧API）が未実装。API追加とセットで別タスク |
| QuestionSheet（1問ずつ選択肢UI） | AI応答が構造化JSON（quote_span/質問配列）を返すv1形式に依存。v2のAI出力仕様が未確定 |
| 整理する/FinishModal（共有範囲選択） | SharedReportドメインがv2未実装。垂直スライスの次段階 |
| AI応答の「引用+返答」表示（quote_label） | 同上、AI出力の構造化が前提 |
| 進捗文言（接続中/材料整理中/形式を整えています） | ai_run_events polling APIがv2未実装。現状は「考え中...」で代替 |
| 開発者がDBを見られる旨の注意書き | 文意は重要だが人物名を含みv1固有。文言再設計して後日 |
