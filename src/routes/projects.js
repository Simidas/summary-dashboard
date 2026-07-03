import { fail, ok, readJson } from '../lib/response.js';
import { assertCsrf, getSession } from '../lib/session.js';
import {
  mapProject,
  mapRecord,
  normalizeProjectStatus,
  nowIso,
  slugifyProjectName
} from '../lib/db.js';

export async function handleProjects(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === '/api/projects' && request.method === 'GET') {
    return listProjects(request, env);
  }

  if (path === '/api/projects' && request.method === 'POST') {
    return createProject(request, env);
  }

  const match = path.match(/^\/api\/projects\/([^/]+)$/);
  if (match && request.method === 'GET') {
    return getProject(request, env, decodePathSegment(match[1]));
  }

  if (match && request.method === 'PATCH') {
    return updateProject(request, env, decodePathSegment(match[1]));
  }

  if (match && request.method === 'DELETE') {
    return deleteProject(request, env, decodePathSegment(match[1]));
  }

  return fail(404, 'NOT_FOUND', 'Projects endpoint not found');
}

async function listProjects(request, env) {
  const session = await getSession(request, env);
  if (!session || session.user.role !== 'owner') {
    return ok({ projects: [] });
  }

  const url = new URL(request.url);
  const includeClosed = url.searchParams.get('includeClosed') === 'true';
  const status = url.searchParams.get('status');
  const clauses = ['p.owner_id = ?', 'p.deleted_at IS NULL'];
  const params = [session.user.id];

  if (status) {
    clauses.push('p.status = ?');
    params.push(normalizeProjectStatus(status));
  } else if (!includeClosed) {
    clauses.push("p.status IN ('active', 'paused')");
  }

  const rows = await env.DB.prepare(`
    SELECT
      p.*,
      (
        SELECT COUNT(*)
        FROM records r
        WHERE r.owner_id = p.owner_id
          AND r.deleted_at IS NULL
          AND r.projects_json LIKE '%' || p.name || '%'
      ) AS record_count,
      (
        SELECT COUNT(*)
        FROM followups f
        WHERE f.owner_id = p.owner_id
          AND f.deleted_at IS NULL
          AND f.project = p.name
          AND f.status IN ('open', 'deferred')
      ) AS open_followups
    FROM projects p
    WHERE ${clauses.join(' AND ')}
    ORDER BY
      CASE p.status
        WHEN 'active' THEN 0
        WHEN 'paused' THEN 1
        WHEN 'completed' THEN 2
        ELSE 3
      END,
      p.updated_at DESC
  `).bind(...params).all();

  return ok({ projects: (rows.results || []).map(mapProject) });
}

async function getProject(request, env, slugOrId) {
  const session = await getSession(request, env);
  if (!session || session.user.role !== 'owner') {
    return fail(401, 'UNAUTHORIZED', '请先登录');
  }

  const project = await findProject(env, session.user.id, slugOrId);
  if (!project) return fail(404, 'NOT_FOUND', '项目不存在');

  const timeline = await env.DB.prepare(`
    SELECT *
    FROM records
    WHERE owner_id = ? AND deleted_at IS NULL AND projects_json LIKE ?
    ORDER BY created_at DESC
    LIMIT 50
  `).bind(session.user.id, `%${project.name.replace(/[%_]/g, '')}%`).all();

  return ok({
    project: mapProject(project),
    records: (timeline.results || []).map(row => mapRecord(row))
  });
}

async function createProject(request, env) {
  const session = await getOwnerSession(request, env);
  if (session instanceof Response) return session;
  if (!assertCsrf(request, session, env)) return fail(403, 'CSRF_FAILED', '请求校验失败');

  const body = await readJson(request);
  const name = String(body?.name || '').trim();
  if (!name) return fail(400, 'NAME_REQUIRED', '项目名称不能为空');

  const now = nowIso();
  const id = crypto.randomUUID();
  const slug = await uniqueSlug(env, session.user.id, body?.slug || slugifyProjectName(name));

  await env.DB.prepare(`
    INSERT INTO projects (
      id, owner_id, slug, name, summary, status, current_focus, next_action, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    session.user.id,
    slug,
    name,
    cleanText(body?.summary),
    normalizeProjectStatus(body?.status),
    cleanText(body?.currentFocus),
    cleanText(body?.nextAction),
    now,
    now
  ).run();

  const row = await env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(id).first();
  return ok({ project: mapProject(row) }, { status: 201 });
}

async function updateProject(request, env, slugOrId) {
  const session = await getOwnerSession(request, env);
  if (session instanceof Response) return session;
  if (!assertCsrf(request, session, env)) return fail(403, 'CSRF_FAILED', '请求校验失败');

  const existing = await findProject(env, session.user.id, slugOrId);
  if (!existing) return fail(404, 'NOT_FOUND', '项目不存在');

  const body = await readJson(request);
  const name = body?.name == null ? existing.name : String(body.name).trim();
  if (!name) return fail(400, 'NAME_REQUIRED', '项目名称不能为空');

  await env.DB.prepare(`
    UPDATE projects
    SET name = ?, summary = ?, status = ?, current_focus = ?, next_action = ?, updated_at = ?
    WHERE id = ? AND owner_id = ?
  `).bind(
    name,
    body?.summary == null ? existing.summary : cleanText(body.summary),
    body?.status == null ? existing.status : normalizeProjectStatus(body.status),
    body?.currentFocus == null ? existing.current_focus : cleanText(body.currentFocus),
    body?.nextAction == null ? existing.next_action : cleanText(body.nextAction),
    nowIso(),
    existing.id,
    session.user.id
  ).run();

  const row = await env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(existing.id).first();
  return ok({ project: mapProject(row) });
}

async function deleteProject(request, env, slugOrId) {
  const session = await getOwnerSession(request, env);
  if (session instanceof Response) return session;
  if (!assertCsrf(request, session, env)) return fail(403, 'CSRF_FAILED', '请求校验失败');

  const existing = await findProject(env, session.user.id, slugOrId);
  if (!existing) return fail(404, 'NOT_FOUND', '项目不存在');

  await env.DB.prepare('UPDATE projects SET deleted_at = ?, updated_at = ? WHERE id = ? AND owner_id = ?')
    .bind(nowIso(), nowIso(), existing.id, session.user.id)
    .run();

  return ok({ id: existing.id, deleted: true });
}

async function findProject(env, ownerId, slugOrId) {
  return env.DB.prepare(`
    SELECT *
    FROM projects
    WHERE owner_id = ? AND deleted_at IS NULL AND (id = ? OR slug = ?)
    LIMIT 1
  `).bind(ownerId, slugOrId, slugOrId).first();
}

async function uniqueSlug(env, ownerId, baseSlug) {
  let slug = baseSlug;
  let index = 2;
  while (await env.DB.prepare('SELECT id FROM projects WHERE owner_id = ? AND slug = ? LIMIT 1').bind(ownerId, slug).first()) {
    slug = `${baseSlug}-${index}`;
    index += 1;
  }
  return slug;
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

function decodePathSegment(value) {
  let decoded = String(value || '');
  for (let i = 0; i < 2; i += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch (error) {
      break;
    }
  }
  return decoded;
}
