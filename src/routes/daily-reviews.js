import {
  normalizeEnergy,
  nowIso,
  parseJsonText,
  toJsonText,
  todayShanghai,
  updateUserStateAfterActivity
} from '../lib/db.js';
import { fail, ok, readJson } from '../lib/response.js';
import { assertCsrf, getSession } from '../lib/session.js';

export async function handleDailyReviews(request, env) {
  const url = new URL(request.url);

  if (url.pathname === '/api/daily-reviews') {
    if (request.method === 'GET') return listDailyReviews(request, env);
    return fail(405, 'METHOD_NOT_ALLOWED', 'Method not allowed');
  }

  const match = url.pathname.match(/^\/api\/daily-reviews\/(\d{4}-\d{2}-\d{2}|today)$/);
  if (!match) return fail(404, 'NOT_FOUND', 'Daily review endpoint not found');

  const date = match[1] === 'today' ? todayShanghai() : match[1];
  if (request.method === 'GET') return getDailyReview(request, env, date);
  if (request.method === 'PUT') return putDailyReview(request, env, date);
  return fail(405, 'METHOD_NOT_ALLOWED', 'Method not allowed');
}

async function listDailyReviews(request, env) {
  const session = await getSession(request, env);
  if (!session || session.user.role !== 'owner') return fail(401, 'UNAUTHORIZED', '请先登录');

  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 30), 1), 500);
  const rows = await env.DB.prepare(`
    SELECT *
    FROM daily_reviews
    WHERE owner_id = ?
    ORDER BY date DESC
    LIMIT ?
  `).bind(session.user.id, limit).all();

  return ok({ reviews: (rows.results || []).map(mapDailyReview) });
}

async function getDailyReview(request, env, date) {
  const session = await getSession(request, env);
  if (!session || session.user.role !== 'owner') return fail(401, 'UNAUTHORIZED', '请先登录');

  const row = await env.DB.prepare('SELECT * FROM daily_reviews WHERE owner_id = ? AND date = ?')
    .bind(session.user.id, date)
    .first();
  return ok({ review: mapDailyReview(row) });
}

async function putDailyReview(request, env, date) {
  const session = await getSession(request, env);
  if (!session) return fail(401, 'UNAUTHORIZED', '请先登录');
  if (session.user.role !== 'owner') return fail(403, 'FORBIDDEN', '当前账号没有写入权限');
  if (!assertCsrf(request, session, env)) return fail(403, 'CSRF_FAILED', '请求校验失败');

  const body = await readJson(request);
  const now = nowIso();

  await env.DB.prepare(`
    INSERT INTO daily_reviews (
      id, owner_id, date, most_important_thing, wins_json, blockers_json,
      reflection, tomorrow_first_step, mood, energy, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(owner_id, date) DO UPDATE SET
      most_important_thing = excluded.most_important_thing,
      wins_json = excluded.wins_json,
      blockers_json = excluded.blockers_json,
      reflection = excluded.reflection,
      tomorrow_first_step = excluded.tomorrow_first_step,
      mood = excluded.mood,
      energy = excluded.energy,
      updated_at = excluded.updated_at
  `).bind(
    crypto.randomUUID(),
    session.user.id,
    date,
    String(body?.mostImportantThing || '').trim() || null,
    toJsonText(body?.wins),
    toJsonText(body?.blockers),
    String(body?.reflection || '').trim() || null,
    String(body?.tomorrowFirstStep || '').trim() || null,
    String(body?.mood || '').trim() || null,
    normalizeEnergy(body?.energy),
    now,
    now
  ).run();

  const row = await env.DB.prepare('SELECT * FROM daily_reviews WHERE owner_id = ? AND date = ?')
    .bind(session.user.id, date)
    .first();
  const userState = await updateUserStateAfterActivity(env, session.user.id, date);

  return ok({
    review: mapDailyReview(row),
    userState
  });
}

function mapDailyReview(row) {
  if (!row) return null;

  return {
    id: row.id,
    date: row.date,
    mostImportantThing: row.most_important_thing,
    wins: parseJsonText(row.wins_json),
    blockers: parseJsonText(row.blockers_json),
    reflection: row.reflection,
    tomorrowFirstStep: row.tomorrow_first_step,
    mood: row.mood,
    energy: row.energy,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
