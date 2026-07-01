import { generateCompanionSuggestion } from '../lib/ai-client.js';
import {
  mapRecord,
  mapSuggestion,
  normalizeContentStatus,
  normalizeDomain,
  normalizeEnergy,
  normalizeFollowupStatus,
  normalizeType,
  normalizeVisibility,
  nowIso,
  toJsonText,
  todayShanghai,
  updateUserStateAfterRecord
} from '../lib/db.js';
import { fail, ok, readJson } from '../lib/response.js';
import { assertCsrf, getSession } from '../lib/session.js';

export async function handleRecords(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === '/api/records' && request.method === 'GET') {
    return listRecords(request, env);
  }

  if (path === '/api/records' && request.method === 'POST') {
    return createRecord(request, env, ctx);
  }

  const regenerateMatch = path.match(/^\/api\/records\/([^/]+)\/ai\/regenerate$/);
  if (regenerateMatch && request.method === 'POST') {
    return regenerateSuggestion(request, env, regenerateMatch[1]);
  }

  const recordMatch = path.match(/^\/api\/records\/([^/]+)$/);
  if (recordMatch && request.method === 'GET') {
    return getRecord(request, env, recordMatch[1]);
  }
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
  const limit = Math.min(Number(url.searchParams.get('limit') || 20), 500);
  const domain = normalizeDomain(url.searchParams.get('domain'));
  const type = url.searchParams.get('type');
  const visibility = normalizeVisibility(url.searchParams.get('visibility') || 'public');
  const project = String(url.searchParams.get('project') || '').trim();
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
  if (project) {
    clauses.push('projects_json LIKE ?');
    params.push(`%${project.replace(/[%_]/g, '')}%`);
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
  const records = rows.results || [];
  const suggestions = await loadLatestSuggestionsForRecords(env, records.map(row => row.id));

  return ok({
    records: records.map(row => mapRecord(row, suggestions.get(row.id)))
  });
}

async function getRecord(request, env, id) {
  const session = await getSession(request, env);
  const clauses = ['id = ?', 'deleted_at IS NULL'];
  const params = [id];

  if (session?.user?.role === 'owner') {
    clauses.push('owner_id = ?');
    params.push(session.user.id);
  } else {
    clauses.push('visibility = ?');
    params.push('public');
  }

  const row = await env.DB.prepare(`
    SELECT *
    FROM records
    WHERE ${clauses.join(' AND ')}
    LIMIT 1
  `).bind(...params).first();
  if (!row) return fail(404, 'NOT_FOUND', '记录不存在');

  const suggestion = await loadLatestSuggestionForRecord(env, row.id);
  return ok({ record: mapRecord(row, suggestion) });
}

async function createRecord(request, env, ctx) {
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
    nextActions: Array.isArray(body.nextActions) ? body.nextActions : [],
    structuredPayload: buildStructuredPayload(body)
  };

  const validationError = await validateRecordInput(env, session.user.id, record, body);
  if (validationError) return validationError;

  await env.DB.prepare(`
    INSERT INTO records (
      id, owner_id, date, created_at, updated_at, domain, type, raw_content, summary,
      visibility, mood, energy, projects_json, tags_json, next_actions_json,
      structured_payload_json, ai_status, source
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'web')
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
    toJsonText(record.nextActions),
    JSON.stringify(record.structuredPayload)
  ).run();

  const destinations = await createInitialDestinations(env, record, body);
  scheduleSuggestionGeneration(ctx, env, record);
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
      tags: record.tags,
      structuredPayload: record.structuredPayload,
      aiStatus: 'pending',
      aiSuggestion: null
    },
    aiSuggestion: null,
    aiPending: true,
    destinations,
    userState
  }, { status: 201 });
}

function scheduleSuggestionGeneration(ctx, env, record) {
  const task = generateAndInsertSuggestion(env, record)
    .catch(error => console.error('Async AI suggestion failed', error));

  if (ctx?.waitUntil) {
    ctx.waitUntil(task);
  }
}

async function generateAndInsertSuggestion(env, record) {
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
        projects_json = ?, tags_json = ?, next_actions_json = ?, structured_payload_json = ?,
        updated_at = ?
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
    body.structuredPayload == null ? existing.structured_payload_json : JSON.stringify(sanitizeObject(body.structuredPayload)),
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
    energy: record.energy,
    projects: record.projects,
    tags: record.tags
  });
  await insertSuggestion(env, { id: record.id, ownerId: session.user.id, type: record.type }, aiSuggestion);

  return ok({ aiSuggestion });
}

async function insertSuggestion(env, record, suggestion) {
  const now = nowIso();
  const id = crypto.randomUUID();
  await env.DB.prepare(`
    INSERT INTO ai_suggestions (
      id, record_id, owner_id, provider, model, status, summary, validation, emotional_read,
      possible_need, next_small_step, gentle_reminder, encouragement, suggested_tags_json,
      suggested_followups_json, raw_response_json, error_message, record_type, prompt_version,
      structured_result_json, destination_suggestions_json, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    record.type || null,
    'companion-v2-type-aware',
    JSON.stringify(suggestion.structuredResult || {}),
    JSON.stringify(suggestion.destinationSuggestions || []),
    now,
    now
  ).run();

  await env.DB.prepare(`
    UPDATE records
    SET ai_status = ?, updated_at = ?
    WHERE id = ? AND owner_id = ?
  `).bind(
    suggestion.status === 'completed' ? 'completed' : 'failed',
    now,
    record.id,
    record.ownerId
  ).run();

  return mapSuggestion({
    id,
    record_id: record.id,
    owner_id: record.ownerId,
    created_at: now,
    updated_at: now,
    record_type: record.type || null,
    prompt_version: 'companion-v2-type-aware',
    structured_result_json: JSON.stringify(suggestion.structuredResult || {}),
    destination_suggestions_json: JSON.stringify(suggestion.destinationSuggestions || []),
    ...suggestion
  });
}

