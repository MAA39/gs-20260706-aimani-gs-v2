# 調査結果（2026-07-07 初回セッション）

V2プロジェクト開始時の技術調査・Linear文書調査の原文保存ディレクトリ。
amidala-refactoring の `docs/codex/` と同じ運用: **編集禁止、原文保存が目的**。

## ファイル一覧

| # | ファイル | 内容 | 調査方法 |
|---|---|---|---|
| 01 | [01-flue-framework.md](01-flue-framework.md) | Flue Framework 公式ドキュメント徹底調査 | Codex (codex-rescue) |
| 02 | [02-d1-drizzle-port-adapter.md](02-d1-drizzle-port-adapter.md) | D1 + Drizzle + Port&Adapter 実装パターン | 手動調査 + amidala知見 |
| 03 | [03-linear-documents-summary.md](03-linear-documents-summary.md) | Linear文書9本の調査サマリ | Linear API直叩き |
| 04 | [04-design-decisions.md](04-design-decisions.md) | 確定設計判断一覧（壁打ち結果） | セッション内壁打ち |

## 運用ルール

- 今後の調査出力は `docs/investigation/NN-<slug>.md` で保存
- ここのファイルは**編集禁止**（原文保存）
- 設計判断・ADRはLinearが正本（コード内にWhyを書かない）
