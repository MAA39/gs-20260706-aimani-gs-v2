読み取りのみで確認しました。結論は **本番 D1 未適用なら 0001-0004 を書き直す** です。0005 追加は、すでにどこかの共有/本番相当 DB に適用済みの場合だけの救済策にしてください。

根拠: D1 は FK を常時有効にする前提で、`PRAGMA foreign_keys=off` ではなく `PRAGMA defer_foreign_keys=on` を使う必要があります。また SQLite の任意スキーマ変更は create-copy-drop-rename の 12-step rebuild が正道です。

**SCH-01: ADV-010**
現状の [0003_ai_runs.sql](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/packages/db/migrations/0003_ai_runs.sql:4) は `chat_id` と `trigger_message_id` を個別 FK にしているだけです。`messages(chat_id, id)` を親キー化し、`ai_runs(chat_id, trigger_message_id)` から composite FK を張ります。

```sql
-- 0002 側
CREATE TABLE messages (
  id TEXT NOT NULL PRIMARY KEY,
  chat_id TEXT NOT NULL,
  sender_type TEXT NOT NULL CHECK(sender_type IN ('human','ai','system')),
  body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 8000),
  sequence INTEGER NOT NULL CHECK(sequence >= 1),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY(chat_id) REFERENCES chats(id),
  UNIQUE(chat_id, id),
  UNIQUE(chat_id, sequence)
) WITHOUT ROWID;

-- 0003 側
FOREIGN KEY(chat_id, trigger_message_id) REFERENCES messages(chat_id, id),
UNIQUE(trigger_message_id, stage)
```

**SCH-02: in-flight run invariant**
`D1AiRunRepository.findActiveByChatId` の active 定義と同じ集合で DB invariant にします。

```sql
CREATE UNIQUE INDEX ux_ai_runs_one_in_flight_per_chat
ON ai_runs(chat_id)
WHERE status IN ('queued','admitted','generating','repairing');
```

**SCH-03: MIH-004**
最小破壊で行くなら、app-owned nullable は SQL NULL をやめて `NOT NULL DEFAULT ''` に寄せ、`ai_runs` は status union を `CHECK` で縛ります。adapter/domain 側は `''` をそのまま `string | null` に戻さず、状態別 discriminated union に写像してください。

```sql
CREATE TABLE ai_runs (
  id TEXT NOT NULL PRIMARY KEY,
  chat_id TEXT NOT NULL,
  trigger_message_id TEXT NOT NULL,
  stage TEXT NOT NULL CHECK(stage IN ('sparring','recommendation')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','admitted','generating','repairing','completed','failed')),
  idempotency_key TEXT NOT NULL DEFAULT '' CHECK(length(idempotency_key) <= 256),
  flue_run_id TEXT NOT NULL DEFAULT '' CHECK(length(flue_run_id) <= 256),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK(attempt_count >= 0),
  prompt_tokens INTEGER NOT NULL DEFAULT 0 CHECK(prompt_tokens >= 0),
  completion_tokens INTEGER NOT NULL DEFAULT 0 CHECK(completion_tokens >= 0),
  result_hash TEXT NOT NULL DEFAULT '' CHECK(length(result_hash) <= 128),
  error_message TEXT NOT NULL DEFAULT '' CHECK(length(error_message) <= 500),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY(chat_id) REFERENCES chats(id),
  FOREIGN KEY(chat_id, trigger_message_id) REFERENCES messages(chat_id, id),
  UNIQUE(trigger_message_id, stage),
  CHECK(
    (status IN ('queued','admitted') AND flue_run_id = '' AND result_hash = '' AND error_message = '' AND prompt_tokens = 0 AND completion_tokens = 0)
    OR (status IN ('generating','repairing') AND flue_run_id <> '' AND result_hash = '' AND error_message = '' AND prompt_tokens = 0 AND completion_tokens = 0)
    OR (status = 'completed' AND flue_run_id <> '' AND result_hash <> '' AND error_message = '')
    OR (status = 'failed' AND result_hash = '' AND error_message <> '')
  )
) WITHOUT ROWID;

CREATE UNIQUE INDEX ux_ai_runs_idempotency_key_present
ON ai_runs(idempotency_key)
WHERE idempotency_key <> '';

CREATE UNIQUE INDEX ux_ai_runs_flue_run_id_present
ON ai_runs(flue_run_id)
WHERE flue_run_id <> '';

CREATE UNIQUE INDEX ux_ai_runs_one_in_flight_per_chat
ON ai_runs(chat_id)
WHERE status IN ('queued','admitted','generating','repairing');

CREATE INDEX idx_ai_runs_status ON ai_runs(status);
CREATE INDEX idx_ai_runs_trigger_message ON ai_runs(chat_id, trigger_message_id);
```

