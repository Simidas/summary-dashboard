CREATE TABLE IF NOT EXISTS content_items (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  title TEXT NOT NULL,
  source_domain TEXT,
  status TEXT NOT NULL DEFAULT 'idea',
  angle TEXT,
  outline_json TEXT NOT NULL DEFAULT '[]',
  tags_json TEXT NOT NULL DEFAULT '[]',
  next_action TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY (owner_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_content_items_owner_status
  ON content_items(owner_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS followups (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  text TEXT NOT NULL,
  domain TEXT,
  project TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  source_record_id TEXT,
  due_date TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  closed_at TEXT,
  deleted_at TEXT,
  FOREIGN KEY (owner_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_followups_owner_status
  ON followups(owner_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS domain_settings (
  owner_id TEXT NOT NULL,
  domain TEXT NOT NULL,
  current_focus TEXT,
  next_action TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(owner_id, domain),
  FOREIGN KEY (owner_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS period_reviews (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  period_type TEXT NOT NULL,
  period_key TEXT NOT NULL,
  theme TEXT,
  summary TEXT,
  wins_json TEXT NOT NULL DEFAULT '[]',
  blockers_json TEXT NOT NULL DEFAULT '[]',
  next_actions_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(owner_id, period_type, period_key),
  FOREIGN KEY (owner_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_period_reviews_owner_type
  ON period_reviews(owner_id, period_type, period_key DESC);
