import { calculateUserActivityStats, mapFollowup, mapRecord, mapSuggestion, parseJsonText, todayShanghai } from '../lib/db.js';
import { ok } from '../lib/response.js';
import { getSession } from '../lib/session.js';

const SUGGESTION_SELECT = [
  'id',
  'record_id',
  'owner_id',
  'provider',
  'model',
  'status',
  'summary',
  'validation',
  'emotional_read',
  'possible_need',
  'next_small_step',
  'gentle_reminder',
  'encouragement',
  'suggested_tags_json',
  'suggested_followups_json',
  'error_message',
  'record_type',
  'prompt_version',
  'structured_result_json',
  'destination_suggestions_json',
  'created_at',
  'updated_at'
].join(', ');

export async function handleDashboard(request, env) {
  const session = await getSession(request, env);
  if (!session || session.user.role !== 'owner') {
    return publicDashboard(env);
  }

  const ownerId = session.user.id;
  const today = todayShanghai();
  const todayRow = await env.DB.prepare(`
    SELECT
      (SELECT COUNT(*) FROM records WHERE owner_id = ? AND date = ? AND deleted_at IS NULL)
      + (SELECT COUNT(*) FROM daily_reviews WHERE owner_id = ? AND date = ?) AS count
  `).bind(ownerId, today, ownerId, today).first();

  const latest = await env.DB.prepare(`
    SELECT *
    FROM records
    WHERE owner_id = ? AND deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1
  `).bind(ownerId).first();

  const latestSuggestion = latest ? await loadLatestSuggestion(env, latest.id) : null;

  const dailyReview = await env.DB.prepare(`
    SELECT *
    FROM daily_reviews
    WHERE owner_id = ? AND date = ?
    LIMIT 1
  `).bind(ownerId, today).first();

  const state = await env.DB.prepare('SELECT * FROM user_state WHERE owner_id = ?')
    .bind(ownerId)
    .first();
  const computedState = await calculateUserActivityStats(env, ownerId, today);
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
    SELECT COUNT(*) AS count
    FROM (
      SELECT date FROM records WHERE owner_id = ? AND date >= ? AND deleted_at IS NULL
      UNION
      SELECT date FROM daily_reviews WHERE owner_id = ? AND date >= ?
    )
  `).bind(ownerId, weekStart, ownerId, weekStart).first();

  const suggestion = latestSuggestion ? mapSuggestion(latestSuggestion) : null;
  const latestRecord = latest ? mapRecord(latest, latestSuggestion) : null;
  const followupItems = (followups.results || []).map(mapFollowup);
  const focus = deriveTodayFocus({ dailyReview, latestRecord, suggestion });
  const nextStep = deriveNextSmallStep({ dailyReview, latestRecord, suggestion, followups: followupItems });

  return ok({
    mode: 'owner',
    today,
    hasRecordedToday: Number(todayRow?.count || 0) > 0,
    latestRecord,
    todayFocus: focus.text,
    todayFocusSource: focus.source,
    nextSmallStep: nextStep.text,
    nextSmallStepSource: nextStep.source,
    followups: followupItems,
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
      totalRecords: computedState.totalRecords,
      currentStreakDays: computedState.currentStreakDays,
      longestStreakDays: Math.max(Number(state?.longest_streak_days || 0), computedState.longestStreakDays),
      streakBreakPenalty: computedState.streakBreakPenalty,
      level: computedState.level,
      xp: computedState.xp,
      thisWeekRecordDays: Number(weekCount?.count || 0)
    }
  });
}

async function loadLatestSuggestion(env, recordId) {
  try {
    return await env.DB.prepare(`
      SELECT ${SUGGESTION_SELECT}
      FROM ai_suggestions
      WHERE record_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).bind(recordId).first();
  } catch (error) {
    console.error('Failed to load dashboard latest suggestion', error);
    return null;
  }
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

function deriveTodayFocus({ dailyReview, latestRecord, suggestion }) {
  if (dailyReview?.most_important_thing) {
    return { text: dailyReview.most_important_thing, source: 'daily_review' };
  }

  if (suggestion?.summary) {
    return { text: suggestion.summary, source: 'latest_ai_summary' };
  }

  if (latestRecord?.summary) {
    return { text: latestRecord.summary, source: 'latest_record_summary' };
  }

  if (latestRecord?.content) {
    return { text: truncateText(latestRecord.content, 96), source: 'latest_record' };
  }

  return { text: '今天还没有记录最重要的事', source: 'empty' };
}

function deriveNextSmallStep({ dailyReview, latestRecord, suggestion, followups }) {
  if (suggestion?.nextSmallStep) {
    return { text: suggestion.nextSmallStep, source: 'latest_ai_suggestion' };
  }

  if (dailyReview?.tomorrow_first_step) {
    return { text: dailyReview.tomorrow_first_step, source: 'daily_review' };
  }

  const nextAction = latestRecord?.nextActions?.[0];
  if (nextAction) {
    return { text: nextAction, source: 'latest_record_action' };
  }

  const followup = followups.find(item => item.status === 'open') || followups[0];
  if (followup?.text) {
    return { text: `闭环：${followup.text}`, source: 'followup' };
  }

  return { text: '先写下一句真实状态，不需要完整复盘。', source: 'empty' };
}

function truncateText(value, maxLength) {
  const text = String(value || '').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}
