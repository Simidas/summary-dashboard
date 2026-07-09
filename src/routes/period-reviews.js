import { generatePeriodReviewDraft } from '../lib/ai-client.js';
import {
  mapPeriodReview,
  normalizePeriodReviewStatus,
  normalizePeriodType,
  nowIso,
  parseJsonText,
  todayShanghai,
  toJsonText
} from '../lib/db.js';
import { fail, ok, parseLimit, readJson } from '../lib/response.js';
import { assertCsrf, getSession } from '../lib/session.js';

export async function handlePeriodReviews(request, env) {
  const url = new URL(request.url);
  if (url.pathname === '/api/period-reviews') {
    if (request.method === 'GET') return listPeriodReviews(request, env, url);
    return fail(405, 'METHOD_NOT_ALLOWED', 'Method not allowed');
  }

  const match = url.pathname.match(/^\/api\/period-reviews\/([^/]+)\/([^/]+)(?:\/generate)?$/);
  if (!match) return fail(404, 'NOT_FOUND', 'Period review endpoint not found');

  const periodType = normalizePeriodType(match[1]);
  const periodKey = decodeURIComponent(match[2]);
  const isGenerate = url.pathname.endsWith('/generate');
  if (!periodType) return fail(400, 'PERIOD_TYPE_INVALID', '复盘周期不存在');
  if (!isValidPeriodKey(periodType, periodKey)) return fail(400, 'PERIOD_KEY_INVALID', '复盘周期格式不正确');

  if (isGenerate && request.method === 'POST') return generatePeriodReview(request, env, periodType, periodKey);
  if (isGenerate) return fail(405, 'METHOD_NOT_ALLOWED', 'Method not allowed');
  if (request.method === 'GET') return getPeriodReview(request, env, periodType, periodKey);
  if (request.method === 'PUT') return putPeriodReview(request, env, periodType, periodKey);
  return fail(405, 'METHOD_NOT_ALLOWED', 'Method not allowed');
}

async function listPeriodReviews(request, env, url) {
  const session = await getSession(request, env);
  if (!session || session.user.role !== 'owner') return ok({ reviews: [] });

  const periodType = normalizePeriodType(url.searchParams.get('type'));
  if (!periodType) return fail(400, 'PERIOD_TYPE_INVALID', '复盘周期不存在');

  const limit = parseLimit(url.searchParams.get('limit'), 30, 100);
  const rows = await env.DB.prepare(`
    SELECT *
    FROM period_reviews
    WHERE owner_id = ? AND period_type = ?
    ORDER BY period_key DESC, updated_at DESC
    LIMIT ?
  `).bind(session.user.id, periodType, limit).all();

  return ok({ reviews: (rows.results || []).map(mapPeriodReview) });
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
  await upsertPeriodReview(env, {
    ownerId: session.user.id,
    periodType,
    periodKey,
    theme: cleanText(body?.theme),
    summary: cleanText(body?.summary),
    wins: body?.wins,
    blockers: body?.blockers,
    nextActions: body?.nextActions,
    status: normalizePeriodReviewStatus(body?.status)
  });

  const row = await env.DB.prepare(`
    SELECT *
    FROM period_reviews
    WHERE owner_id = ? AND period_type = ? AND period_key = ?
    LIMIT 1
  `).bind(session.user.id, periodType, periodKey).first();

  return ok({ review: mapPeriodReview(row) });
}

async function generatePeriodReview(request, env, periodType, periodKey) {
  const session = await getSession(request, env);
  if (!session) return fail(401, 'UNAUTHORIZED', '请先登录');
  if (session.user.role !== 'owner') return fail(403, 'FORBIDDEN', '当前账号没有写入权限');
  if (!assertCsrf(request, session, env)) return fail(403, 'CSRF_FAILED', '请求校验失败');

  const context = await buildPeriodReviewContext(env, session.user.id, periodType, periodKey);
  const draft = await generatePeriodReviewDraft(env, context);

  await upsertPeriodReview(env, {
    ownerId: session.user.id,
    periodType,
    periodKey,
    theme: draft.theme,
    summary: draft.summary,
    wins: draft.wins,
    blockers: draft.blockers,
    nextActions: draft.nextActions,
    status: 'draft'
  });

  const row = await env.DB.prepare(`
    SELECT *
    FROM period_reviews
    WHERE owner_id = ? AND period_type = ? AND period_key = ?
    LIMIT 1
  `).bind(session.user.id, periodType, periodKey).first();

  return ok({
    review: mapPeriodReview(row),
    ai: {
      provider: draft.provider,
      model: draft.model,
      status: draft.status,
      errorMessage: draft.errorMessage
    }
  });
}

