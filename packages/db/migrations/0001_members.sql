-- members: G'sコミュニティメンバー（退場なし、全員active）
CREATE TABLE members (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('student','alumni','tutor','mentor','teacher','admin')),
  bio TEXT NOT NULL DEFAULT '',
  skills_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(skills_json)),
  can_help_with_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(can_help_with_json)),
  wants_help_with_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(wants_help_with_json)),
  github_url TEXT,
  x_url TEXT,
  facebook_url TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX idx_members_role ON members(role);
