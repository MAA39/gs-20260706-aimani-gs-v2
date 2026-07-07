行番号は `1ca0b2b` 時点です。

| 指摘ID | 重大度 | ファイル:行 | 問題 | 修正案 |
|---|---|---|---|---|
| REV-01 | P2 | [packages/db/src/adapters/d1-chat-repository.ts:100](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/packages/db/src/adapters/d1-chat-repository.ts:100) | `appendMessage` は存在しない `chatId` でも aggregate `SELECT` が1行返るため INSERT を試み、FK違反を `ChatDbFailure` に潰す。404で扱うべき境界が500化する。 | `FROM chats WHERE id = ?2` を起点に採番し、0行なら `ChatNotFound`。FK違反も明示的に `ChatNotFound`/専用errorへ写像。 |
| REV-02 | P2 | [packages/db/src/adapters/d1-chat-repository.ts:116](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/packages/db/src/adapters/d1-chat-repository.ts:116) | UNIQUE違反を全部 `MessageSequenceConflict` として retry している。`messages.id` の重複でも同じIDで3回再試行し、原因を誤分類する。 | エラーメッセージの制約対象を見て `chat_id, sequence` の時だけ retry。それ以外は `ChatDbFailure` か専用 conflict。 |
| REV-03 | P1 | [packages/contracts/src/api/parse.ts:49](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/packages/contracts/src/api/parse.ts:49) | 境界parserが optional string / string array の長さ・件数・URL形式・未知キーを制限しない。`/api/chats`/`/api/members` に body limit もなく、巨大な余剰JSONや巨大profile配列を受けられる。 | strict schema化、未知キー拒否、各optional fieldの最大長・配列件数・要素長、URL validationを追加。chat/member routesにも `jsonBodyLimit` を適用。 |
| REV-04 | P1 | [apps/worker/src/workflows/sparring-workflow.ts:105](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/apps/worker/src/workflows/sparring-workflow.ts:105) | `Promise.race` は timeout後も `session.prompt()` を止めない。DB上は failed になっても外部AI/Flue sessionは走り続け、コスト・DO資源リークになる。成功時も timer を clear していない。 | `AbortController`/FlueのキャンセルAPIで prompt 自体を中断。少なくとも `let timer` + `clearTimeout(timer)` を `finally` で実施。 |
| REV-05 | P2 | [apps/web/src/routes/chat.tsx:82](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/apps/web/src/routes/chat.tsx:82) | 複数run許可時、UIは「最後のhuman sequenceより後のAIが1件あれば待機終了」と判定する。先行runのAIが後続humanの後にappendされると、後続run未完了でも待機表示が消える。 | `aiRunId` 単位で待機状態を追う、またはAI応答待ち中の追加送信を禁止/409にする。 |

**詳細**

REV-01: `INSERT ... SELECT COALESCE(MAX(sequence), 0) + 1 FROM messages WHERE chat_id = ?2` は、対象chatのmessageが0件でも aggregate の性質で1行を作ります。既存chatの初回messageには効きますが、不存在chatでも INSERT まで進みます。D1/SQLiteのFKが有効なら statement は失敗してロールバックされるはずですが、現実の返却は `ChatDbFailure` なので HTTP では500寄りになります。

REV-02: sequence競合 retry 自体は方向性として妥当です。ただし今の判定は `UNIQUE constraint failed` の文字列だけなので、primary key重複も sequence競合扱いです。

REV-03: `message` と `displayName` だけは最低限見ていますが、プロフィール系は実質無制限です。さらに `parseStartChatRequest` は未知キーを落とさないため、`message` が短ければ巨大な余剰bodyでも通過します。

REV-04: 二重failはこのコード単体では見当たりません。loser側の `session.prompt()` に後続の append/complete が付いていないためです。問題は「失敗扱いにした後も実処理が止まらない」ことです。

**問題なし**

- ① appendMessageの単文 `INSERT ... RETURNING` は、splitされた `SELECT MAX` + `INSERT` よりは正しく、statement単位のatomicity狙いとしては問題なし。残る問題はFK時の写像とUNIQUE分類。
- ② `satisfies never` は網羅チェックとして機能しています。
- ⑤ `ChatNotOwned -> 404` は POST/GET とも `domainErrorToHttp` 経由で一貫しています。403差分は見当たりません。

テスト・typecheckは実行していません。今回は「読むのみ」指定で、`turbo`/TS系コマンドはキャッシュ等を書き得るためです。