async function upsertPeriodReview(env, input) {
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
    input.ownerId,
    input.periodType,
    input.periodKey,
    cleanText(input.theme),
    cleanText(input.summary),
    toJsonText(input.wins),
    toJsonText(input.blockers),
    toJsonText(input.nextActions),
    normalizePeriodReviewStatus(input.status),
    now,
    now
  ).run();
}

async function buildPeriodReviewContext(env, ownerId, periodType, periodKey) {
  const range = getPeriodDateRange(periodType, periodKey);
  const [records, reviews, followups, contentItems] = await Promise.all([
    loadRecordsInRange(env, ownerId, range),
    loadDailyReviewsInRange(env, ownerId, range),
    loadFollowupsInRange(env, ownerId, range),
    loadContentItemsInRange(env, ownerId, range)
  ]);
  const wins = topValues([
    ...reviews.flatMap(review => review.wins),
    ...records.filter(isAchievementRecord).map(record => record.summary || record.content)
  ], 8);
  const blockers = topValues([
    ...reviews.flatMap(review => review.blockers),
    ...records.filter(isBlockerRecord).map(record => record.summary || record.content)
  ], 8);
  const nextActions = distinct([
    ...reviews.map(review => review.tomorrowFirstStep),
    ...records.flatMap(record => record.nextActions),
    ...followups.filter(item => item.status === 'open' || item.status === 'deferred').map(item => item.text)
  ]).slice(0, 8);
  const completedFollowups = followups.filter(item => item.status === 'closed').length;
  const openFollowups = followups.filter(item => item.status === 'open' || item.status === 'deferred');
  const energyValues = reviews.map(review => Number(review.energy)).filter(Number.isFinite);

  return {
    periodType,
    periodKey,
    periodLabel: getPeriodLabel(periodType, periodKey),
    range,
    metrics: {
      reviewDays: distinct(reviews.map(review => review.date)).length,
      recordCount: records.length,
      achievementCount: wins.length,
      followupCount: followups.length,
      completedFollowups,
      openFollowups: openFollowups.length,
      overdueFollowups: openFollowups.filter(item => item.overdue).length,
      averageEnergy: energyValues.length
        ? Number((energyValues.reduce((sum, value) => sum + value, 0) / energyValues.length).toFixed(1))
        : null,
      contentSeeds: contentItems.length,
      contentPublished: contentItems.filter(item => item.status === 'published').length
    },
    domainDistribution: buildDomainDistribution(records),
    moodTags: topValues(reviews.map(review => review.mood), 5),
    highlights: {
      wins,
      blockers,
      nextActions
    },
    dailyReviews: reviews.slice(0, 40),
    records: records.slice(0, 60),
    followups: followups.slice(0, 40),
    contentItems: contentItems.slice(0, 30)
  };
}

async function loadRecordsInRange(env, ownerId, range) {
  const rows = await env.DB.prepare(`
    SELECT *
    FROM records
    WHERE owner_id = ? AND deleted_at IS NULL AND date >= ? AND date < ?
    ORDER BY date ASC, created_at ASC
    LIMIT 500
  `).bind(ownerId, range.start, range.endExclusive).all();

  return (rows.results || []).map(row => ({
    date: row.date,
    domain: row.domain,
    type: row.type,
    summary: row.summary,
    content: row.summary || row.raw_content,
    mood: row.mood,
    energy: row.energy,
    projects: parseJsonText(row.projects_json),
    tags: parseJsonText(row.tags_json),
    nextActions: parseJsonText(row.next_actions_json)
  }));
}

async function loadDailyReviewsInRange(env, ownerId, range) {
  const rows = await env.DB.prepare(`
    SELECT *
    FROM daily_reviews
    WHERE owner_id = ? AND date >= ? AND date < ?
    ORDER BY date ASC
    LIMIT 500
  `).bind(ownerId, range.start, range.endExclusive).all();

  return (rows.results || []).map(row => ({
    date: row.date,
    mostImportantThing: row.most_important_thing,
    wins: parseJsonText(row.wins_json),
    blockers: parseJsonText(row.blockers_json),
    reflection: row.reflection,
    tomorrowFirstStep: row.tomorrow_first_step,
    mood: row.mood,
    energy: row.energy
  }));
}

