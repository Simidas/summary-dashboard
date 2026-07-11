import {
  isActiveProjectStatus,
  mapFollowup,
  mapFollowupEvent,
  normalizeDomain,
  normalizeFollowupStatus,
  nowIso
} from '../lib/db.js';
import { fail, ok, readJson } from '../lib/response.js';
import { assertCsrf, getSession } from '../lib/session.js';
import { encodeCursor, parsePage } from '../lib/pagination.js';
import { validationResponse } from '../lib/schema.js';
import { validateFollowupBody } from '../services/input-schemas.js';
import { validateFollowupTransitionBody } from '../services/input-schemas.js';

export async function handleFollowups(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === '/api/followups' && request.method === 'GET') {
    return listFollowups(request, env);
  }

  if (path === '/api/followups' && request.method === 'POST') {
    return createFollowup(request, env);
  }

  const eventsMatch = path.match(/^\/api\/followups\/([^/]+)\/events$/);
  if (eventsMatch && request.method === 'GET') return listFollowupEvents(request, env, eventsMatch[1]);
  const transitionMatch = path.match(/^\/api\/followups\/([^/]+)\/transition$/);
  if (transitionMatch && request.method === 'POST') return transitionFollowup(request, env, transitionMatch[1]);

  const match = path.match(/^\/api\/followups\/([^/]+)$/);
  if (match && request.method === 'GET') return getFollowup(request, env, match[1]);
  if (match && request.method === 'PATCH') {
    return updateFollowup(request, env, match[1]);
  }

  if (match && request.method === 'DELETE') {
    return deleteFollowup(request, env, match[1]);
  }

  return fail(404, 'NOT_FOUND', 'Follow-up endpoint not found');
}

async function listFollowups(request, env) {
  const session = await getSession(request, env);
  if (!session || session.user.role !== 'owner') return ok({ followups: [] });

  const url = new URL(request.url);
  const status = url.searchParams.get('status') || 'open';
  const domain = normalizeDomain(url.searchParams.get('domain'));
  const project = cleanText(url.searchParams.get('project'));
  const { limit, cursor } = parsePage(url, { defaultLimit: 100, maxLimit: 200 });
  const clauses = ['owner_id = ?', 'deleted_at IS NULL'];
  const params = [session.user.id];

  if (status !== 'all') {
    clauses.push('status = ?');
    params.push(normalizeFollowupStatus(status));
  }

  if (domain) {
    clauses.push('domain = ?');
    params.push(domain);
  }

  if (project) {
    clauses.push('project = ?');
    params.push(project);
  }

  const cursorClause = Number.isInteger(cursor?.statusRank) && cursor?.sortDue && cursor?.updatedAt && cursor?.id
    ? `WHERE (sort_status > ? OR (sort_status = ? AND (
        sort_due > ? OR (sort_due = ? AND (updated_at < ? OR (updated_at = ? AND id < ?)))
      )))`
    : '';
  if (cursorClause) {
    params.push(cursor.statusRank, cursor.statusRank, cursor.sortDue, cursor.sortDue,
      cursor.updatedAt, cursor.updatedAt, cursor.id);
  }
  const rows = await env.DB.prepare(`
    WITH ranked AS (
      SELECT *,
        CASE status WHEN 'open' THEN 0 WHEN 'deferred' THEN 1 WHEN 'closed' THEN 2 ELSE 3 END AS sort_status,
        COALESCE(due_date, updated_at) AS sort_due
      FROM followups
      WHERE ${clauses.join(' AND ')}
    )
    SELECT * FROM ranked
    ${cursorClause}
    ORDER BY
      sort_status ASC, sort_due ASC, updated_at DESC, id DESC
    LIMIT ?
  `).bind(...params, limit + 1).all();

  const result = rows.results || [];
  const hasMore = result.length > limit;
  const pageRows = hasMore ? result.slice(0, limit) : result;
  const last = pageRows.at(-1);
  return ok({ followups: pageRows.map(mapFollowup), page: {
    limit, hasMore, nextCursor: hasMore && last ? encodeCursor({
      statusRank: last.sort_status, sortDue: last.sort_due, updatedAt: last.updated_at, id: last.id
    }) : null
  } });
}

