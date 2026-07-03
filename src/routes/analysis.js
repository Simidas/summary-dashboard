import { generateAnalysisDraft } from '../lib/ai-client.js';
import {
  mapAnalysisSnapshot,
  mapFollowup,
  normalizeDomain,
  nowIso,
  parseJsonText,
  todayShanghai
} from '../lib/db.js';
import { fail, ok, readJson } from '../lib/response.js';
import { assertCsrf, getSession } from '../lib/session.js';

const DOMAIN_WINDOW_DAYS = new Set([7, 30]);
const DOMAIN_LABELS = {
  work: '主业',
  side_business: '副业',
  life: '生活和自我',
  content: '内容产出'
};

export async function handleAnalysis(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  const followupMatch = path.match(/^\/api\/analysis\/([^/]+)\/followups$/);
  if (followupMatch && request.method === 'POST') {
    return createFollowupFromAnalysis(request, env, followupMatch[1]);
  }

  const generateMatch = path.match(/^\/api\/analysis\/([^/]+)\/([^/]+)\/generate$/);
  if (generateMatch && request.method === 'POST') {
    return generateAnalysis(request, env, generateMatch[1], decodeURIComponent(generateMatch[2]));
  }

  const snapshotMatch = path.match(/^\/api\/analysis\/([^/]+)\/([^/]+)$/);
  if (snapshotMatch && request.method === 'GET') {
    return getAnalysis(request, env, snapshotMatch[1], decodeURIComponent(snapshotMatch[2]), url);
  }

  return fail(404, 'NOT_FOUND', 'Analysis endpoint not found');
}

async function getAnalysis(request, env, scopeType, rawScopeKey, url) {
  const session = await getSession(request, env);
  if (!session || session.user.role !== 'owner') return ok({ analysis: null });

  const scope = normalizeScope(scopeType, rawScopeKey, url.searchParams.get('windowDays'));
  if (scope.error) return scope.error;

  const row = await loadAnalysisSnapshot(env, session.user.id, scope);
  return ok({ analysis: mapAnalysisSnapshot(row) });
}

async function generateAnalysis(request, env, scopeType, rawScopeKey) {
  const session = await getSession(request, env);
  if (!session) return fail(401, 'UNAUTHORIZED', '请先登录');
  if (session.user.role !== 'owner') return fail(403, 'FORBIDDEN', '当前账号没有写入权限');
  if (!assertCsrf(request, session, env)) return fail(403, 'CSRF_FAILED', '请求校验失败');

  const body = await readJson(request);
  const scope = normalizeScope(scopeType, rawScopeKey, body?.windowDays);
  if (scope.error) return scope.error;

  const context = scope.scopeType === 'daily'
    ? await buildDailyAnalysisContext(env, session.user.id, scope.scopeKey)
    : await buildDomainAnalysisContext(env, session.user.id, scope.scopeKey, scope.windowDays);
  const draft = await generateAnalysisDraft(env, context);

  await upsertAnalysisSnapshot(env, {
    ownerId: session.user.id,
    scope,
    sourceRecordIds: context.sourceRecordIds,
    metrics: draft.metrics || context.metrics,
    insights: draft.insights,
    nextActions: draft.nextActions,
    provider: draft.provider,
    model: draft.model,
    promptVersion: draft.promptVersion,
    status: draft.status,
    errorMessage: draft.errorMessage
  });

  const row = await loadAnalysisSnapshot(env, session.user.id, scope);
  return ok({
    analysis: mapAnalysisSnapshot(row),
    ai: {
      provider: draft.provider,
      model: draft.model,
      status: draft.status,
      errorMessage: draft.errorMessage
    }
  });
}

