import { nowIso } from '../lib/db.js';

export function findAnalysisSnapshot(env, ownerId, scope) {
  return env.DB.prepare(`
    SELECT * FROM analysis_snapshots
    WHERE owner_id = ? AND scope_type = ? AND scope_key = ? AND window_days = ?
    LIMIT 1
  `).bind(ownerId, scope.scopeType, scope.scopeKey, scope.windowDays).first();
}

export async function saveAnalysisSnapshot(env, input) {
  const now = nowIso();
  await env.DB.prepare(`
    INSERT INTO analysis_snapshots (
      id, owner_id, scope_type, scope_key, window_days, source_record_ids_json,
      metrics_json, insights_json, next_actions_json, provider, model, prompt_version,
      status, error_message, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(owner_id, scope_type, scope_key, window_days) DO UPDATE SET
      source_record_ids_json = excluded.source_record_ids_json,
      metrics_json = excluded.metrics_json,
      insights_json = excluded.insights_json,
      next_actions_json = excluded.next_actions_json,
      provider = excluded.provider,
      model = excluded.model,
      prompt_version = excluded.prompt_version,
      status = excluded.status,
      error_message = excluded.error_message,
      updated_at = excluded.updated_at
  `).bind(
    crypto.randomUUID(), input.ownerId, input.scope.scopeType, input.scope.scopeKey,
    input.scope.windowDays, JSON.stringify(input.sourceRecordIds || []),
    JSON.stringify(input.metrics || {}), JSON.stringify(input.insights || {}),
    JSON.stringify(input.nextActions || []), input.provider || 'unknown',
    input.model || 'unknown', input.promptVersion || 'analysis-v1',
    input.status || 'completed', input.errorMessage || null, now, now
  ).run();
}
