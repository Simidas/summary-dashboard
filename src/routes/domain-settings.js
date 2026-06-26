import { mapDomainSettings, normalizeDomain, nowIso } from '../lib/db.js';
import { fail, ok, readJson } from '../lib/response.js';
import { assertCsrf, getSession } from '../lib/session.js';

export async function handleDomainSettings(request, env) {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/domain-settings\/([^/]+)$/);
  if (!match) return fail(404, 'NOT_FOUND', 'Domain settings endpoint not found');

  const domain = normalizeDomain(decodeURIComponent(match[1]));
  if (!domain) return fail(400, 'DOMAIN_INVALID', '场景不存在');

  if (request.method === 'GET') return getDomainSettings(request, env, domain);
  if (request.method === 'PATCH') return updateDomainSettings(request, env, domain);
  return fail(405, 'METHOD_NOT_ALLOWED', 'Method not allowed');
}

async function getDomainSettings(request, env, domain) {
  const session = await getSession(request, env);
  if (!session || session.user.role !== 'owner') return ok({ settings: mapDomainSettings(null, domain) });

  const row = await env.DB.prepare(`
    SELECT *
    FROM domain_settings
    WHERE owner_id = ? AND domain = ?
    LIMIT 1
  `).bind(session.user.id, domain).first();

  return ok({ settings: mapDomainSettings(row, domain) });
}

async function updateDomainSettings(request, env, domain) {
  const session = await getSession(request, env);
  if (!session) return fail(401, 'UNAUTHORIZED', '请先登录');
  if (session.user.role !== 'owner') return fail(403, 'FORBIDDEN', '当前账号没有写入权限');
  if (!assertCsrf(request, session, env)) return fail(403, 'CSRF_FAILED', '请求校验失败');

  const body = await readJson(request);
  const now = nowIso();

  await env.DB.prepare(`
    INSERT INTO domain_settings (owner_id, domain, current_focus, next_action, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(owner_id, domain) DO UPDATE SET
      current_focus = excluded.current_focus,
      next_action = excluded.next_action,
      updated_at = excluded.updated_at
  `).bind(
    session.user.id,
    domain,
    cleanText(body?.currentFocus),
    cleanText(body?.nextAction),
    now
  ).run();

  const row = await env.DB.prepare(`
    SELECT *
    FROM domain_settings
    WHERE owner_id = ? AND domain = ?
    LIMIT 1
  `).bind(session.user.id, domain).first();

  return ok({ settings: mapDomainSettings(row, domain) });
}

function cleanText(value) {
  const text = String(value || '').trim();
  return text || null;
}
