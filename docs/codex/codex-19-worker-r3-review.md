**前提**
対象は指定リポジトリのみ。変更はしていません。現HEADは `7d8e38a98f5ab8810ecacbc9d24dce11f3028088` です。

**過去指摘の仕分け**
修正済み:
`MIH-001`, `ADV-012` は現コードの `throw new Error` が消え、API client は Result 返却化済みです。根拠: [api-client.ts](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/apps/web/src/lib/api-client.ts:75)

`MIH-002` は `satisfies never` で網羅性検出可能です。根拠: [chat.ts](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/apps/worker/src/routes/chat.ts:22)

`MIH-003` は route/workflow 境界で parser 使用済みです。根拠: [chat.ts](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/apps/worker/src/routes/chat.ts:131), [sparring-workflow.ts](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/apps/worker/src/workflows/sparring-workflow.ts:22)

`MIH-006`, `ADV-004` は message sequence 競合の retry/Result 化が入っています。根拠: [d1-chat-repository.ts](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/packages/db/src/adapters/d1-chat-repository.ts:98)

`MIH-007`, `ADV-001` は `sendMessage` が actor を受け取り所有者チェックします。根拠: [send-message.ts](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/packages/domain/src/use-cases/send-message.ts:38)

`MIH-008` は CI が `turbo test` を実行するよう修正済みです。根拠: [ci.yml](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/.github/workflows/ci.yml:173)

`MIH-009`, `ADV-003`, `ADV-005`, `ADV-006`, `ADV-008` は主要対策済みです。認証は session 化、他人 chat は 404、workflow は trigger snapshot、CAS敗北時は fail しない、dispatch失敗時は failed 化しています。

未対応または部分対応:
`ADV-007` は未対応です。human message と ai_run 作成が別Port呼び出しです。詳細は `R3-01`。

`MIH-004` は部分対応です。members は NOT NULL 化されていますが、ai_run の nullable が Domain まで残ります。根拠: [ai-run.ts](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/packages/domain/src/models/ai-run.ts:9)

`MIH-005` は部分対応です。adapter の主要D1例外は Result 化済みですが、`appendEvent` は失敗を握り潰します。根拠: [d1-ai-run-repository.ts](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/packages/db/src/adapters/d1-ai-run-repository.ts:263)

`ADV-009` は部分対応です。60秒 timeout とUI可視化はありますが、`session.prompt` 自体は abort されません。根拠: [sparring-workflow.ts](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/apps/worker/src/workflows/sparring-workflow.ts:108)

`ADV-010` は部分対応です。workflow payload と ai_run 正本の照合はありますが、DB schema は `chat_id` と `trigger_message_id` の同一chat性を強制しません。根拠: [0003_ai_runs.sql](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/packages/db/migrations/0003_ai_runs.sql:4)

`ADV-011` は部分対応です。body/message上限はありますが、AI投入履歴は chat 全履歴 snapshot で上限なしです。根拠: [sparring-workflow.ts](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/apps/worker/src/workflows/sparring-workflow.ts:90)

**R3指摘**
`R3-01 / High / ADV-007未対応`: human message と ai_run 作成が非原子的です。  
根拠: [send-message.ts](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/packages/domain/src/use-cases/send-message.ts:62), [start-chat.ts](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/packages/domain/src/use-cases/start-chat.ts:39)  
シナリオ: `appendMessage` 成功後に `createQueued` の D1 batch が失敗すると、APIは失敗扱いなのに human message だけ残り、AI応答は来ません。ユーザーが再送すると同じ相談が二重保存されます。

`R3-02 / High`: 「1 chat 1 in-flight」は read-check-write race で破れます。  
根拠: [send-message.ts](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/packages/domain/src/use-cases/send-message.ts:55), [d1-ai-run-repository.ts](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/packages/db/src/adapters/d1-ai-run-repository.ts:105)  
シナリオ: 同じchatへ2並列POSTすると、両方が `findActiveByChatId=null` を読み、その後それぞれ human message と queued ai_run を作れます。DBに active run の部分unique制約がないため、AI run が二重起動します。

