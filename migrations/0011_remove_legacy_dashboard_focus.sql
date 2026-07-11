CREATE TABLE dashboard_settings_v2 (
  owner_id TEXT PRIMARY KEY,
  tomorrow_first_step TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (owner_id) REFERENCES users(id)
);

INSERT INTO dashboard_settings_v2 (owner_id, tomorrow_first_step, updated_at)
SELECT owner_id, tomorrow_first_step, updated_at FROM dashboard_settings;

DROP TABLE dashboard_settings;
ALTER TABLE dashboard_settings_v2 RENAME TO dashboard_settings;
