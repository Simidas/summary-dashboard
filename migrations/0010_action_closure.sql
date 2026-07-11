ALTER TABLE followups ADD COLUMN source_type TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE followups ADD COLUMN outcome_type TEXT;
ALTER TABLE followups ADD COLUMN outcome_note TEXT;
ALTER TABLE followups ADD COLUMN completed_at TEXT;
ALTER TABLE followups ADD COLUMN replaced_by_followup_id TEXT;
ALTER TABLE followups ADD COLUMN defer_count INTEGER NOT NULL DEFAULT 0;

UPDATE followups
SET source_type = CASE
  WHEN source_analysis_id IS NOT NULL THEN 'analysis'
  WHEN source_record_id IS NOT NULL THEN 'record'
  ELSE 'manual'
END,
outcome_type = CASE
  WHEN status = 'closed' THEN 'completed'
  WHEN status = 'dropped' THEN 'not_needed'
  ELSE NULL
END,
completed_at = CASE
  WHEN status IN ('closed', 'dropped') THEN COALESCE(closed_at, updated_at)
  ELSE NULL
END;

CREATE TABLE suggestion_decisions (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  suggestion_id TEXT NOT NULL,
  record_id TEXT NOT NULL,
  candidate_type TEXT NOT NULL,
  candidate_key TEXT NOT NULL,
  decision TEXT NOT NULL,
  destination_type TEXT,
  destination_id TEXT,
  original_payload_json TEXT NOT NULL DEFAULT '{}',
  final_payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(owner_id, suggestion_id, candidate_type, candidate_key),
  FOREIGN KEY (owner_id) REFERENCES users(id),
  FOREIGN KEY (suggestion_id) REFERENCES ai_suggestions(id),
  FOREIGN KEY (record_id) REFERENCES records(id)
);

CREATE INDEX idx_suggestion_decisions_owner_record
  ON suggestion_decisions(owner_id, record_id, updated_at DESC);

CREATE TABLE insights (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  text TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'observing',
  domain TEXT,
  project_id TEXT,
  source_record_id TEXT NOT NULL,
  source_suggestion_id TEXT,
  evidence_json TEXT NOT NULL DEFAULT '[]',
  validation_note TEXT,
  confirmed_at TEXT,
  invalidated_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY (owner_id) REFERENCES users(id),
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (source_record_id) REFERENCES records(id),
  FOREIGN KEY (source_suggestion_id) REFERENCES ai_suggestions(id)
);

CREATE INDEX idx_insights_owner_status_updated
  ON insights(owner_id, status, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE followup_events (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  followup_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  note TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY (owner_id) REFERENCES users(id),
  FOREIGN KEY (followup_id) REFERENCES followups(id)
);

CREATE INDEX idx_followup_events_owner_followup_created
  ON followup_events(owner_id, followup_id, created_at DESC);

INSERT INTO followup_events (
  id, owner_id, followup_id, event_type, from_status, to_status, note, metadata_json, created_at
)
SELECT
  lower(hex(randomblob(16))), owner_id, id, 'migrated', NULL, status,
  '由旧版待办迁移', json_object('source', 'migration-0010'), created_at
FROM followups;

CREATE TABLE daily_focus (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  date TEXT NOT NULL,
  text TEXT NOT NULL,
  followup_id TEXT,
  project_id TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(owner_id, date),
  FOREIGN KEY (owner_id) REFERENCES users(id),
  FOREIGN KEY (followup_id) REFERENCES followups(id),
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE INDEX idx_daily_focus_owner_date ON daily_focus(owner_id, date DESC);

INSERT INTO daily_focus (
  id, owner_id, date, text, status, created_at, updated_at
)
SELECT
  lower(hex(randomblob(16))), owner_id, date('now', '+8 hours'), today_focus, 'active', updated_at, updated_at
FROM dashboard_settings
WHERE today_focus IS NOT NULL AND trim(today_focus) != '';
