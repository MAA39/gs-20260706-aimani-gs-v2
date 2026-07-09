**Adversarial Review**

- **ADV-001 / P1: `x-user-id` 偽装でowner検証が成立しない**  
  根拠: [chat.ts](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/apps/worker/src/routes/chat.ts:40) はクライアント入力の `x-user-id` を信頼し、[api-proxy.ts](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/apps/web/src/lib/api-proxy.ts:14) は入力ヘッダをほぼそのまま上流へ流す。Worker APIも [README.md](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/README.md:35) でpublic URL公開。  
  再現: victimの `memberId` と `chatId` を入手して `curl -H 'x-user-id: <victimMemberId>' /api/chats/<victimChatId>/messages`。owner checkは通る。

- **ADV-002 / P1: Flue workflow入口が公開経路に見え、payload改ざんで他人chatへAI投稿できる**  
  根拠: [app.ts](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/apps/worker/src/app.ts:33) が `flue()` をroot mountし、[sparring-workflow.ts](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/apps/worker/src/workflows/sparring-workflow.ts:17) は素通し。`run` はpayloadをcastするだけで、`aiRunId` と `chatId` の整合性を検証しない。  
  再現: 自分のqueued `aiRunId` を作り、`/workflows/sparring-workflow` に `{ aiRunId: 自分, chatId: victimChatId }` を投げる。workflowはvictim履歴を読み、victim chatへAI messageをappendする。

- **ADV-003 / P2: `chatId` 存在確認oracleがある**  
  根拠: [chat.ts](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/apps/worker/src/routes/chat.ts:131) は先に `findById` して、存在しなければ404、存在してowner違いなら [403](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/apps/worker/src/routes/chat.ts:135)。  
  再現: 任意の `x-user-id` を付け、候補 `chatId` にGET/POST。404なら不存在、403なら存在する他人chat。

- **ADV-004 / P1: 二重送信でmessage sequenceが競合し、ResultではなくD1例外で落ちる**  
  根拠: [d1-chat-repository.ts](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/packages/db/src/adapters/d1-chat-repository.ts:104) が `MAX(sequence)+1` を読み、別SQLで [INSERT](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/packages/db/src/adapters/d1-chat-repository.ts:81)。DBは [UNIQUE(chat_id, sequence)](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/packages/db/migrations/0002_chats_messages.sql:22) だがcatch/retryなし。  
  再現: 同じchatへ2並列POST。両方が同じnext sequenceを掴み、片方が制約違反で500化する。

- **ADV-005 / P1: `triggerMessageId` が未使用で、連続send時にAI応答が別メッセージへ混線する**  
  根拠: payloadには [triggerMessageId](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/apps/worker/src/workflows/sparring-workflow.ts:14) があるが、実行時は [chat全履歴](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/apps/worker/src/workflows/sparring-workflow.ts:31) を読むだけ。  
  再現: 1通目のAI応答前に2通目を送る。1通目runも2通目を含む履歴で応答し、2つのAI応答の対応関係が壊れる。

- **ADV-006 / P1: CAS失敗時に正常実行中のrunを`failed`へ潰せる**  
  根拠: [sparring-workflow.ts](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/apps/worker/src/workflows/sparring-workflow.ts:25) の `markAdmitted` 失敗時に `fail` するが、[fail](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/packages/db/src/adapters/d1-ai-run-repository.ts:150) は `completed/failed` 以外を全部failedにできる。  
  再現: 同じworkflowを二重起動。先行runが`generating`になった後、後続runのCAS失敗が先行runを`failed`へ変更する。先行runはAI messageをappendしても [complete結果未確認](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/apps/worker/src/workflows/sparring-workflow.ts:78) で不整合が残る。

- **ADV-007 / P1: human message作成とai_run作成が非トランザクション**  
  根拠: [send-message.ts](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/packages/domain/src/use-cases/send-message.ts:36) はmessage append後に [aiRun作成](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/packages/domain/src/use-cases/send-message.ts:44) する。失敗時のrollbackなし。  
  再現: `ai_runs` insert/event insertでD1エラーを起こす。APIは失敗扱いだがhuman messageだけ保存され、AI応答は永遠に来ない。retryで重複投稿になる。

- **ADV-008 / P1: workflow dispatch失敗後、`ai_runs` がqueuedに固着する**  
  根拠: [triggerWorkflow](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/apps/worker/src/routes/chat.ts:19) は `waitUntil` 内でログを出すだけで、dispatch失敗をDBへ反映しない。HTTPは先に201を返す。  
  再現: Flue route/DO bindingを壊す、またはappFetchが500を返す状態でsend。クライアントは成功レスポンスを受けるが、AI runはqueuedのまま。

- **ADV-009 / P1: AI呼び出しにtimeout/abortがなく、60秒後はUIだけ諦める**  
  根拠: [session.prompt](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/apps/worker/src/workflows/sparring-workflow.ts:51) にtimeoutがない。[chat.tsx](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/apps/web/src/routes/chat.tsx:70) は60秒で `waitingForAi` をfalseにするだけ。  
  再現: Sakura AIがハング/遅延。Worker実行が切られるとcatch/failまで到達せず、`generating` 固着かつUI上は失敗状態が見えない。

- **ADV-010 / P2: D1 schemaが`ai_runs.chat_id`と`trigger_message_id`の同一chat性を守れない**  
  根拠: [0003_ai_runs.sql](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/packages/db/migrations/0003_ai_runs.sql:4) は `chat_id` と `trigger_message_id` を個別FKにしているだけ。`UNIQUE(trigger_message_id, stage)` もない。  
  再現: chat Aの `ai_run` にchat Bのmessage IDを `trigger_message_id` としてinsertできる。payload改ざんや将来のバグでrun/message対応が壊れる。

- **ADV-011 / P1: public APIからprompt/CPU/外部AIコストDoSが可能**  
  根拠: [chat.ts](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/apps/worker/src/routes/chat.ts:45) は `trim()` しか見ず、DBの [body](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/packages/db/migrations/0002_chats_messages.sql:19) に長さ制限なし。workflowは [全履歴を毎回join](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/apps/worker/src/workflows/sparring-workflow.ts:37) してAIへ送る。  
  再現: 長文messageを大量投入してsend。Workers CPU/実行時間、D1 read、Sakura token/timeoutを攻撃者入力だけで膨らませられる。

- **ADV-012 / P1: `throw new Error` が入り、L0とCI guardに反する**  
  根拠: [api-client.ts](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/apps/web/src/lib/api-client.ts:36) ほかで `throw new Error`。CIのrepo guardは [ci.yml](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/.github/workflows/ci.yml:169) でこれを禁止している。  
  再現: CIのarchitecture guardを走らせると `apps/web/src/lib/api-client.ts` がヒットして失敗する。

レビューのみで、ファイル変更はしていません。