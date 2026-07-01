ALTER TABLE records ADD COLUMN structured_payload_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE records ADD COLUMN ai_status TEXT NOT NULL DEFAULT 'pending';

ALTER TABLE ai_suggestions ADD COLUMN record_type TEXT;
ALTER TABLE ai_suggestions ADD COLUMN prompt_version TEXT;
ALTER TABLE ai_suggestions ADD COLUMN structured_result_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE ai_suggestions ADD COLUMN destination_suggestions_json TEXT NOT NULL DEFAULT '[]';

ALTER TABLE content_items ADD COLUMN source_record_id TEXT;

CREATE INDEX IF NOT EXISTS idx_records_owner_type_date
  ON records(owner_id, type, date DESC);

CREATE INDEX IF NOT EXISTS idx_content_items_source_record
  ON content_items(source_record_id);
