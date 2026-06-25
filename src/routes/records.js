import { generateCompanionSuggestion } from '../lib/ai-client.js';
import {
  mapRecord,
  mapSuggestion,
  normalizeDomain,
  normalizeEnergy,
  normalizeType,
  normalizeVisibility,
  nowIso,
  toJsonText,
  todayShanghai,
  updateUserStateAfterRecord
} from '../lib/db.js';
import { fail, ok, readJson } from '../lib/response.js';
import { assertCsrf, getSession } from '../lib/session.js';

export async function handleRecords(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === '/api/records' && request.method === 'GET') {
    return listRecords(request, env);
  }

  if (path === '/api/records' && request.method === 'POST') {
    return createRecord(request, env);
  }

  const regenerateMatch = path.match(/^\/api\/records\/([^/]+)\/ai\/regenerate$/);
  if (regenerateMatch && request.method === 'POST') {
    return regenerateSuggestion(request, env, regenerateMatch[1]);
  }

  const recordMatch = path.match(/^\/api\/records\/([^/]+)$/);
  if (recordMatch && request.method === 'PATCH') {
    return updateRecord(request, env, recordMatch[1]);
  }
  if (recordMatch && request.method === 'DELETE') {
    return deleteRecord(request, env, recordMatch[1]);
  }

  return fail(404, 'NOT_FOUND', 'Records endpoint not found');
}

async function listRecords(request, env) {
  const session = await getSession(request, env);
  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get('limit') || 20), 100);
  const domain = normalizeDomain(url.searchParams.get('domain'));
  const type = url.searchParams.get('type');
  const visibility = normalizeVisibility(url.searchParams.get('visibility') || 'public');
  const params = [];
  const clauses = ['deleted_at IS NULL'];

  if (session?.user?.role === 'owner') {
    clauses.push('owner_id = ?');
    params.push(session.user.id);
    if (url.searchParams.has('visibility')) {
      clauses.push('visibility = ?');
      params.push(visibility);
    }
  } else {
    clauses.push('visibility = ?');
    params.push('public');
  }

  if (domain) {
    clauses.push('domain = ?');
    params.push(domain);
  }
  if (type) {
    clauses.push('type = ?');
    params.push(normalizeType(type));
  }

  const query = `
    SELECT *
    FROM records
    WHERE ${clauses.join(' AND ')}
    ORDER BY created_at DESC
    LIMIT ?
  `;
  params.push(limit);

  const rows = await env.DB.prepare(query).bind(...params).all();
  return ok({
    records: (rows.results || []).map(row => mapRecord(row))
  });
}

async function createRecord(request, env) {
  const session = await getSession(request, env);
  if (!session) return fail(401, 'UNAUTHORIZED', '请先登录');
  if (session.user.role !== 'owner') return fail(403, 'FORBIDDEN', '当前账号没有写入权限');
  if (!assertCsrf(request, session, env)) return fail(403, 'CSRF_FAILED', '请求校验失败');

  const body = await readJson(request);
  const content = String(body?.content || '').trim();
  if (!content) return fail(400, 'CONTENT_REQUIRED', '记录内容不能为空');

  const now = nowIso();
  const date = body.date || todayShanghai();
  const record = {
    id: crypto.randomUUID(),
    ownerId: session.user.id,
    date,
    createdAt: now,
    updatedAt: now,
    domain: normalizeDomain(body.domain),
    type: normalizeType(body.type),
    content,
    summary: String(body.summary || '').trim() || null,
    visibility: normalizeVisibility(body.visibility),
    mood: String(body.mood || '').trim() || null,
    energy: normalizeEnergy(body.energy),
    projects: Array.isArray(body.projects) ? body.projects : [],
    tags: Array.isArray(body.tags) ? body.tags : [],
    nextActions: Array.isArray(body.nextActions) ? body.nextActions : []
  };

  await env.DB.prepare(`
    INSERT INTO records (
      id, owner_id, date, created_at, updated_at, domain, type, raw_content, summary,
      visibility, mood, energy, projects_json, tags_json, next_actions_json, source
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'web')
  `).bind(
    record.id,
    record.ownerId,
    record.date,
    record.createdAt,
    record.updatedAt,
    record.domain,
    record.type,
    record.content,
    record.summary,
    record.visibility,
    record.mood,
    record.energy,
    toJsonText(record.projects),
    toJsonText(record.tags),
    toJsonText(record.nextActions)
  ).run();

  const recentRows = await env.DB.prepare(`
    SELECT date, raw_content, summary
    FROM records
    WHERE owner_id = ? AND deleted_at IS NULL AND id != ?
      AND (? IS NULL OR domain = ?)
    ORDER BY created_at DESC
    LIMIT 5
  `).bind(record.ownerId, record.id, record.domain, record.domain).all();

  const aiSuggestion = await generateCompanionSuggestion(env, record, recentRows.results || []);
  await insertSuggestion(env, record, aiSuggestion);
  const userState = await updateUserStateAfterRecord(env, record.ownerId, record.date);

  return ok({
    record: {
      id: record.id,
      date: record.date,
      createdAt: record.createdAt,
      domain: record.domain,
      type: record.type,
      content: record.content,
      visibility: record.visibility,
      mood: record.mood,
      energy: record.energy,
      projects: record.projects,
      tags: record.tags
    },
    aiSuggestion,
    userState
  }, { status: 201 });
}