async function loadLatestSuggestionsForRecords(env, recordIds) {
  if (!recordIds.length) return new Map();

  const placeholders = recordIds.map(() => '?').join(', ');
  const rows = await env.DB.prepare(`
    SELECT s.*
    FROM ai_suggestions s
    JOIN (
      SELECT record_id, MAX(created_at) AS created_at
      FROM ai_suggestions
      WHERE record_id IN (${placeholders})
      GROUP BY record_id
    ) latest
      ON latest.record_id = s.record_id
     AND latest.created_at = s.created_at
  `).bind(...recordIds).all();

  return new Map((rows.results || []).map(row => [row.record_id, row]));
}

async function loadLatestSuggestionForRecord(env, recordId) {
  return env.DB.prepare(`
    SELECT *
    FROM ai_suggestions
    WHERE record_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).bind(recordId).first();
}

async function validateRecordInput(env, ownerId, record, body) {
  if (!record.domain) return fail(400, 'DOMAIN_REQUIRED', '请选择记录所属场景');
  if (!record.type) return fail(400, 'TYPE_REQUIRED', '请选择记录类型');

  if (record.type !== 'task') return null;

  const taskTitle = cleanText(body.taskTitle || record.structuredPayload.taskTitle || record.summary || firstLine(record.content));
  if (!taskTitle) return fail(400, 'TASK_TITLE_REQUIRED', '任务记录需要一个明确标题');

  const project = cleanText(record.projects[0]);
  if (!project) return null;

  const existing = await env.DB.prepare(`
    SELECT id
    FROM projects
    WHERE owner_id = ? AND name = ? AND deleted_at IS NULL
    LIMIT 1
  `).bind(ownerId, project).first();
  if (!existing) return fail(400, 'PROJECT_NOT_FOUND', '任务关联项目必须从已有项目中选择');

  return null;
}

async function createInitialDestinations(env, record, body) {
  const destinations = [];

  if (record.type === 'task') {
    const followup = await createFollowupFromRecord(env, record, body);
    if (followup) destinations.push({ type: 'followup', id: followup.id });
  }

  if (record.type === 'content_seed') {
    const item = await createContentItemFromRecord(env, record, body);
    if (item) destinations.push({ type: 'content', id: item.id });
  }

  return destinations;
}

async function createFollowupFromRecord(env, record, body) {
  const now = nowIso();
  const id = crypto.randomUUID();
  const title = cleanText(body.taskTitle || record.structuredPayload.taskTitle || record.summary || firstLine(record.content));
  if (!title) return null;

  await env.DB.prepare(`
    INSERT INTO followups (
      id, owner_id, text, domain, project, status, source_record_id, due_date,
      created_at, updated_at, closed_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    record.ownerId,
    title,
    record.domain,
    cleanText(record.projects[0]),
    normalizeFollowupStatus(body.status),
    record.id,
    cleanDate(body.dueDate || record.structuredPayload.dueDate),
    now,
    now,
    null
  ).run();

  return { id };
}

async function createContentItemFromRecord(env, record, body) {
  const now = nowIso();
  const id = crypto.randomUUID();
  const title = cleanText(body.title || record.structuredPayload.topic || record.summary || firstLine(record.content));
  if (!title) return null;

  await env.DB.prepare(`
    INSERT INTO content_items (
      id, owner_id, title, source_domain, status, angle, outline_json, tags_json,
      next_action, source_record_id, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    record.ownerId,
    title.slice(0, 80),
    record.domain,
    normalizeContentStatus(body.contentStatus),
    cleanText(body.angle || record.structuredPayload.angle),
    toJsonText(body.outline || record.structuredPayload.outline),
    toJsonText(record.tags),
    cleanText(record.nextActions[0]),
    record.id,
    now,
    now
  ).run();

  return { id };
}

function buildStructuredPayload(body) {
  return sanitizeObject({
    taskTitle: body?.taskTitle,
    dueDate: cleanDate(body?.dueDate),
    title: body?.title,
    angle: body?.angle,
    outline: Array.isArray(body?.outline) ? body.outline : [],
    noteKind: body?.noteKind
  });
}

function sanitizeObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item != null && item !== '')
      .map(([key, item]) => [key, Array.isArray(item) ? item.map(String).filter(Boolean) : item])
  );
}

function cleanText(value) {
  const text = String(value || '').trim();
  return text || null;
}

function cleanDate(value) {
  const text = cleanText(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text || '') ? text : null;
}

function firstLine(value) {
  return String(value || '').trim().split(/\n+/)[0]?.slice(0, 80) || '';
}

async function getOwnerSession(request, env) {
  const session = await getSession(request, env);
  if (!session) return fail(401, 'UNAUTHORIZED', '请先登录');
  if (session.user.role !== 'owner') return fail(403, 'FORBIDDEN', '当前账号没有写入权限');
  return session;
}