async function createFollowup(request, env) {
  const session = await getOwnerSession(request, env);
  if (session instanceof Response) return session;
  if (!assertCsrf(request, session, env)) return fail(403, 'CSRF_FAILED', '请求校验失败');

  let body;
  try { body = validateFollowupBody(await readJson(request)); }
  catch (error) { return validationResponse(error, fail); }
  const text = cleanText(body?.text);
  if (!text) return fail(400, 'TEXT_REQUIRED', '待办内容不能为空');

  const now = nowIso();
  const status = normalizeFollowupStatus(body?.status);
  if (isClosedStatus(status)) {
    return fail(400, 'INITIAL_STATUS_INVALID', '新待办不能直接创建为已结束状态');
  }
  const closedAt = isClosedStatus(status) ? now : null;
  const id = crypto.randomUUID();
  const project = cleanText(body?.project);
  const projectError = await validateActiveProjectName(env, session.user.id, project);
  if (projectError) return projectError;

  await env.DB.batch([env.DB.prepare(`
    INSERT INTO followups (
      id, owner_id, text, note, domain, project, status, source_record_id, source_type,
      due_date, created_at, updated_at, closed_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    session.user.id,
    text,
    cleanText(body?.note),
    normalizeDomain(body?.domain),
    project,
    status,
    cleanText(body?.sourceRecordId),
    body?.sourceRecordId ? 'record' : 'manual',
    cleanDate(body?.dueDate),
    now,
    now,
    closedAt
  ), env.DB.prepare(`
    INSERT INTO followup_events (
      id, owner_id, followup_id, event_type, from_status, to_status, note, metadata_json, created_at
    ) VALUES (?, ?, ?, 'created', NULL, ?, ?, '{}', ?)
  `).bind(crypto.randomUUID(), session.user.id, id, status, cleanText(body?.note), now)]);

  const row = await env.DB.prepare('SELECT * FROM followups WHERE id = ?').bind(id).first();
  return ok({ followup: mapFollowup(row) }, { status: 201 });
}

async function updateFollowup(request, env, id) {
  const session = await getOwnerSession(request, env);
  if (session instanceof Response) return session;
  if (!assertCsrf(request, session, env)) return fail(403, 'CSRF_FAILED', '请求校验失败');

  const existing = await env.DB.prepare(`
    SELECT *
    FROM followups
    WHERE id = ? AND owner_id = ? AND deleted_at IS NULL
    LIMIT 1
  `).bind(id, session.user.id).first();
  if (!existing) return fail(404, 'NOT_FOUND', '待办不存在');

  let body;
  try { body = validateFollowupBody(await readJson(request), { required: false }); }
  catch (error) { return validationResponse(error, fail); }
  if (body?.status != null) {
    return fail(400, 'USE_TRANSITION_ENDPOINT', '状态变化请使用 transition 接口');
  }
  const text = body?.text == null ? existing.text : cleanText(body.text);
  if (!text) return fail(400, 'TEXT_REQUIRED', '待办内容不能为空');

  const status = existing.status;
  const note = body?.note == null ? existing.note : cleanText(body.note);
  const project = body?.project == null ? existing.project : cleanText(body.project);
  const projectError = await validateActiveProjectName(env, session.user.id, project);
  if (projectError) return projectError;
  const now = nowIso();
  const closedAt = isClosedStatus(status)
    ? existing.closed_at || now
    : null;

  await env.DB.batch([env.DB.prepare(`
    UPDATE followups
    SET text = ?, note = ?, domain = ?, project = ?, status = ?, due_date = ?, updated_at = ?, closed_at = ?
    WHERE id = ? AND owner_id = ?
  `).bind(
    text,
    note,
    body?.domain == null ? existing.domain : normalizeDomain(body.domain),
    project,
    status,
    body?.dueDate == null ? existing.due_date : cleanDate(body.dueDate),
    now,
    closedAt,
    id,
    session.user.id
  ), env.DB.prepare(`
    INSERT INTO followup_events (
      id, owner_id, followup_id, event_type, from_status, to_status, note, metadata_json, created_at
    ) VALUES (?, ?, ?, 'updated', ?, ?, ?, ?, ?)
  `).bind(
    crypto.randomUUID(), session.user.id, id, existing.status, existing.status,
    cleanText(body?.note), JSON.stringify({ fields: Object.keys(body || {}) }), now
  )]);

  const row = await env.DB.prepare('SELECT * FROM followups WHERE id = ?').bind(id).first();
  return ok({ followup: mapFollowup(row) });
}

async function deleteFollowup(request, env, id) {
  const session = await getOwnerSession(request, env);
  if (session instanceof Response) return session;
  if (!assertCsrf(request, session, env)) return fail(403, 'CSRF_FAILED', '请求校验失败');

  await env.DB.prepare(`
    UPDATE followups
    SET deleted_at = ?, updated_at = ?
    WHERE id = ? AND owner_id = ?
  `).bind(nowIso(), nowIso(), id, session.user.id).run();

  return ok({ id, deleted: true });
}

async function getFollowup(request, env, id) {
  const session = await getOwnerSession(request, env);
  if (session instanceof Response) return session;
  const row = await findFollowup(env, session.user.id, id);
  if (!row) return fail(404, 'NOT_FOUND', '待办不存在');
  const events = await env.DB.prepare(`
    SELECT * FROM followup_events WHERE owner_id = ? AND followup_id = ? ORDER BY created_at DESC
  `).bind(session.user.id, id).all();
  return ok({ followup: mapFollowup(row), events: (events.results || []).map(mapFollowupEvent) });
}

async function listFollowupEvents(request, env, id) {
  const session = await getOwnerSession(request, env);
  if (session instanceof Response) return session;
  const row = await findFollowup(env, session.user.id, id);
  if (!row) return fail(404, 'NOT_FOUND', '待办不存在');
  const events = await env.DB.prepare(`
    SELECT * FROM followup_events WHERE owner_id = ? AND followup_id = ? ORDER BY created_at DESC
  `).bind(session.user.id, id).all();
  return ok({ events: (events.results || []).map(mapFollowupEvent) });
}

async function transitionFollowup(request, env, id) {
  const session = await getOwnerSession(request, env);
  if (session instanceof Response) return session;
  if (!assertCsrf(request, session, env)) return fail(403, 'CSRF_FAILED', '请求校验失败');
  const existing = await findFollowup(env, session.user.id, id);
  if (!existing) return fail(404, 'NOT_FOUND', '待办不存在');

  let body;
  try { body = validateFollowupTransitionBody(await readJson(request)); }
  catch (error) { return validationResponse(error, fail); }
  const status = body.status;
  const ending = isClosedStatus(status);
  if (ending && !body.outcomeType) {
    return fail(400, 'OUTCOME_REQUIRED', '结束待办时必须选择结果类型');
  }
  if (!ending && body.outcomeType) {
    return fail(400, 'OUTCOME_NOT_ALLOWED', '未结束的待办不能设置结果类型');
  }
  if (body.outcomeType === 'replaced') {
    if (!body.replacedByFollowupId || body.replacedByFollowupId === id) {
      return fail(400, 'REPLACEMENT_REQUIRED', '请选择有效的替代事项');
    }
    const replacement = await findFollowup(env, session.user.id, body.replacedByFollowupId);
    if (!replacement) return fail(400, 'REPLACEMENT_NOT_FOUND', '替代事项不存在');
  }

  const now = nowIso();
  const dueDate = body.dueDate ?? existing.due_date;
  const deferCount = status === 'deferred' && existing.status !== 'deferred'
    ? Number(existing.defer_count || 0) + 1 : Number(existing.defer_count || 0);
  const eventType = status === 'deferred' ? 'deferred'
    : status === 'closed' ? 'closed'
      : status === 'dropped' ? 'dropped'
        : existing.status === 'closed' || existing.status === 'dropped' ? 'reopened' : 'status_changed';

  await env.DB.batch([env.DB.prepare(`
    UPDATE followups SET status = ?, outcome_type = ?, outcome_note = ?, completed_at = ?,
      replaced_by_followup_id = ?, defer_count = ?, due_date = ?, closed_at = ?, updated_at = ?
    WHERE id = ? AND owner_id = ?
  `).bind(
    status, ending ? body.outcomeType : null, ending ? body.outcomeNote || null : null,
    ending ? now : null, ending ? body.replacedByFollowupId || null : null,
    deferCount, dueDate, ending ? now : null, now, id, session.user.id
  ), env.DB.prepare(`
    INSERT INTO followup_events (
      id, owner_id, followup_id, event_type, from_status, to_status, note, metadata_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    crypto.randomUUID(), session.user.id, id, eventType, existing.status, status,
    body.note || body.outcomeNote || null,
    JSON.stringify({ outcomeType: body.outcomeType || null, dueDate, deferCount,
      replacedByFollowupId: body.replacedByFollowupId || null }), now
  )]);

  return ok({ followup: mapFollowup(await findFollowup(env, session.user.id, id)) });
}

function findFollowup(env, ownerId, id) {
  return env.DB.prepare(`
    SELECT * FROM followups WHERE id = ? AND owner_id = ? AND deleted_at IS NULL LIMIT 1
  `).bind(id, ownerId).first();
}

async function getOwnerSession(request, env) {
  const session = await getSession(request, env);
  if (!session) return fail(401, 'UNAUTHORIZED', '请先登录');
  if (session.user.role !== 'owner') return fail(403, 'FORBIDDEN', '当前账号没有写入权限');
  return session;
}

function isClosedStatus(status) {
  return status === 'closed' || status === 'dropped';
}

async function validateActiveProjectName(env, ownerId, projectName) {
  if (!projectName) return null;

  const project = await env.DB.prepare(`
    SELECT status
    FROM projects
    WHERE owner_id = ? AND deleted_at IS NULL AND name = ?
    LIMIT 1
  `).bind(ownerId, projectName).first();

  if (!project) return fail(400, 'PROJECT_NOT_FOUND', '关联项目必须从已有可用项目中选择');
  if (!isActiveProjectStatus(project.status)) {
    return fail(400, 'PROJECT_CLOSED', '完成或废弃的项目不能继续关联新待办');
  }
  return null;
}

function cleanText(value) {
  const text = String(value || '').trim();
  return text || null;
}

function cleanDate(value) {
  const text = cleanText(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text || '') ? text : null;
}
