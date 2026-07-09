-- members: G'sコミュニティメンバー（退場なし、全員active）
CREATE TABLE members (
  id TEXT NOT NULL PRIMARY KEY,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('student','alumni','tutor','mentor','teacher','admin')),
  bio TEXT NOT NULL DEFAULT '',
  skills_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(skills_json) AND json_type(skills_json) = 'array'),
  can_help_with_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(can_help_with_json) AND json_type(can_help_with_json) = 'array'),
  wants_help_with_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(wants_help_with_json) AND json_type(wants_help_with_json) = 'array'),
  github_url TEXT,
  x_url TEXT,
  facebook_url TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) WITHOUT ROWID;

CREATE INDEX idx_members_role ON members(role);