async function createFollowupFromAnalysis(request, env, analysisId) {
  const session = await getSession(request, env);
  if (!session) return fail(401, 'UNAUTHORIZED', '请先登录');
  if (session.user.role !== 'owner') return fail(403, 'FORBIDDEN', '当前账号没有写入权限');
  if (!assertCsrf(request, session, env)) return fail(403, 'CSRF_FAILED', '请求校验失败');

  const row = await env.DB.prepare(`
    SELECT *
    FROM analysis_snapshots
    WHERE id = ? AND owner_id = ?
    LIMIT 1
  `).bind(analysisId, session.user.id).first();
  if (!row) return fail(404, 'NOT_FOUND', '分析不存在');

  const body = await readJson(request);
  const actions = parseJsonText(row.next_actions_json);
  const requestedIndex = Number(body?.actionIndex);
  const action = Number.isInteger(requestedIndex) ? actions[requestedIndex] : null;
  const text = cleanText(body?.text || action?.text);
  if (!text) return fail(400, 'TEXT_REQUIRED', '待办内容不能为空');

  const actionHash = await sha256Hex(`${analysisId}:${text}`);
  const existing = await env.DB.prepare(`
    SELECT *
    FROM followups
    WHERE owner_id = ? AND source_analysis_id = ? AND source_action_hash = ? AND deleted_at IS NULL
    LIMIT 1
  `).bind(session.user.id, analysisId, actionHash).first();

  if (existing) return ok({ followup: mapFollowup(existing), created: false });

  const domain = normalizeDomain(body?.domain)
    || normalizeDomain(action?.domain)
    || (row.scope_type === 'domain' ? normalizeDomain(row.scope_key) : null);
  const now = nowIso();
  const id = crypto.randomUUID();

  await env.DB.prepare(`
    INSERT INTO followups (
      id, owner_id, text, domain, project, status, source_record_id, due_date,
      source_analysis_id, source_action_hash, created_at, updated_at, closed_at
    )
    VALUES (?, ?, ?, ?, ?, 'open', NULL, ?, ?, ?, ?, ?, NULL)
  `).bind(
    id,
    session.user.id,
    text,
    domain,
    null,
    cleanDate(body?.dueDate),
    analysisId,
    actionHash,
    now,
    now
  ).run();

  const followup = await env.DB.prepare('SELECT * FROM followups WHERE id = ?').bind(id).first();
  return ok({ followup: mapFollowup(followup), created: true }, { status: 201 });
}

function normalizeScope(scopeType, rawScopeKey, rawWindowDays) {
  if (scopeType === 'daily') {
    const scopeKey = rawScopeKey === 'today' ? todayShanghai() : rawScopeKey;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(scopeKey)) {
      return { error: fail(400, 'SCOPE_KEY_INVALID', '日期格式不正确') };
    }
    return { scopeType: 'daily', scopeKey, windowDays: 0 };
  }

  if (scopeType === 'domain') {
    const scopeKey = normalizeDomain(rawScopeKey);
    if (!scopeKey) return { error: fail(400, 'DOMAIN_INVALID', '场景不存在') };

    const windowDays = Number(rawWindowDays || 7);
    if (!DOMAIN_WINDOW_DAYS.has(windowDays)) {
      return { error: fail(400, 'WINDOW_INVALID', '场景分析只支持 7 天或 30 天') };
    }
    return { scopeType: 'domain', scopeKey, windowDays };
  }

  return { error: fail(400, 'SCOPE_INVALID', '分析范围不存在') };
}

async function loadAnalysisSnapshot(env, ownerId, scope) {
  return env.DB.prepare(`
    SELECT *
    FROM analysis_snapshots
    WHERE owner_id = ? AND scope_type = ? AND scope_key = ? AND window_days = ?
    LIMIT 1
  `).bind(ownerId, scope.scopeType, scope.scopeKey, scope.windowDays).first();
}

async function upsertAnalysisSnapshot(env, input) {
  const now = nowIso();
  await env.DB.prepare(`
    INSERT INTO analysis_snapshots (
      id, owner_id, scope_type, scope_key, window_days, source_record_ids_json,
      metrics_json, insights_json, next_actions_json, provider, model, prompt_version,
      status, error_message, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(owner_id, scope_type, scope_key, window_days) DO UPDATE SET
      source_record_ids_json = excluded.source_record_ids_json,
      metrics_json = excluded.metrics_json,
      insights_json = excluded.insights_json,
      next_actions_json = excluded.next_actions_json,
      provider = excluded.provider,
      model = excluded.model,
      prompt_version = excluded.prompt_version,
      status = excluded.status,
      error_message = excluded.error_message,
      updated_at = excluded.updated_at
  `).bind(
    crypto.randomUUID(),
    input.ownerId,
    input.scope.scopeType,
    input.scope.scopeKey,
    input.scope.windowDays,
    JSON.stringify(input.sourceRecordIds || []),
    JSON.stringify(input.metrics || {}),
    JSON.stringify(input.insights || {}),
    JSON.stringify(input.nextActions || []),
    input.provider || 'unknown',
    input.model || 'unknown',
    input.promptVersion || 'analysis-v1',
    input.status || 'completed',
    input.errorMessage || null,
    now,
    now
  ).run();
}

