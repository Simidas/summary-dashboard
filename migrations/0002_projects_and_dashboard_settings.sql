CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  summary TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  current_focus TEXT,
  next_action TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  UNIQUE(owner_id, slug),
  FOREIGN KEY (owner_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_projects_owner_status ON projects(owner_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS dashboard_settings (
  owner_id TEXT PRIMARY KEY,
  today_focus TEXT,
  tomorrow_first_step TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (owner_id) REFERENCES users(id)
);
