# AGENTS.md — V2 ガードレール

> このファイルはClaude Code / Codex が最初に読む。人間も読む。

## L0: 絶対ルール

1. **main直コミット禁止**。feature/NN-名前 → PR → レビュー → マージ
2. **テスト名は仕様書**。`it("退職済みメンバーの面談開始は403を返す")` の粒度で書く
3. **throwしない**。Effect.fail + catchTags網羅。throw new Errorを見たらバグ
4. **型で守れるものはテストで守らない**。Brand型 > バリデーション > テスト
5. **ADRはLinearの正本**。コード内コメントにWhyを書かない（ADR slugを参照）
6. **命名は意図が伝わるものに**。data→payload, result→response, run→execute_xxx
7. **D1マイグレーションは直列**。並行ジョブでの番号衝突を防ぐ
8. **デプロイはDoDの一部**。マージ≠完了。D1適用→deploy→URL確認まで
9. **仕様の穴を見つけたらPRコメントに `SpecGap:` プレフィクス**で残す

## 知識配置

- How → このコード自体（Self-Documenting Code）
- What → テストコード（テスト名が仕様書）
- Why / Why not → Linear ADR（コード内に書かない。slug参照のみ）
- タスク → GitHub Issues

## 技術制約

- Effect-TSのLayerはpackages/domain内のみ。apps/apiでは使わない
- Flue Agentの設定はapps/agent/に閉じる
- D1マイグレーションはpackages/db/migrations/に置く
- wrangler.jsoncのmigrations_dirは必ず設定する（V1での学び）
