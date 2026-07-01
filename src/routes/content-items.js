import {
  mapContentItem,
  normalizeContentStatus,
  normalizeDomain,
  nowIso,
  toJsonText
} from '../lib/db.js';
import { fail, ok, readJson } from '../lib/response.js';
import { assertCsrf, getSession } from '../lib/session.js';

export async function handleContentItems(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === '/api/content-items' && request.method === 'GET') {
    return listContentItems(request, env);
  }

  if (path === '/api/content-items' && request.method === 'POST') {
    return createContentItem(request, env);
  }

  const match = path.match(/^\/api\/content-items\/([^/]+)$/);
  if (match && request.method === 'PATCH') {
    return updateContentItem(request, env, match[1]);
  }

  if (match && request.method === 'DELETE') {
    return deleteContentItem(request, env, match[1]);
  }

  return fail(404, 'NOT_FOUND', 'Content endpoint not found');
}

async function listContentItems(request, env) {
  const session = await getSession(request, env);
  if (!session || session.user.role !== 'owner') return ok({ items: [] });

  const url = new URL(request.url);
  const status = url.searchParams.get('status');
  const domain = normalizeDomain(url.searchParams.get('domain'));
  const limit = Math.min(Number(url.searchParams.get('limit') || 100), 200);
  const clauses = ['owner_id = ?', 'deleted_at IS NULL'];
  const params = [session.user.id];

  if (status && status !== 'all') {
    clauses.push('status = ?');
    params.push(normalizeContentStatus(status));
  }

  if (domain) {
    clauses.push('source_domain = ?');
    params.push(domain);
  }

  const rows = await env.DB.prepare(`
    SELECT *
    FROM content_items
    WHERE ${clauses.join(' AND ')}
    ORDER BY updated_at DESC
    LIMIT ?
  `).bind(...params, limit).all();

  return ok({ items: (rows.results || []).map(mapContentItem) });
}

async function createContentItem(request, env) {
  const session = await getOwnerSession(request, env);
  if (session instanceof Response) return session;
  if (!assertCsrf(request, session, env)) return fail(403, 'CSRF_FAILED', '请求校验失败');

  const body = await readJson(request);
  const title = cleanText(body?.title);
  if (!title) return fail(400, 'TITLE_REQUIRED', '内容标题不能为空');

  const now = nowIso();
  const id = crypto.randomUUID();
  await env.DB.prepare(`
    INSERT INTO content_items (
      id, owner_id, title, source_domain, status, angle, outline_json, tags_json,
      next_action, source_record_id, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    session.user.id,
    title,
    normalizeDomain(body?.sourceDomain),
    normalizeContentStatus(body?.status),
    cleanText(body?.angle),
    toJsonText(body?.outline),
    toJsonText(body?.tags),
    cleanText(body?.nextAction),
    cleanText(body?.sourceRecordId),
    now,
    now
  ).run();

  const row = await env.DB.prepare('SELECT * FROM content_items WHERE id = ?').bind(id).first();
  return ok({ item: mapContentItem(row) }, { status: 201 });
}

async function updateContentItem(request, env, id) {
  const session = await getOwnerSession(request, env);
  if (session instanceof Response) return session;
  if (!assertCsrf(request, session, env)) return fail(403, 'CSRF_FAILED', '请求校验失败');

  const existing = await env.DB.prepare(`
    SELECT *
    FROM content_items
    WHERE id = ? AND owner_id = ? AND deleted_at IS NULL
    LIMIT 1
  `).bind(id, session.user.id).first();
  if (!existing) return fail(404, 'NOT_FOUND', '内容素材不存在');

  const body = await readJson(request);
  const title = body?.title == null ? existing.title : cleanText(body.title);
  if (!title) return fail(400, 'TITLE_REQUIRED', '内容标题不能为空');

  await env.DB.prepare(`
    UPDATE content_items
    SET title = ?, source_domain = ?, status = ?, angle = ?, outline_json = ?,
        tags_json = ?, next_action = ?, source_record_id = ?, updated_at = ?
    WHERE id = ? AND owner_id = ?
  `).bind(
    title,
    body?.sourceDomain == null ? existing.source_domain : normalizeDomain(body.sourceDomain),
    body?.status == null ? existing.status : normalizeContentStatus(body.status),
    body?.angle == null ? existing.angle : cleanText(body.angle),
    body?.outline == null ? existing.outline_json : toJsonText(body.outline),
    body?.tags == null ? existing.tags_json : toJsonText(body.tags),
    body?.nextAction == null ? existing.next_action : cleanText(body.nextAction),
    body?.sourceRecordId == null ? existing.source_record_id : cleanText(body.sourceRecordId),
    nowIso(),
    id,
    session.user.id
  ).run();

  const row = await env.DB.prepare('SELECT * FROM content_items WHERE id = ?').bind(id).first();
  return ok({ item: mapContentItem(row) });
}

async function deleteContentItem(request, env, id) {
  const session = await getOwnerSession(request, env);
  if (session instanceof Response) return session;
  if (!assertCsrf(request, session, env)) return fail(403, 'CSRF_FAILED', '请求校验失败');

  await env.DB.prepare(`
    UPDATE content_items
    SET deleted_at = ?, updated_at = ?
    WHERE id = ? AND owner_id = ?
  `).bind(nowIso(), nowIso(), id, session.user.id).run();

  return ok({ id, deleted: true });
}

async function getOwnerSession(request, env) {
  const session = await getSession(request, env);
  if (!session) return fail(401, 'UNAUTHORIZED', '请先登录');
  if (session.user.role !== 'owner') return fail(403, 'FORBIDDEN', '当前账号没有写入权限');
  return session;
}

function cleanText(value) {
  const text = String(value || '').trim();
  return text || null;
}