async function buildDailyAnalysisContext(env, ownerId, date) {
  const range = { start: date, endExclusive: shiftDate(date, 1) };
  const [records, dailyReview, followups, contentItems] = await Promise.all([
    loadRecords(env, ownerId, { date }),
    loadDailyReview(env, ownerId, date),
    loadFollowups(env, ownerId, { date }),
    loadContentItems(env, ownerId, { date })
  ]);

  const openFollowups = followups.filter(item => item.status === 'open' || item.status === 'deferred');
  const completedFollowups = followups.filter(item => item.status === 'closed').length;
  const energyValues = [
    Number(dailyReview?.energy),
    ...records.map(record => Number(record.energy))
  ].filter(Number.isFinite);
  const wins = topValues([
    ...(dailyReview?.wins || []),
    ...records.filter(isProgressRecord).map(record => record.summary || record.content)
  ], 6);
  const blockers = topValues([
    ...(dailyReview?.blockers || []),
    ...records.filter(isBlockerRecord).map(record => record.summary || record.content)
  ], 6);
  const nextActions = distinct([
    dailyReview?.tomorrowFirstStep,
    ...records.flatMap(record => record.nextActions || []),
    ...openFollowups.map(item => item.text)
  ]).slice(0, 8);

  return {
    scopeType: 'daily',
    scopeKey: date,
    date,
    range,
    sourceRecordIds: records.map(record => record.id),
    metrics: buildMetrics(records, followups, contentItems, {
      reviewDays: dailyReview ? 1 : 0,
      completedFollowups,
      openFollowups: openFollowups.length,
      overdueFollowups: openFollowups.filter(item => item.overdue).length,
      averageEnergy: average(energyValues)
    }),
    highlights: {
      facts: buildFacts(records, dailyReview, contentItems),
      state: buildStateSignals(records, dailyReview),
      progress: wins,
      blockers,
      patterns: buildPatterns(records),
      nextActions,
      watchItems: buildWatchItems(records, openFollowups)
    },
    dailyReview,
    records: records.slice(0, 80),
    followups: followups.slice(0, 60),
    contentItems: contentItems.slice(0, 40)
  };
}

async function buildDomainAnalysisContext(env, ownerId, domain, windowDays) {
  const endExclusive = shiftDate(todayShanghai(), 1);
  const start = shiftDate(endExclusive, -windowDays);
  const range = { start, endExclusive };
  const [records, dailyReviews, followups, contentItems] = await Promise.all([
    loadRecords(env, ownerId, { domain, range }),
    loadDailyReviews(env, ownerId, range),
    loadFollowups(env, ownerId, { domain, range }),
    loadContentItems(env, ownerId, { domain, range })
  ]);

  const domainReviewSignals = dailyReviews.filter(review =>
    [review.mostImportantThing, review.reflection, ...review.wins, ...review.blockers, review.tomorrowFirstStep]
      .filter(Boolean)
      .some(text => String(text).includes(DOMAIN_LABELS[domain] || domain))
  );
  const openFollowups = followups.filter(item => item.status === 'open' || item.status === 'deferred');
  const completedFollowups = followups.filter(item => item.status === 'closed').length;
  const energyValues = [
    ...records.map(record => Number(record.energy)),
    ...domainReviewSignals.map(review => Number(review.energy))
  ].filter(Number.isFinite);
  const wins = topValues([
    ...records.filter(isProgressRecord).map(record => record.summary || record.content),
    ...domainReviewSignals.flatMap(review => review.wins)
  ], 8);
  const blockers = topValues([
    ...records.filter(isBlockerRecord).map(record => record.summary || record.content),
    ...domainReviewSignals.flatMap(review => review.blockers)
  ], 8);
  const nextActions = distinct([
    ...records.flatMap(record => record.nextActions || []),
    ...domainReviewSignals.map(review => review.tomorrowFirstStep),
    ...openFollowups.map(item => item.text)
  ]).slice(0, 10);

  return {
    scopeType: 'domain',
    scopeKey: domain,
    domain,
    domainLabel: DOMAIN_LABELS[domain] || domain,
    windowDays,
    range,
    sourceRecordIds: records.map(record => record.id),
    metrics: buildMetrics(records, followups, contentItems, {
      reviewDays: domainReviewSignals.length,
      completedFollowups,
      openFollowups: openFollowups.length,
      overdueFollowups: openFollowups.filter(item => item.overdue).length,
      averageEnergy: average(energyValues)
    }),
    highlights: {
      facts: buildFacts(records, null, contentItems),
      state: buildStateSignals(records, null),
      progress: wins,
      blockers,
      patterns: buildPatterns(records),
      nextActions,
      watchItems: buildWatchItems(records, openFollowups)
    },
    dailyReviews: domainReviewSignals.slice(0, 30),
    records: records.slice(0, 120),
    followups: followups.slice(0, 80),
    contentItems: contentItems.slice(0, 60)
  };
}

