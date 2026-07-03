CREATE TABLE IF NOT EXISTS analysis_snapshots (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  scope_type TEXT NOT NULL,
  scope_key TEXT NOT NULL,
  window_days INTEGER NOT NULL DEFAULT 0,
  source_record_ids_json TEXT NOT NULL DEFAULT '[]',
  metrics_json TEXT NOT NULL DEFAULT '{}',
  insights_json TEXT NOT NULL DEFAULT '{}',
  next_actions_json TEXT NOT NULL DEFAULT '[]',
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_version TEXT NOT NULL DEFAULT 'analysis-v1',
  status TEXT NOT NULL DEFAULT 'completed',
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(owner_id, scope_type, scope_key, window_days),
  FOREIGN KEY (owner_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_analysis_snapshots_owner_scope
  ON analysis_snapshots(owner_id, scope_type, scope_key, window_days);

ALTER TABLE followups ADD COLUMN source_analysis_id TEXT;
ALTER TABLE followups ADD COLUMN source_action_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_followups_source_analysis_action
  ON followups(owner_id, source_analysis_id, source_action_hash)
  WHERE source_analysis_id IS NOT NULL
    AND source_action_hash IS NOT NULL
    AND deleted_at IS NULL;
