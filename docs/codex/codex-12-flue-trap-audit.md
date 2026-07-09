**(A) 判定**

本には、今夜の罠そのもの、つまり「素の `wrangler dev` が `src/index.ts` 不在なのに `.wrangler/deploy/config.json` の `configPath` 経由で古い `dist` を配信する」は記載なしです。

全文検索で `wrangler dev` / `src/index.ts` / `.wrangler` / `deploy/config.json` / `redirect` / `configPath` は一致0件でした。近い記述は `12-cloudflare-deploy.md:98-106` の `flue build` 後に `dist` 配下から `wrangler deploy` する説明だけです。

gs-v2 側の実在箇所は以下です。

- `apps/worker/wrangler.jsonc:6` に `"main": "src/index.ts"`
- `apps/worker/src/` には `index.ts` なし
- `apps/worker/.wrangler/deploy/config.json:1` に `{"configPath":"../../dist/aimani_gs_v2/wrangler.json","auxiliaryWorkers":[]}`
- `apps/worker/package.json:6` の正規 dev は `"flue dev --target cloudflare --port 8787"`

**(B) 罠突き合わせ**

| 罠 | 本の章 | gs-v2該当箇所:行 | 分類 | 対処 |
|---|---|---|---|---|
| route exportなしでHTTPアクセスが404 | `14:12-18`, `11:39-41` | Workflowは `src/workflows/sparring-workflow.ts:20` で `route` あり。Agentは `src/agents/sparring-agent.ts:43-44` のみ | 構成上無関係 | 現行どおりWorkflow経由。AgentをHTTP公開する時だけ `route` と認可を追加 |
| Workflowの`runs`未exportでRun結果が読めない | `14:62-68`, `06:125-138`, `11:100-102` | `src/workflows/sparring-workflow.ts:20` は `route` のみ。`src/app.ts:71-91` で `/runs/` は内部扱い | 構成上無関係 | Flue `/runs/:runId` を公開しない設計なら維持。公開するなら `runs` と認可必須 |
| runId/Agent IDをcredential扱いする | `14:88-94`, `11:104-122` | `src/app.ts:71-85` で `/runs/`, `/agents/` 等をhostname/tokenで遮断 | 構成上無関係 | この遮断を維持。`runs` 公開時はユーザー所有確認も入れる |
| β版破壊的変更 | `14:70-76`, `16:80-92`, `16:98-102` | `package.json:12` runtime beta.2、`:25` cli beta.1、`src/agents/sparring-agent.ts:1,28` `createAgent`、`src/workflows/sparring-workflow.ts:35-36` `payload` | 既に踏んでる | runtime/cliを同一betaへ固定し、beta.5系へ上げるなら `defineAgent/defineWorkflow` と `input` 契約へ移行 |
| Cloudflare agents SDK互換 | `14:104-110`, `12:39-41`, `16:52-55`, `19:45-48` | `package.json:17` `"agents": "^0.16.2"` | 既に踏んでる | Flueの実使用版のCHANGELOGで要求範囲を確認し、`^` を外して固定 |
| Cloudflareで`db.ts`を置く | `12:13-14`, `10:158-160` | `flue.config.ts:4` target cloudflare。`apps/worker/src` に `db.ts` なし | 構成上無関係 | `apps/worker` に Flue用 `db.ts` を追加しない |
| DO migration履歴を書き換える/リネームを軽視 | `12:60-92` | `wrangler.jsonc:18-27` DO bindings + `v1` migration | これから踏む可能性が高い | 一度出した `v1` は編集せず、DO class追加/改名/削除は新tagで追記 |
| `wrangler`/dist手順の取り違え | `12:98-106` | `package.json:8` は `flue build ... && wrangler deploy --config dist/...`、`wrangler.jsonc:6` は素のmain | 既に踏んでる | dev/deployは `package.json` scripts経由に統一。素の `wrangler dev` を使わない |
| Durable Executionを外部副作用exactly-onceと誤解 | `14:20-26`, `10:49-68`, `10:139-152` | `src/workflows/sparring-workflow.ts:69-73`, `98-103`, `140-149` でCAS/状態遷移あり | 構成上無関係 | 外部API Tool追加時はidempotency keyとDB状態記録を必須化 |
| `dispatch()` receiptを完了扱いする | `10:139-152`, `05:287-288` | `src/routes/chat.ts:165-175`, `249-258` は `aiRunId` を返すだけ | 構成上無関係 | 現行どおり「受付」と「完了」を分離 |
| 同一Sessionで並列Operation | `14:80-86`, `05:95-116` | `src/workflows/sparring-workflow.ts:95-110` は1つの `session.prompt` のみ | 構成上無関係 | 複数promptを並列化するなら別Sessionかtaskへ分離 |
| `compaction: false`で完全停止と誤解 | `14:46-52`, `09:52-68` | `src/agents/sparring-agent.ts:37-40` にcompaction設定なし | 構成上無関係 | 設定する時はOverflow recoveryが残る前提で扱う |
| `contextWindow: 0` | `17:45-63` | `src/agents/sparring-agent.ts:34` `contextWindow: 128_000` | 構成上無関係 | 現状維持 |
| Session永続化でSandboxファイルも残ると思う | `14:54-60`, `08:93-124` | `session.fs`/`session.shell` 使用なし | 構成上無関係 | Sandboxファイルを使い始めたら外部ストレージ/永続workspaceを別設計 |
| `local()` Sandboxで未信頼入力 | `14:28-34`, `08:38-74` | `local(` / `sandbox` 使用なし。Agentは `src/agents/sparring-agent.ts:28-40` | 構成上無関係 | ユーザー入力にshell/fsを許すならRemote/Container Sandbox |
| Tool inputを信頼する | `05:178-184` | `defineTool`/`tools:` 使用なし | 構成上無関係 | Tool追加時は認可情報でスコープ制限 |
| Skill名に日本語 | `14:96-102`, `05:248-251` | Flue `skills:` 使用なし | 構成上無関係 | Skill追加時は英小文字ASCII+kebab-case |
| Webhook重複排除なし | `14:38-44`, `07:93-126` | `channels/` なし。内部起動は `src/routes/chat.ts:92-100` | 構成上無関係 | Channel追加時はdelivery IDをDBでatomic claim |
| Channelにraw payload/secretを渡す | `07:132-157` | 内部payloadは `src/routes/chat.ts:74-97` のID群のみ、検証は `src/workflows/sparring-workflow.ts:22-32` | 構成上無関係 | Channel追加時も必要最小限の業務データだけ渡す |
| Channelを外部サービス万能クライアントと思う | `07:12-19`, `03:182-193` | `channels/` なし | 構成上無関係 | 返信/送信は各サービスAPIをTool等で別実装 |
| シークレットをSandbox/モデルに見せる | `12:125-126`, `07:132-144` | `src/agents/sparring-agent.ts:32` はProvider登録の `apiKey` | 構成上無関係 | secretはProvider/Tool実装内に閉じ、prompt/payloadへ入れない |
| 公式AI生成ページを無条件に信じる | `14:112-118`, `01:7-13`, `15:18-25` | `package.json:12,25` が本の基準beta.5と不一致 | これから踏む可能性が高い | docsより対象版CHANGELOG/型/lockfileを優先 |
| Pi cache/履歴再送の誤解 | `18:27-29`, `18:35-37`, `18:61-71` | `src/agents/sparring-agent.ts:29-34` Sakura + `openai-completions`、`src/workflows/sparring-workflow.ts:91-110` で履歴JSONを毎回送信 | これから踏む可能性が高い | cache効果はwire payloadで確認。履歴再送削減はWorkflowから永続Agent化を検討 |
| `@flue/react`/run stream等の内部API依存 | `16:72`, `16:102`, `17:162-164` | `@flue/react`/run stream/WebSocket adapter使用なし | 構成上無関係 | 触らない方針を維持 |

ファイル編集はしていません。確認時点で `apps/worker/src/routes/chat.ts` に既存のgit差分はありました。