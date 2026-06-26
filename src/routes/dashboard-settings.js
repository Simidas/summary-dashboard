import { fail, ok, readJson } from '../lib/response.js';
import { assertCsrf, getSession } from '../lib/session.js';
import { nowIso } from '../lib/db.js';

export async function handleDashboardSettings(request, env) {
  if (request.method === 'GET') return getDashboardSettings(request, env);
  if (request.method === 'PATCH' || request.method === 'PUT') return updateDashboardSettings(request, env);
  return fail(405, 'METHOD_NOT_ALLOWED', 'Method not allowed');
}

export async function loadDashboardSettings(env, ownerId) {
  if (!ownerId) return null;
  return env.DB.prepare('SELECT * FROM dashboard_settings WHERE owner_id = ?').bind(ownerId).first();
}

async function getDashboardSettings(request, env) {
  const session = await getSession(request, env);
  if (!session || session.user.role !== 'owner') {
    return fail(401, 'UNAUTHORIZED', '请先登录');
  }

  const row = await loadDashboardSettings(env, session.user.id);
  return ok({ settings: mapSettings(row) });
}

async function updateDashboardSettings(request, env) {
  const session = await getSession(request, env);
  if (!session) return fail(401, 'UNAUTHORIZED', '请先登录');
  if (session.user.role !== 'owner') return fail(403, 'FORBIDDEN', '当前账号没有写入权限');
  if (!assertCsrf(request, session, env)) return fail(403, 'CSRF_FAILED', '请求校验失败');

  const body = await readJson(request);
  const now = nowIso();
  await env.DB.prepare(`
    INSERT INTO dashboard_settings (owner_id, today_focus, tomorrow_first_step, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(owner_id) DO UPDATE SET
      today_focus = excluded.today_focus,
      tomorrow_first_step = excluded.tomorrow_first_step,
      updated_at = excluded.updated_at
  `).bind(
    session.user.id,
    cleanText(body?.todayFocus),
    cleanText(body?.tomorrowFirstStep),
    now
  ).run();

  const row = await loadDashboardSettings(env, session.user.id);
  return ok({ settings: mapSettings(row) });
}

export function mapSettings(row) {
  if (!row) {
    return {
      todayFocus: '',
      tomorrowFirstStep: '',
      updatedAt: null
    };
  }

  return {
    todayFocus: row.today_focus || '',
    tomorrowFirstStep: row.tomorrow_first_step || '',
    updatedAt: row.updated_at
  };
}

function cleanText(value) {
  const text = String(value || '').trim();
  return text || null;
}