async function loadFollowupsInRange(env, ownerId, range) {
  const rows = await env.DB.prepare(`
    SELECT *
    FROM followups
    WHERE owner_id = ? AND deleted_at IS NULL
      AND (
        (substr(created_at, 1, 10) >= ? AND substr(created_at, 1, 10) < ?)
        OR (due_date >= ? AND due_date < ?)
        OR (substr(closed_at, 1, 10) >= ? AND substr(closed_at, 1, 10) < ?)
      )
    ORDER BY COALESCE(due_date, created_at) ASC
    LIMIT 500
  `).bind(
    ownerId,
    range.start,
    range.endExclusive,
    range.start,
    range.endExclusive,
    range.start,
    range.endExclusive
  ).all();

  const today = todayShanghai();
  return (rows.results || []).map(row => ({
    text: row.text,
    domain: row.domain,
    project: row.project,
    status: row.status,
    dueDate: row.due_date,
    createdAt: row.created_at,
    closedAt: row.closed_at,
    overdue: row.due_date ? row.due_date <= today && ['open', 'deferred'].includes(row.status) : false
  }));
}

async function loadContentItemsInRange(env, ownerId, range) {
  const rows = await env.DB.prepare(`
    SELECT *
    FROM content_items
    WHERE owner_id = ? AND deleted_at IS NULL
      AND substr(created_at, 1, 10) >= ? AND substr(created_at, 1, 10) < ?
    ORDER BY created_at ASC
    LIMIT 300
  `).bind(ownerId, range.start, range.endExclusive).all();

  return (rows.results || []).map(row => ({
    title: row.title,
    sourceDomain: row.source_domain,
    status: row.status,
    angle: row.angle,
    tags: parseJsonText(row.tags_json),
    nextAction: row.next_action,
    createdAt: row.created_at
  }));
}

function getPeriodDateRange(type, key) {
  if (type === 'weekly') {
    const [yearText, weekText] = key.split('-W');
    const year = Number(yearText);
    const week = Number(weekText);
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const jan4Day = jan4.getUTCDay() || 7;
    const start = new Date(jan4);
    start.setUTCDate(jan4.getUTCDate() - jan4Day + 1 + (week - 1) * 7);
    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 7);
    return {
      start: start.toISOString().slice(0, 10),
      endExclusive: end.toISOString().slice(0, 10)
    };
  }

  if (type === 'monthly') {
    const [year, month] = key.split('-').map(Number);
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 1));
    return {
      start: start.toISOString().slice(0, 10),
      endExclusive: end.toISOString().slice(0, 10)
    };
  }

  const year = Number(key);
  return {
    start: `${year}-01-01`,
    endExclusive: `${year + 1}-01-01`
  };
}

function getPeriodLabel(type, key) {
  if (type === 'weekly') return `第 ${key.split('-W')[1]} 周`;
  if (type === 'monthly') return `${key} 月`;
  return `${key} 年`;
}

function buildDomainDistribution(records) {
  const labels = {
    work: '主业',
    side_business: '副业',
    life: '生活和自我',
    content: '内容产出'
  };

  return Object.entries(labels).map(([domain, label]) => ({
    domain,
    label,
    count: records.filter(record => record.domain === domain).length
  }));
}

function topValues(items, limit = 5) {
  const counts = new Map();
  items.filter(Boolean).forEach(item => {
    const key = String(item).trim();
    if (!key) return;
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN'))
    .slice(0, limit)
    .map(([value]) => value);
}

function distinct(items) {
  return Array.from(new Set(items.filter(Boolean)));
}

function isAchievementRecord(record) {
  return ['task', 'review'].includes(record.type)
    || (record.tags || []).some(tag => ['成果', '推进', '交付'].includes(tag));
}

function isBlockerRecord(record) {
  return (record.tags || []).some(tag => ['卡点', '压力', '焦虑', '身体不适'].includes(tag))
    || record.aiSuggestion?.structuredResult?.labelGroups?.statusTags?.some(tag => ['卡住', '焦虑', '疲惫'].includes(tag));
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
