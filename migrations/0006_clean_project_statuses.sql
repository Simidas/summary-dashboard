UPDATE projects
SET status = CASE
  WHEN lower(trim(status)) IN ('active', 'paused', 'completed', 'dropped') THEN lower(trim(status))
  WHEN lower(trim(status)) IN ('shipped', 'done', 'finished', 'finish', 'complete', 'closed')
    OR trim(status) IN ('完成', '已完成', '完成态') THEN 'completed'
  WHEN lower(trim(status)) IN ('drop', 'abandoned', 'discarded', 'cancelled', 'canceled', 'archived')
    OR trim(status) IN ('废弃', '已废弃', '废弃态') THEN 'dropped'
  ELSE 'active'
END,
updated_at = COALESCE(updated_at, datetime('now'))
WHERE status IS NULL
  OR lower(trim(status)) NOT IN ('active', 'paused', 'completed', 'dropped');