**SCH-04: 推奨 migration 方針**
0001-0004 書き直し推奨です。

利点: rebuild migration 不要、D1 の `defer_foreign_keys` 依存を避けられる、履歴が「初期スキーマとして正しい」形になる、ローカル DB は作り直せる。

欠点: すでに誰かの共有 DB に適用済みなら migration 履歴と SQL 内容がズレます。

0005 追加の利点: 適用済み DB を壊さず前進できます。

欠点: `members` / `chats` / `messages` / `ai_runs` の rebuild が必要で、D1 では `PRAGMA foreign_keys=off` に逃げず `PRAGMA defer_foreign_keys=on` 前提になります。今回は本番未適用なので不要なリスクです。

**SCH-05: 0005 にする場合の骨子**
完全版は create-copy-drop-rename です。先頭と末尾はこうしてください。

```sql
PRAGMA defer_foreign_keys = on;

-- 1. new_members/new_chats/new_messages/new_ai_runs/new_ai_run_events を新定義で CREATE
-- 2. INSERT INTO new_* SELECT ... FROM * で NULL を '' に正規化してコピー
-- 3. DROP TABLE members/chats/messages/ai_runs/ai_run_events
-- 4. ALTER TABLE new_* RENAME TO *
-- 5. index を再作成

PRAGMA foreign_key_check;
PRAGMA defer_foreign_keys = off;
```

D1 で 0005 を選ぶなら、`PRAGMA foreign_key_check` は確認用で、失敗検知の本体は末尾の `PRAGMA defer_foreign_keys = off` です。

**SCH-06: その他の地雷**
- `BOOLEAN`: app-owned table にはなし。`0004_auth.sql` の `emailVerified INTEGER` は `CHECK(emailVerified IN (0,1))` を足すとよい。
- `DATETIME`: 0001-0003 は ISO-ish `strftime('%Y-%m-%dT%H:%M:%fZ','now')`。0004 は `datetime('now')` で `T/Z` なし。auth ライブラリ境界として許容するか、ISO に揃えるか決める。
- `AUTOINCREMENT`: 未使用で良い。
- 暗黙 `rowid`: 現行の `TEXT PRIMARY KEY` は rowid table。app-owned table は `id TEXT NOT NULL PRIMARY KEY ... WITHOUT ROWID` 推奨。
- JSON: `json_valid(...)` だけだと object も通る。配列想定なら `json_type(col) = 'array'` を追加。
- sequence: `messages.sequence` / `ai_run_events.sequence` は `CHECK(sequence >= 1)` を追加。
- index: `UNIQUE(chat_id, sequence)` は `listMessages(chatId) ORDER BY sequence` に使えるので、単独 `idx_messages_chat` は冗長です。

SQLite のインメモリ確認では、提案 DDL は構文 OK、別 chat の `trigger_message_id` は `FOREIGN KEY constraint failed`、同一 chat の active run 二重作成は `UNIQUE constraint failed: ai_runs.chat_id` で拒否されました。