async function loadRecords(env, ownerId, options = {}) {
  const clauses = ['owner_id = ?', 'deleted_at IS NULL'];
  const params = [ownerId];

  if (options.date) {
    clauses.push('date = ?');
    params.push(options.date);
  }

  if (options.domain) {
    clauses.push('domain = ?');
    params.push(options.domain);
  }

  if (options.range) {
    clauses.push('date >= ? AND date < ?');
    params.push(options.range.start, options.range.endExclusive);
  }

  const rows = await env.DB.prepare(`
    SELECT *
    FROM records
    WHERE ${clauses.join(' AND ')}
    ORDER BY date ASC, created_at ASC
    LIMIT 500
  `).bind(...params).all();

  return (rows.results || []).map(row => ({
    id: row.id,
    date: row.date,
    createdAt: row.created_at,
    domain: row.domain,
    type: row.type,
    summary: row.summary,
    content: truncateText(row.summary || row.raw_content, 280),
    mood: row.mood,
    energy: row.energy,
    projects: parseJsonText(row.projects_json),
    tags: parseJsonText(row.tags_json),
    nextActions: parseJsonText(row.next_actions_json),
    structuredPayload: parseJsonText(row.structured_payload_json, {})
  }));
}

async function loadDailyReview(env, ownerId, date) {
  const row = await env.DB.prepare(`
    SELECT *
    FROM daily_reviews
    WHERE owner_id = ? AND date = ?
    LIMIT 1
  `).bind(ownerId, date).first();

  return mapDailyReviewRow(row);
}

async function loadDailyReviews(env, ownerId, range) {
  const rows = await env.DB.prepare(`
    SELECT *
    FROM daily_reviews
    WHERE owner_id = ? AND date >= ? AND date < ?
    ORDER BY date ASC
    LIMIT 500
  `).bind(ownerId, range.start, range.endExclusive).all();

  return (rows.results || []).map(mapDailyReviewRow).filter(Boolean);
}

