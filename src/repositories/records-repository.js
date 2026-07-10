export async function findRecords(env, query) {
  const clauses = ['deleted_at IS NULL'];
  const params = [];
  if (query.ownerId) {
    clauses.push('owner_id = ?');
    params.push(query.ownerId);
    if (query.visibility) { clauses.push('visibility = ?'); params.push(query.visibility); }
  } else {
    clauses.push('visibility = ?');
    params.push('public');
  }
  if (query.domain) { clauses.push('domain = ?'); params.push(query.domain); }
  if (query.type) { clauses.push('type = ?'); params.push(query.type); }
  if (query.project) { clauses.push('projects_json LIKE ?'); params.push(`%${query.project.replace(/[%_]/g, '')}%`); }
  if (query.cursor?.createdAt && query.cursor?.id) {
    clauses.push('(created_at < ? OR (created_at = ? AND id < ?))');
    params.push(query.cursor.createdAt, query.cursor.createdAt, query.cursor.id);
  }
  const rows = await env.DB.prepare(`
    SELECT * FROM records
    WHERE ${clauses.join(' AND ')}
    ORDER BY created_at DESC, id DESC
    LIMIT ?
  `).bind(...params, query.limit + 1).all();
  return rows.results || [];
}

export function findRecordByAccess(env, input) {
  const clauses = ['id = ?', 'deleted_at IS NULL'];
  const params = [input.id];
  if (input.ownerId) { clauses.push('owner_id = ?'); params.push(input.ownerId); }
  else { clauses.push('visibility = ?'); params.push('public'); }
  return env.DB.prepare(`SELECT * FROM records WHERE ${clauses.join(' AND ')} LIMIT 1`)
    .bind(...params).first();
}
