現物基準。テスト実行はしていない。読み取り指定なのでファイル変更もしていない。

**(1) ズレ表**

| 項目 | 仕様の根拠 | 現状 | ズレ種別 |
|---|---|---|---|
| 右パネル推薦 | [04-design-decisions.md](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/docs/investigation/04-design-decisions.md:32):「壁打ち + 右パネル推薦まで」 | UI/API/domain に推薦表示なし。`AiRunStage.RECOMMENDATION` と `findBySkills` は足場だけ | やらなさすぎ |
| 質問カード + 4択返答 | [04-design-decisions.md](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/docs/investigation/04-design-decisions.md:37) | あるのは開始カテゴリボタンだけ。質問カード/4択のDB・契約・UIなし | やらなさすぎ |
| 「人の発見と接続」 | [03-linear-documents-summary.md](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/docs/investigation/03-linear-documents-summary.md:35): ADR-V2-003 | AIは会話するだけ。推薦の種を抽出・保存・人に接続する処理なし | やらなさすぎ |
| Roleで権限・見える範囲制御 | [04-design-decisions.md](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/docs/investigation/04-design-decisions.md:23) | `role` enum と student 固定作成のみ。権限判定・昇格・可視範囲制御なし | やらなさすぎ |
| chat帰属排他 user_id XOR member_id | [03-linear-documents-summary.md](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/docs/investigation/03-linear-documents-summary.md:50) | `chats.member_id NOT NULL` だけ。XOR CHECK なし | 設計不整合 |
| 認証は初期 x-user-id 仮実装 | [04-design-decisions.md](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/docs/investigation/04-design-decisions.md:38) | Better Auth + GitHub OAuth + secrets 必須まで進んでいる | やりすぎ |
| ai_run_events / 進捗 | [nightly report](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/docs/ops/nightly/2026-07-08-report.md:48) | schema/型はあるが polling/SSE API は未実装。失敗はchat本文に混入 | やらなさすぎ/設計混線 |
| WhyはADRへ | [AGENTS.md](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/AGENTS.md:11) | `ADV-003` 等の理由コメントがコード内に複数ある | ガードレール違反 |

**(2) 裁定への反論**

| 裁定 | 支持or反論 | 根拠 |
|---|---|---|
| ChatNotOwned→404 | 支持 | chatId存在確認oracleを塞ぐ判断は妥当。[chat.ts](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/apps/worker/src/routes/chat.ts:30) でHTTPだけ404化し、domainでは `ChatNotOwned` を保持している |
| in-flight 409 | 反論 | 方針はあり得るが、DB invariant がない。`findActiveByChatId` は check-then-insert で、race時にactive run並走を許す。[send-message.ts](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/packages/domain/src/use-cases/send-message.ts:55) |
| systemメッセージ可視化 | 反論 | 失敗通知をchat本文に入れると、次回AI入力にも `system` として混ざる。[sparring-workflow.ts](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/apps/worker/src/workflows/sparring-workflow.ts:91)。状態表示は `ai_run_events` 側が筋 |
| role契約削除 | 支持、ただし不足 | クライアントrole注入を消すのは正しい。ただしRole制御必須仕様は未達。現状は自己作成 student 固定だけ |
| ID形式128字 | 支持 | better-auth ID がUUID固定でない前提なら、URL-safe opaque ID は妥当。[shared/index.ts](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/packages/shared/src/index.ts:13)。DB CHECK は未設定 |
| AI 60sタイムアウト | 反論 | 実体はキャンセル不能な `Promise.race`。遅延応答のコスト/未完了実行は残る。[sparring-workflow.ts](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/apps/worker/src/workflows/sparring-workflow.ts:105)。名称は「表示上の待機上限」が正確 |

**(3) 体験の欠落トップ3**

1. **人につながる瞬間がない**  
   MVPの芯は「壁打ちしたら、この人に聞けそう」が出ること。現状はAIチャットで止まる。

2. **相談内容を外に出す承認動線がない**  
   UIは「あなたが出すまで誰にも見えません」と言うが、要約を確認して推薦相手へ渡す操作がない。

3. **曖昧な困りごとを推薦可能な材料へ変換する導線がない**  
   質問カード/4択/タグ抽出が未実装なので、AIの会話ログから推薦根拠を作れない。UI polish より先にここ。