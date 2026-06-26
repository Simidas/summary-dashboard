import {
  mapPeriodReview,
  normalizePeriodReviewStatus,
  normalizePeriodType,
  nowIso,
  toJsonText
} from '../lib/db.js';
import { fail, ok, readJson } from '../lib/response.js';
import { assertCsrf, getSession } from '../lib/session.js';

export async function handlePeriodReviews(request, env) {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/period-reviews\/([^/]+)\/([^/]+)$/);
  if (!match) return fail(404, 'NOT_FOUND', 'Period review endpoint not found');

  const periodType = normalizePeriodType(match[1]);
  const periodKey = decodeURIComponent(match[2]);
  if (!periodType) return fail(400, 'PERIOD_TYPE_INVALID', '复盘周期不存在');
  if (!isValidPeriodKey(periodType, periodKey)) return fail(400, 'PERIOD_KEY_INVALID', '复盘周期格式不正确');

  if (request.method === 'GET') return getPeriodReview(request, env, periodType, periodKey);
  if (request.method === 'PUT') return putPeriodReview(request, env, periodType, periodKey);
  return fail(405, 'METHOD_NOT_ALLOWED', 'Method not allowed');
}

async function getPeriodReview(request, env, periodType, periodKey) {
  const session = await getSession(request, env);
  if (!session || session.user.role !== 'owner') return ok({ review: null });

  const row = await env.DB.prepare(`
    SELECT *
    FROM period_reviews
    WHERE owner_id = ? AND period_type = ? AND period_key = ?
    LIMIT 1
  `).bind(session.user.id, periodType, periodKey).first();

  return ok({ review: mapPeriodReview(row) });
}

async function putPeriodReview(request, env, periodType, periodKey) {
  const session = await getSession(request, env);
  if (!session) return fail(401, 'UNAUTHORIZED', '请先登录');
  if (session.user.role !== 'owner') return fail(403, 'FORBIDDEN', '当前账号没有写入权限');
  if (!assertCsrf(request, session, env)) return fail(403, 'CSRF_FAILED', '请求校验失败');

  const body = await readJson(request);
  const now = nowIso();

  await env.DB.prepare(`
    INSERT INTO period_reviews (
      id, owner_id, period_type, period_key, theme, summary, wins_json,
      blockers_json, next_actions_json, status, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(owner_id, period_type, period_key) DO UPDATE SET
      theme = excluded.theme,
      summary = excluded.summary,
      wins_json = excluded.wins_json,
      blockers_json = excluded.blockers_json,
      next_actions_json = excluded.next_actions_json,
      status = excluded.status,
      updated_at = excluded.updated_at
  `).bind(
    crypto.randomUUID(),
    session.user.id,
    periodType,
    periodKey,
    cleanText(body?.theme),
    cleanText(body?.summary),
    toJsonText(body?.wins),
    toJsonText(body?.blockers),
    toJsonText(body?.nextActions),
    normalizePeriodReviewStatus(body?.status),
    now,
    now
  ).run();

  const row = await env.DB.prepare(`
    SELECT *
    FROM period_reviews
    WHERE owner_id = ? AND period_type = ? AND period_key = ?
    LIMIT 1
  `).bind(session.user.id, periodType, periodKey).first();

  return ok({ review: mapPeriodReview(row) });
}

function cleanText(value) {
  const text = String(value || '').trim();
  return text || null;
}

function isValidPeriodKey(type, key) {
  if (type === 'weekly') return /^\d{4}-W\d{2}$/.test(key);
  if (type === 'monthly') return /^\d{4}-\d{2}$/.test(key);
  if (type === 'yearly') return /^\d{4}$/.test(key);
  return false;
}
