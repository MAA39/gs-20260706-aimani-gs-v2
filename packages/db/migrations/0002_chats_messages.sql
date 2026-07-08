-- chats: 壁打ちセッション
CREATE TABLE chats (
  id TEXT NOT NULL PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES members(id),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) WITHOUT ROWID;

CREATE INDEX idx_chats_member ON chats(member_id);
CREATE INDEX idx_chats_status ON chats(status);

-- messages: 壁打ちの各メッセージ
CREATE TABLE messages (
  id TEXT NOT NULL PRIMARY KEY,
  chat_id TEXT NOT NULL REFERENCES chats(id),
  sender_type TEXT NOT NULL CHECK(sender_type IN ('human','ai','system')),
  body TEXT NOT NULL CHECK(length(body) >= 1),
  sequence INTEGER NOT NULL CHECK(sequence >= 1),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  -- UNIQUE(chat_id, sequence)がchat_id先頭indexを兼ねるため、単独のchat_id indexは持たない
  UNIQUE(chat_id, sequence),
  -- ai_runs の複合FK (chat_id, trigger_message_id) の参照先。単体FKでは別chatのmessageを刺せる
  UNIQUE(chat_id, id)
) WITHOUT ROWID;
