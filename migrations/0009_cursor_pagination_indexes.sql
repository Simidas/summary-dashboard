CREATE INDEX IF NOT EXISTS idx_records_owner_created_id
  ON records(owner_id, created_at DESC, id DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_records_public_created_id
  ON records(visibility, created_at DESC, id DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_projects_owner_updated_id
  ON projects(owner_id, updated_at DESC, id DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_content_items_owner_updated_id
  ON content_items(owner_id, updated_at DESC, id DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_followups_owner_updated_id
  ON followups(owner_id, updated_at DESC, id DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_daily_reviews_owner_date_id
  ON daily_reviews(owner_id, date DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_period_reviews_owner_type_key_id
  ON period_reviews(owner_id, period_type, period_key DESC, id DESC);