async function loadFollowups(env, ownerId, options = {}) {
  const clauses = ['owner_id = ?', 'deleted_at IS NULL'];
  const params = [ownerId];

  if (options.domain) {
    clauses.push('domain = ?');
    params.push(options.domain);
  }

  if (options.date) {
    clauses.push(`(
      substr(created_at, 1, 10) = ?
      OR due_date = ?
      OR substr(closed_at, 1, 10) = ?
      OR (status IN ('open', 'deferred') AND due_date <= ?)
    )`);
    params.push(options.date, options.date, options.date, options.date);
  }

  if (options.range) {
    clauses.push(`(
      (substr(created_at, 1, 10) >= ? AND substr(created_at, 1, 10) < ?)
      OR (due_date >= ? AND due_date < ?)
      OR (substr(closed_at, 1, 10) >= ? AND substr(closed_at, 1, 10) < ?)
      OR (status IN ('open', 'deferred') AND due_date < ?)
    )`);
    params.push(
      options.range.start,
      options.range.endExclusive,
      options.range.start,
      options.range.endExclusive,
      options.range.start,
      options.range.endExclusive,
      options.range.endExclusive
    );
  }

  const rows = await env.DB.prepare(`
    SELECT *
    FROM followups
    WHERE ${clauses.join(' AND ')}
    ORDER BY COALESCE(due_date, created_at) ASC, created_at ASC
    LIMIT 500
  `).bind(...params).all();

  const today = todayShanghai();
  return (rows.results || []).map(row => ({
    id: row.id,
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

async function loadContentItems(env, ownerId, options = {}) {
  const clauses = ['owner_id = ?', 'deleted_at IS NULL'];
  const params = [ownerId];

  if (options.domain) {
    clauses.push('source_domain = ?');
    params.push(options.domain);
  }

  if (options.date) {
    clauses.push('substr(created_at, 1, 10) = ?');
    params.push(options.date);
  }

  if (options.range) {
    clauses.push('substr(created_at, 1, 10) >= ? AND substr(created_at, 1, 10) < ?');
    params.push(options.range.start, options.range.endExclusive);
  }

  const rows = await env.DB.prepare(`
    SELECT *
    FROM content_items
    WHERE ${clauses.join(' AND ')}
    ORDER BY created_at ASC
    LIMIT 300
  `).bind(...params).all();

  return (rows.results || []).map(row => ({
    id: row.id,
    title: row.title,
    sourceDomain: row.source_domain,
    status: row.status,
    angle: row.angle,
    tags: parseJsonText(row.tags_json),
    nextAction: row.next_action,
    createdAt: row.created_at
  }));
}

function mapDailyReviewRow(row) {
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
    updatedAt: row.updated_at
  };
}

function buildMetrics(records, followups, contentItems, extra = {}) {
  return {
    recordCount: records.length,
    reviewDays: Number(extra.reviewDays || 0),
    newFollowups: followups.filter(item => item.createdAt).length,
    completedFollowups: Number(extra.completedFollowups || 0),
    openFollowups: Number(extra.openFollowups || 0),
    overdueFollowups: Number(extra.overdueFollowups || 0),
    contentSeeds: contentItems.length,
    contentPublished: contentItems.filter(item => item.status === 'published').length,
    averageEnergy: extra.averageEnergy ?? null,
    healthRecords: records.filter(record => record.type === 'health').length,
    typeDistribution: countBy(records, 'type'),
    domainDistribution: countBy(records, 'domain'),
    topTags: topValues(records.flatMap(record => record.tags || []), 8),
    topProjects: topValues(records.flatMap(record => record.projects || []), 8)
  };
}

function buildFacts(records, dailyReview, contentItems) {
  return distinct([
    dailyReview?.mostImportantThing ? `每日重点：${dailyReview.mostImportantThing}` : null,
    ...records.slice(-8).map(record => `${formatDomain(record.domain)} / ${record.type}：${record.summary || record.content}`),
    ...contentItems.slice(-4).map(item => `内容素材：${item.title}`)
  ]).slice(0, 12);
}

function buildStateSignals(records, dailyReview) {
  return distinct([
    dailyReview?.mood ? `心情：${dailyReview.mood}` : null,
    dailyReview?.energy ? `能量：${dailyReview.energy}/5` : null,
    ...records.filter(record => record.mood || record.energy).slice(-8).map(record => [
      record.mood ? `心情 ${record.mood}` : '',
      record.energy ? `能量 ${record.energy}/5` : '',
      record.type ? `类型 ${record.type}` : ''
    ].filter(Boolean).join(' · '))
  ]).slice(0, 10);
}

function buildPatterns(records) {
  const tags = topValues(records.flatMap(record => record.tags || []), 5);
  const projects = topValues(records.flatMap(record => record.projects || []), 5);
  const typeDistribution = countBy(records, 'type').map(item => `${item.value} ${item.count}`);
  return [
    tags.length ? `高频标签：${tags.join('、')}` : null,
    projects.length ? `关联项目：${projects.join('、')}` : null,
    typeDistribution.length ? `类型分布：${typeDistribution.join('，')}` : null
  ].filter(Boolean);
}

function buildWatchItems(records, followups) {
  return distinct([
    ...followups.filter(item => item.overdue).map(item => `已超时：${item.text}`),
    ...records.filter(record => record.type === 'health').slice(-3).map(record => `健康信号：${record.summary || record.content}`),
    ...records.filter(isBlockerRecord).slice(-4).map(record => `卡点：${record.summary || record.content}`)
  ]).slice(0, 8);
}

function countBy(items, key) {
  const counts = new Map();
  items.forEach(item => {
    const value = item?.[key];
    if (!value) return;
    counts.set(value, (counts.get(value) || 0) + 1);
  });

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), 'zh-CN'))
    .map(([value, count]) => ({ value, count }));
}

function topValues(items, limit = 5) {
  return countValues(items).slice(0, limit).map(([value]) => value);
}

function countValues(items) {
  const counts = new Map();
  items.filter(Boolean).forEach(item => {
    const key = String(item).trim();
    if (!key) return;
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN'));
}

function distinct(items) {
  return Array.from(new Set(items.filter(Boolean).map(item => String(item).trim()).filter(Boolean)));
}

function average(values) {
  if (!values.length) return null;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1));
}

function isProgressRecord(record) {
  return ['task', 'review'].includes(record.type)
    || (record.tags || []).some(tag => ['成果', '推进', '交付', '完成', '复盘'].includes(tag));
}

function isBlockerRecord(record) {
  return (record.tags || []).some(tag => ['卡点', '压力', '焦虑', '身体不适', '风险', '拖延'].includes(tag))
    || ['emotion', 'health'].includes(record.type)
    || /卡|堵|焦虑|疲惫|压力|难受|拖延|超时/.test(record.summary || record.content || '');
}

function formatDomain(domain) {
  return DOMAIN_LABELS[domain] || domain || '未分类';
}

function cleanText(value) {
  const text = String(value || '').trim();
  return text || null;
}

function cleanDate(value) {
  const text = cleanText(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text || '') ? text : null;
}

function truncateText(value, maxLength) {
  const text = String(value || '').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

function shiftDate(dateText, offsetDays) {
  const [year, month, day] = dateText.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + offsetDays));
  return date.toISOString().slice(0, 10);
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}
