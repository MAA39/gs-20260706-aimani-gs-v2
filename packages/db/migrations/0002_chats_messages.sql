-- chats: 壁打ちセッション
CREATE TABLE chats (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES members(id),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX idx_chats_member ON chats(member_id);
CREATE INDEX idx_chats_status ON chats(status);

-- messages: 壁打ちの各メッセージ
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL REFERENCES chats(id),
  sender_type TEXT NOT NULL CHECK(sender_type IN ('human','ai','system')),
  body TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(chat_id, sequence),
  -- ai_runs の複合FK (chat_id, trigger_message_id) の参照先。単体FKでは別chatのmessageを刺せる
  UNIQUE(chat_id, id)
);

CREATE INDEX idx_messages_chat ON messages(chat_id);
