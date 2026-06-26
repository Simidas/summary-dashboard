import { mapFollowup, mapRecord, mapSuggestion, parseJsonText, todayShanghai } from '../lib/db.js';
import { ok } from '../lib/response.js';
import { getSession } from '../lib/session.js';
import { loadDashboardSettings, mapSettings } from './dashboard-settings.js';

export async function handleDashboard(request, env) {
  const session = await getSession(request, env);
  if (!session || session.user.role !== 'owner') {
    return publicDashboard(env);
  }

  const ownerId = session.user.id;
  const today = todayShanghai();
  const todayRow = await env.DB.prepare(`
    SELECT COUNT(*) AS count
    FROM records
    WHERE owner_id = ? AND date = ? AND deleted_at IS NULL
  `).bind(ownerId, today).first();

  const latest = await env.DB.prepare(`
    SELECT *
    FROM records
    WHERE owner_id = ? AND deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1
  `).bind(ownerId).first();

  const latestSuggestion = latest
    ? await env.DB.prepare(`
        SELECT *
        FROM ai_suggestions
        WHERE record_id = ?
        ORDER BY created_at DESC
        LIMIT 1
      `).bind(latest.id).first()
    : null;

  const dailyReview = await env.DB.prepare(`
    SELECT *
    FROM daily_reviews
    WHERE owner_id = ? AND date = ?
    LIMIT 1
  `).bind(ownerId, today).first();

  const state = await env.DB.prepare('SELECT * FROM user_state WHERE owner_id = ?')
    .bind(ownerId)
    .first();
  const settingsRow = await loadDashboardSettings(env, ownerId);
  const settings = mapSettings(settingsRow);
  const followups = await env.DB.prepare(`
    SELECT *
    FROM followups
    WHERE owner_id = ? AND deleted_at IS NULL AND status IN ('open', 'deferred')
    ORDER BY
      CASE status WHEN 'open' THEN 0 ELSE 1 END,
      COALESCE(due_date, updated_at) ASC,
      updated_at DESC
    LIMIT 10
  `).bind(ownerId).all();

  const weekStart = getShanghaiWeekStart();
  const weekCount = await env.DB.prepare(`
    SELECT COUNT(DISTINCT date) AS count
    FROM records
    WHERE owner_id = ? AND date >= ? AND deleted_at IS NULL
  `).bind(ownerId, weekStart).first();

  const suggestion = latestSuggestion ? mapSuggestion(latestSuggestion) : null;
  const nextSmallStep = settings.tomorrowFirstStep
    || suggestion?.nextSmallStep
    || dailyReview?.tomorrow_first_step
    || '先写下一句真实状态，不需要完整复盘。';

  return ok({
    mode: 'owner',
    today,
    settings,
    hasRecordedToday: Number(todayRow?.count || 0) > 0,
    latestRecord: latest ? mapRecord(latest, latestSuggestion) : null,
    nextSmallStep,
    followups: (followups.results || []).map(mapFollowup),
    dailyReview: dailyReview ? {
      id: dailyReview.id,
      date: dailyReview.date,
      mostImportantThing: dailyReview.most_important_thing,
      wins: parseJsonText(dailyReview.wins_json),
      blockers: parseJsonText(dailyReview.blockers_json),
      reflection: dailyReview.reflection,
      tomorrowFirstStep: dailyReview.tomorrow_first_step,
      mood: dailyReview.mood,
      energy: dailyReview.energy
    } : null,
    userState: {
      totalRecords: Number(state?.total_records || 0),
      currentStreakDays: Number(state?.current_streak_days || 0),
      longestStreakDays: Number(state?.longest_streak_days || 0),
      level: Number(state?.level || 1),
      xp: Number(state?.xp || 0),
      thisWeekRecordDays: Number(weekCount?.count || 0)
    }
  });
}

async function publicDashboard(env) {
  const publicCount = await env.DB.prepare(`
    SELECT COUNT(*) AS count
    FROM records
    WHERE visibility = 'public' AND deleted_at IS NULL
  `).first();

  const latest = await env.DB.prepare(`
    SELECT *
    FROM records
    WHERE visibility = 'public' AND deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1
  `).first();

  return ok({
    mode: 'visitor',
    today: todayShanghai(),
    publicRecordCount: Number(publicCount?.count || 0),
    latestPublicRecord: latest ? mapRecord(latest) : null
  });
}

function getShanghaiWeekStart() {
  const now = new Date();
  const shanghaiDate = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
  const day = shanghaiDate.getDay() || 7;
  shanghaiDate.setDate(shanghaiDate.getDate() - day + 1);
  return shanghaiDate.toISOString().slice(0, 10);
}
