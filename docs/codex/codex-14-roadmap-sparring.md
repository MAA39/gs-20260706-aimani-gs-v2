前提: 読み取りのみ。ファイル変更・テスト実行はしていません。夜間レポートでは未実装扱いだった `GET /api/chats` は、現コードでは既に実装済みです。

## 進捗マップ

| 機能 | 仕様上の要求 | 現状 | 残作業 |
|---|---|---|---|
| 基盤 | Hono + Flue 同居 Worker、TanStack Start、D1、Service Binding | ほぼ完了。Worker/Web/D1/Flue DO/Service Binding は設定済み | 本番D1 migration適用、deploy、URL確認は人間作業後 |
| Result / Port & Adapter | domainは純粋TS、Result型、throw禁止、DI引数注入 | 実装済み。`throw` は apps/packages 内で検出なし | DB row→domain の enum/JSON parse 強化は残る |
| 認証・本人性 | GitHub OAuth、users直結、memberは全員active、roleで分類 | Better Auth導入済み。session user idで member 自動作成、roleはstudent固定 | GitHub OAuth設定待ち。role昇格・可視範囲は未設計 |
| メンバー管理 | profile/skills/canHelp/wantsHelp を保持し推薦に使う | members schema、create/get、findByRole/findBySkills は実装済み | profile更新UI/API、推薦での実利用、role管理 |
| チャット開始/送信 | 壁打ちAPI、本人所有チャットのみ操作 | `POST /api/chats`、`POST /api/chats/:id/messages` 実装済み | message作成とaiRun作成がPort跨ぎで非トランザクション |
| チャット履歴 | 履歴取得、一覧、継続利用 | `GET /api/chats`、`GET /api/chats/:id/messages`、Webの簡易履歴表示まで実装済み | 常時サイドバー、検索/フィルタ、アーカイブ導線 |
| AI壁打ち | Flue Agentで短い初手、リフレクション、コードを書かない | Sakura AI + Flue workflow 実装済み。CAS、履歴snapshot、timeout、失敗system messageあり | 構造化出力、repair、推薦の種の保存は未実装 |
| ai_run進捗 | queued/generating/completed/failed をUIに出す | `ai_run_events` schema、repo `listEventsAfter`、event追記、contract型あり | HTTP polling API、Webの進捗文言、token event/SSE |
| 推薦 / 右パネル | 壁打ちから「この人に聞けるかも」へ接続 | enum `recommendation`、member検索Port、プロンプト文言のみ | 推薦stageのuse case、API、右パネルUI、推薦根拠 |
| QuestionSheet / 4択 | Day6-7想定の質問カード + 4択返答 | 未実装。v1資産は仕様未確定で不採用 | AI構造化出力仕様、contract、UI、テスト |
| 共有/受け手に届く | 本人意思で外に出す、SharedReport的な導線 | privacy文言のみ | SharedReport domain、共有範囲、受け手通知/閲覧 |
| 信頼性 | 重複送信、並行送信、境界parse、rate limit | parse、body limit、rate limit、1 chat 1 in-flight は実装済み | Idempotency-Key、route/integration test、unknown key拒否方針 |

## 優先候補

| 優先 | 候補 | 価値 | コスト | OAuth依存 | 理由 |
|---:|---|---|---|---|---|
| 1 | ai_run進捗polling API + UI進捗文言 | 高 | 低〜中 | なし | schema/repo/contractが既にあり、`考え中...` から一段進められる |
| 2 | recommendation stage 最小実装 + 右パネルstub | 高 | 中 | なし | Product Boundaryの核心。「壁打ち」から「人につなげる」に初めて到達する |
| 3 | message + aiRun 作成の原子性確保 | 高 | 中〜高 | なし | 現状はhuman messageだけ残る失敗があり、公開前に潰す価値が高い |
| 4 | Idempotency-Key | 高 | 中 | なし | D1 unique制約は準備済み。再送・二重クリック耐性が上がる |
| 5 | 履歴UIの完成 | 中〜高 | 低〜中 | なし | APIと簡易UIは済み。サイドバー化で継続利用が自然になる |
| 6 | アーカイブ機能 | 中 | 低 | なし | schema/status/送信拒否は済み。route + UI追加で完結しやすい |
| 7 | profile編集 + skills整備 | 中〜高 | 中 | なし | 推薦品質の入力データを作る。推薦stubと相性が良い |
| 8 | QuestionSheet / 4択 | 中 | 高 | なし | 価値はあるがAI構造化出力仕様が先に必要 |
| 9 | SharedReport / 共有範囲 | 高 | 高 | なし | 重要だが、推薦・共有ポリシー未確定のため後段が妥当 |

## 推奨する次の3手

1. **ai_run進捗pollingを先に出す**  
   `listEventsAfter` と `ai_run_events` が既にあるので、少ない追加でUXとデバッグ性が上がる。HTTP endpoint、contract変換、Webの進捗文言までを1本の縦スライスにするのがよいです。

2. **右パネル推薦stubを作る**  
   Linear仕様の本丸は「AI壁打ち起点の人の発見と接続」。まずは `findBySkills` / `findByRole` を使った説明可能なstubでよく、AI抽出やランキングは後続に回すのが現実的です。

3. **公開前の信頼性として message+aiRun 原子性を潰す**  
   Idempotency-Keyより先に、現在の「human messageだけ残る」穴を閉じたいです。Port設計を決めてD1 batch専用メソッドか統合use case repositoryに寄せ、その後にIdempotency-Keyを載せる順が安全です。