`R3-03 / High`: AI message 追加と ai_run complete が非原子的です。  
根拠: [sparring-workflow.ts](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/apps/worker/src/workflows/sparring-workflow.ts:128), [d1-ai-run-repository.ts](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/packages/db/src/adapters/d1-ai-run-repository.ts:163)  
シナリオ: AI message append 成功後に `complete` が失敗すると、AI返信は見えるのに run は `generating` のまま残ります。次回送信は `AiRunInFlight` で塞がれ、chat が実質停止します。

`R3-04 / High`: 内部route gate が secret 未設定時に fail-open します。  
根拠: [app.ts](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/apps/worker/src/app.ts:112)  
シナリオ: `INTERNAL_ROUTE_SECRET` が未設定だと、`c.req.header('x-internal-token') === c.env.INTERNAL_ROUTE_SECRET` が `undefined === undefined` になり得ます。public host から `/workflows/*` へ到達でき、workflow起動面が露出します。

`R3-05 / Medium`: `POST /api/members` が未認証でも member を作成します。  
根拠: [member.ts](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/apps/worker/src/routes/member.ts:45)  
シナリオ: 未ログイン攻撃者が任意JSONで member row を大量作成できます。auth misconfigured 時も匿名IDにフォールバックするため、認証障害を安全側に倒せません。

`R3-06 / Medium`: rate limiter binding 欠落時に chat/AI API が fail-open します。  
根拠: [chat.ts](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/apps/worker/src/routes/chat.ts:113)  
シナリオ: Flue build/deployで `CHAT_RATE_LIMITER` が落ちると、警告のみで全送信を許可します。認証済みユーザーが 4000字入力を大量送信し、D1/AIコストを増幅できます。

`R3-07 / Low`: ai_run status endpoint に存在確認oracleがあります。  
根拠: [ai-run.ts](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/apps/worker/src/routes/ai-run.ts:18)  
シナリオ: 存在しない aiRunId は `AI run <id> not found`、他人の aiRunId は `AI run not found` で body が異なります。IDが漏れた場合に存在有無を判定できます。

**ADV-007 原子化設計案**
Domain に D1型を入れず、use-case専用Portを追加します。ADR-V2-006 の `deps` 注入と矛盾しません。

```ts
export interface SparringTurnRepository {
  createInitialTurn(input: {
    memberId: MemberId;
    chatId: ChatId;
    title: string;
    messageId: MessageId;
    messageBody: string;
    aiRunId: AiRunId;
    idempotencyKey?: string;
  }): Promise<Result<StartChatOutput, StartChatError>>;

  appendTurn(input: {
    actorMemberId: MemberId;
    chatId: ChatId;
    messageId: MessageId;
    messageBody: string;
    aiRunId: AiRunId;
    idempotencyKey?: string;
  }): Promise<Result<SendMessageOutput, SendMessageError>>;
}
```

`packages/domain` はこのPortだけを知り、`apps/worker` が `new D1SparringTurnRepository(c.env.DB)` を `deps` に注入します。D1実装は `packages/db/src/adapters` に置き、`db.batch([...])` で次を1 transactionにします。

`createInitialTurn`: `chats INSERT`、`messages INSERT sequence=1`、`ai_runs INSERT queued`、`ai_run_events INSERT queued` を同一 batch。どれかが失敗したら全rollback。

`appendTurn`: `INSERT INTO messages ... SELECT ... FROM chats WHERE owner一致 AND active AND NOT EXISTS(active ai_run) RETURNING ...`、続いて `ai_runs INSERT`、`ai_run_events INSERT` を同一 batch。`ai_runs` には `CREATE UNIQUE INDEX ... ON ai_runs(chat_id) WHERE status IN ('queued','admitted','generating','repairing')` を追加して、並行raceの最終防衛線にします。

失敗写像は、active unique違反を `AiRunInFlight`、`messages(chat_id, sequence)` 競合を retry 後 `MessageSequenceConflict`、`idempotency_key` 競合を既存結果返却または `AiRunConflict` にします。これで human message だけ残る状態を閉じられます。