async function updateRecord(request, env, id) {
  const session = await getOwnerSession(request, env);
  if (session instanceof Response) return session;
  if (!assertCsrf(request, session, env)) return fail(403, 'CSRF_FAILED', '请求校验失败');

  const body = await readJson(request);
  const existing = await env.DB.prepare('SELECT * FROM records WHERE id = ? AND owner_id = ? AND deleted_at IS NULL')
    .bind(id, session.user.id)
    .first();
  if (!existing) return fail(404, 'NOT_FOUND', '记录不存在');

  const content = body.content == null ? existing.raw_content : String(body.content).trim();
  if (!content) return fail(400, 'CONTENT_REQUIRED', '记录内容不能为空');

  await env.DB.prepare(`
    UPDATE records
    SET raw_content = ?, domain = ?, type = ?, visibility = ?, mood = ?, energy = ?,
        projects_json = ?, tags_json = ?, next_actions_json = ?, updated_at = ?
    WHERE id = ? AND owner_id = ?
  `).bind(
    content,
    body.domain == null ? existing.domain : normalizeDomain(body.domain),
    body.type == null ? existing.type : normalizeType(body.type),
    body.visibility == null ? existing.visibility : normalizeVisibility(body.visibility),
    body.mood == null ? existing.mood : String(body.mood || '').trim() || null,
    body.energy == null ? existing.energy : normalizeEnergy(body.energy),
    body.projects == null ? existing.projects_json : toJsonText(body.projects),
    body.tags == null ? existing.tags_json : toJsonText(body.tags),
    body.nextActions == null ? existing.next_actions_json : toJsonText(body.nextActions),
    nowIso(),
    id,
    session.user.id
  ).run();

  return ok({ id, updated: true });
}

async function deleteRecord(request, env, id) {
  const session = await getOwnerSession(request, env);
  if (session instanceof Response) return session;
  if (!assertCsrf(request, session, env)) return fail(403, 'CSRF_FAILED', '请求校验失败');

  await env.DB.prepare('UPDATE records SET deleted_at = ?, updated_at = ? WHERE id = ? AND owner_id = ?')
    .bind(nowIso(), nowIso(), id, session.user.id)
    .run();
  return ok({ id, deleted: true });
}

async function regenerateSuggestion(request, env, id) {
  const session = await getOwnerSession(request, env);
  if (session instanceof Response) return session;
  if (!assertCsrf(request, session, env)) return fail(403, 'CSRF_FAILED', '请求校验失败');

  const row = await env.DB.prepare('SELECT * FROM records WHERE id = ? AND owner_id = ? AND deleted_at IS NULL')
    .bind(id, session.user.id)
    .first();
  if (!row) return fail(404, 'NOT_FOUND', '记录不存在');

  const record = mapRecord(row);
  const aiSuggestion = await generateCompanionSuggestion(env, {
    id: record.id,
    ownerId: session.user.id,
    date: record.date,
    domain: record.domain,
    type: record.type,
    content: record.content,
    mood: record.mood,
    energy: record.energy
  });
  await insertSuggestion(env, { id: record.id, ownerId: session.user.id }, aiSuggestion);

  return ok({ aiSuggestion });
}

async function insertSuggestion(env, record, suggestion) {
  const now = nowIso();
  const id = crypto.randomUUID();
  await env.DB.prepare(`
    INSERT INTO ai_suggestions (
      id, record_id, owner_id, provider, model, status, summary, validation, emotional_read,
      possible_need, next_small_step, gentle_reminder, encouragement, suggested_tags_json,
      suggested_followups_json, raw_response_json, error_message, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    record.id,
    record.ownerId,
    suggestion.provider,
    suggestion.model,
    suggestion.status,
    suggestion.summary,
    suggestion.validation,
    suggestion.emotionalRead,
    suggestion.possibleNeed,
    suggestion.nextSmallStep,
    suggestion.gentleReminder,
    suggestion.encouragement,
    toJsonText(suggestion.suggestedTags),
    JSON.stringify(suggestion.suggestedFollowUps || []),
    suggestion.rawResponse ? JSON.stringify(suggestion.rawResponse) : null,
    suggestion.errorMessage,
    now,
    now
  ).run();

  return mapSuggestion({
    id,
    record_id: record.id,
    owner_id: record.ownerId,
    created_at: now,
    updated_at: now,
    ...suggestion
  });
}

async function getOwnerSession(request, env) {
  const session = await getSession(request, env);
  if (!session) return fail(401, 'UNAUTHORIZED', '请先登录');
  if (session.user.role !== 'owner') return fail(403, 'FORBIDDEN', '当前账号没有写入权限');
  return session;
}
