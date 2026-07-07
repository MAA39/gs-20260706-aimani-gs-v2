-- ai_runs: AI実行ライフサイクル（CAS風状態遷移）
CREATE TABLE ai_runs (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL REFERENCES chats(id),
  trigger_message_id TEXT NOT NULL REFERENCES messages(id),
  stage TEXT NOT NULL CHECK(stage IN ('sparring','recommendation')),
  status TEXT NOT NULL CHECK(status IN ('queued','admitted','generating','repairing','completed','failed')),
  idempotency_key TEXT UNIQUE,
  flue_run_id TEXT UNIQUE,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK(attempt_count >= 0),
  prompt_tokens INTEGER NOT NULL DEFAULT 0 CHECK(prompt_tokens >= 0),
  completion_tokens INTEGER NOT NULL DEFAULT 0 CHECK(completion_tokens >= 0),
  result_hash TEXT,
  error_message TEXT CHECK(error_message IS NULL OR length(error_message) <= 500),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX idx_ai_runs_chat ON ai_runs(chat_id);
CREATE INDEX idx_ai_runs_status ON ai_runs(status);

-- ai_run_events: SSE向けイベントストリーム
CREATE TABLE ai_run_events (
  id TEXT PRIMARY KEY,
  ai_run_id TEXT NOT NULL REFERENCES ai_runs(id),
  event_type TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  data_json TEXT NOT NULL CHECK(json_valid(data_json)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(ai_run_id, sequence)
);

CREATE INDEX idx_ai_run_events_run ON ai_run_events(ai_run_id);
