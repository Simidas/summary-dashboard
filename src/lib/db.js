export const DOMAINS = new Set(['work', 'side_business', 'life', 'content']);
export const TYPES = new Set([
  'emotion',
  'task',
  'note',
  'diary',
  'review',
  'idea',
  'health'
]);
export const VISIBILITIES = new Set(['private', 'public', 'shared']);
export const PROJECT_STATUSES = new Set(['active', 'paused', 'completed', 'dropped']);
export const ACTIVE_PROJECT_STATUSES = new Set(['active', 'paused']);

export function nowIso() {
  return new Date().toISOString();
}

export function todayShanghai() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());

  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function toJsonText(value) {
  if (!value) return '[]';
  if (Array.isArray(value)) return JSON.stringify(value.filter(item => item != null && String(item).trim()));
  return JSON.stringify([String(value)]);
}

export function parseJsonText(value, fallback = []) {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed == null ? fallback : parsed;
  } catch (error) {
    return fallback;
  }
}

export function normalizeDomain(domain) {
  return DOMAINS.has(domain) ? domain : null;
}

export function normalizeType(type) {
  const aliases = {
    emotional: 'emotion',
    todo: 'task',
    content: 'idea',
    content_material: 'idea',
    content_seed: 'idea',
    thought: 'note',
    progress: 'review',
    blocker: 'review',
    reflection: 'review'
  };
  const normalized = aliases[type] || type;
  return TYPES.has(normalized) ? normalized : 'note';
}

export function normalizeVisibility(visibility) {
  return VISIBILITIES.has(visibility) ? visibility : 'private';
}

export function normalizeProjectStatus(status) {
  return PROJECT_STATUSES.has(status) ? status : 'active';
}

export function isActiveProjectStatus(status) {
  return ACTIVE_PROJECT_STATUSES.has(status);
}

export function normalizeContentStatus(status) {
  const allowed = new Set(['idea', 'outline', 'drafting', 'published', 'dropped']);
  return allowed.has(status) ? status : 'idea';
}

export function normalizeFollowupStatus(status) {
  const allowed = new Set(['open', 'deferred', 'closed', 'dropped']);
  return allowed.has(status) ? status : 'open';
}

export function normalizePeriodType(type) {
  const allowed = new Set(['weekly', 'monthly', 'yearly']);
  return allowed.has(type) ? type : null;
}

export function normalizePeriodReviewStatus(status) {
  const allowed = new Set(['draft', 'confirmed']);
  return allowed.has(status) ? status : 'draft';
}

export function slugifyProjectName(name) {
  const normalized = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || `project-${crypto.randomUUID().slice(0, 8)}`;
}

export function normalizeEnergy(energy) {
  if (energy == null || energy === '') return null;
  const value = Number(energy);
  if (!Number.isFinite(value)) return null;
  return Math.min(5, Math.max(1, Math.round(value)));
}

export function mapRecord(row, suggestion) {
  if (!row) return null;

  return {
    id: row.id,
    date: row.date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    domain: row.domain,
    type: row.type,
    content: row.raw_content,
    summary: row.summary,
    visibility: row.visibility,
    mood: row.mood,
    energy: row.energy,
    projects: parseJsonText(row.projects_json),
    tags: parseJsonText(row.tags_json),
    nextActions: parseJsonText(row.next_actions_json),
    structuredPayload: parseJsonText(row.structured_payload_json, {}),
    aiStatus: row.ai_status || 'pending',
    source: row.source,
    aiSuggestion: suggestion ? mapSuggestion(suggestion) : null
  };
}

export function mapSuggestion(row) {
  if (!row) return null;

  return {
    id: row.id,
    recordId: row.record_id,
    status: row.status,
    provider: row.provider,
    model: row.model,
    summary: row.summary,
    validation: row.validation,
    emotionalRead: row.emotional_read,
    possibleNeed: row.possible_need,
    nextSmallStep: row.next_small_step,
    gentleReminder: row.gentle_reminder,
    encouragement: row.encouragement,
    suggestedTags: parseJsonText(row.suggested_tags_json),
    suggestedFollowUps: parseJsonText(row.suggested_followups_json),
    recordType: row.record_type,
    promptVersion: row.prompt_version,
    structuredResult: parseJsonText(row.structured_result_json, {}),
    destinationSuggestions: parseJsonText(row.destination_suggestions_json),
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function mapProject(row) {
  if (!row) return null;

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    summary: row.summary,
    status: row.status,
    currentFocus: row.current_focus,
    nextAction: row.next_action,
    recordCount: Number(row.record_count || 0),
    openFollowUps: Number(row.open_followups || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    source: 'd1'
  };
}

export function mapContentItem(row) {
  if (!row) return null;

  return {
    id: row.id,
    title: row.title,
    sourceDomain: row.source_domain,
    status: row.status,
    angle: row.angle,
    outline: parseJsonText(row.outline_json),
    tags: parseJsonText(row.tags_json),
    nextAction: row.next_action,
    sourceRecordId: row.source_record_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    source: 'd1'
  };
}

export function mapFollowup(row) {
  if (!row) return null;

  return {
    id: row.id,
    text: row.text,
    note: row.note,
    domain: row.domain,
    domainLabel: getDomainLabel(row.domain),
    project: row.project,
    status: row.status,
    sourceRecordId: row.source_record_id,
    sourceAnalysisId: row.source_analysis_id,
    sourceActionHash: row.source_action_hash,
    dueDate: row.due_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    closedAt: row.closed_at,
    overdue: row.due_date ? row.due_date <= todayShanghai() && ['open', 'deferred'].includes(row.status) : false,
    ageDays: daysBetween(row.created_at, nowIso())
  };
}

export function mapAnalysisSnapshot(row) {
  if (!row) return null;

  return {
    id: row.id,
    scopeType: row.scope_type,
    scopeKey: row.scope_key,
    windowDays: Number(row.window_days || 0),
    sourceRecordIds: parseJsonText(row.source_record_ids_json),
    metrics: parseJsonText(row.metrics_json, {}),
    insights: parseJsonText(row.insights_json, {}),
    nextActions: parseJsonText(row.next_actions_json),
    provider: row.provider,
    model: row.model,
    promptVersion: row.prompt_version,
    status: row.status,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function mapDomainSettings(row, domain) {
  return {
    domain,
    currentFocus: row?.current_focus || null,
    nextAction: row?.next_action || null,
    updatedAt: row?.updated_at || null
  };
}

export function mapPeriodReview(row) {
  if (!row) return null;

  return {
    id: row.id,
    periodType: row.period_type,
    periodKey: row.period_key,
    theme: row.theme,
    summary: row.summary,
    wins: parseJsonText(row.wins_json),
    blockers: parseJsonText(row.blockers_json),
    nextActions: parseJsonText(row.next_actions_json),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function upsertUser(env, profile) {
  const now = nowIso();
  const existing = await env.DB.prepare('SELECT * FROM users WHERE google_sub = ? OR email = ? LIMIT 1')
    .bind(profile.sub, profile.email)
    .first();
  const role = profile.email === env.OWNER_EMAIL ? 'owner' : existing?.role || 'visitor';

  if (existing) {
    await env.DB.prepare(`
      UPDATE users
      SET google_sub = ?, email = ?, email_verified = ?, name = ?, avatar_url = ?,
          role = ?, updated_at = ?, last_login_at = ?
      WHERE id = ?
    `).bind(
      profile.sub,
      profile.email,
      profile.emailVerified ? 1 : 0,
      profile.name || null,
      profile.avatarUrl || null,
      role,
      now,
      now,
      existing.id
    ).run();
    return { ...existing, google_sub: profile.sub, email: profile.email, role };
  }

  const id = crypto.randomUUID();
  await env.DB.prepare(`
    INSERT INTO users (id, google_sub, email, email_verified, name, avatar_url, role, created_at, updated_at, last_login_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    profile.sub,
    profile.email,
    profile.emailVerified ? 1 : 0,
    profile.name || null,
    profile.avatarUrl || null,
    role,
    now,
    now,
    now
  ).run();

  return { id, ...profile, role };
}

export async function calculateUserActivityStats(env, ownerId, fallbackDate = todayShanghai()) {
  const totalRow = await env.DB.prepare(`
    SELECT
      (SELECT COUNT(*) FROM records WHERE owner_id = ? AND deleted_at IS NULL)
      + (SELECT COUNT(*) FROM daily_reviews WHERE owner_id = ?) AS total
  `).bind(ownerId, ownerId).first();

  const distinctRows = await env.DB.prepare(`
    SELECT date
    FROM (
      SELECT date FROM records WHERE owner_id = ? AND deleted_at IS NULL
      UNION
      SELECT date FROM daily_reviews WHERE owner_id = ?
    )
    ORDER BY date DESC
    LIMIT 365
  `).bind(ownerId, ownerId).all();

  const dates = (distinctRows.results || []).map(row => row.date).filter(Boolean);
  const totalRecords = Number(totalRow?.total || 0);
  const currentStreak = calculateCurrentStreak(dates, fallbackDate);
  const longestStreak = calculateLongestStreak(dates);
  const streakBreakPenalty = calculateStreakBreakPenalty(dates, fallbackDate);
  const xp = Math.max(0, totalRecords * 10 + currentStreak * 5 - streakBreakPenalty);
  const level = Math.max(1, Math.floor(xp / 100) + 1);

  return {
    totalRecords,
    currentStreakDays: currentStreak,
    longestStreakDays: longestStreak,
    lastRecordDate: dates[0] || null,
    streakBreakPenalty,
    level,
    xp
  };
}

export async function updateUserStateAfterActivity(env, ownerId, activityDate) {
  const now = nowIso();
  const stats = await calculateUserActivityStats(env, ownerId, activityDate);
  const existing = await env.DB.prepare('SELECT * FROM user_state WHERE owner_id = ?')
    .bind(ownerId)
    .first();
  const longest = Math.max(Number(existing?.longest_streak_days || 0), stats.longestStreakDays);

  await env.DB.prepare(`
    INSERT INTO user_state (
      owner_id, total_records, current_streak_days, longest_streak_days, last_record_date, level, xp, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(owner_id) DO UPDATE SET
      total_records = excluded.total_records,
      current_streak_days = excluded.current_streak_days,
      longest_streak_days = excluded.longest_streak_days,
      last_record_date = excluded.last_record_date,
      level = excluded.level,
      xp = excluded.xp,
      updated_at = excluded.updated_at
  `).bind(
    ownerId,
    stats.totalRecords,
    stats.currentStreakDays,
    longest,
    stats.lastRecordDate || activityDate,
    stats.level,
    stats.xp,
    now
  ).run();

  return {
    totalRecords: stats.totalRecords,
    currentStreakDays: stats.currentStreakDays,
    longestStreakDays: longest,
    lastRecordDate: stats.lastRecordDate || activityDate,
    streakBreakPenalty: stats.streakBreakPenalty,
    level: stats.level,
    xp: stats.xp
  };
}

export async function updateUserStateAfterRecord(env, ownerId, recordDate) {
  return updateUserStateAfterActivity(env, ownerId, recordDate);
}

function calculateCurrentStreak(dates, fallbackDate) {
  const unique = new Set(dates);
  const today = todayShanghai();
  let cursor = parseDate(today);
  if (!cursor) return 0;

  if (!unique.has(today)) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  let streak = 0;

  while (cursor) {
    const key = cursor.toISOString().slice(0, 10);
    if (!unique.has(key)) break;
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  return streak;
}

function calculateStreakBreakPenalty(dates, fallbackDate) {
  const latestDate = dates[0] || fallbackDate;
  const latest = parseDate(latestDate);
  const today = parseDate(todayShanghai());
  if (!latest || !today) return 0;

  const gapDays = Math.floor((today.getTime() - latest.getTime()) / 86400000);
  const missedDaysAfterGrace = Math.max(0, gapDays - 1);
  return Math.min(200, missedDaysAfterGrace * 20);
}

function calculateLongestStreak(dates) {
  const ordered = Array.from(new Set(dates)).sort();
  let longest = 0;
  let current = 0;
  let previous = null;

  ordered.forEach(dateStr => {
    const date = parseDate(dateStr);
    if (!date) return;

    if (!previous) {
      current = 1;
    } else {
      const diffDays = Math.round((date.getTime() - previous.getTime()) / 86400000);
      current = diffDays === 1 ? current + 1 : 1;
    }

    longest = Math.max(longest, current);
    previous = date;
  });

  return longest;
}

function parseDate(dateStr) {
  if (!dateStr) return null;
  const date = new Date(`${dateStr}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getDomainLabel(domain) {
  const labels = {
    work: '主业',
    side_business: '副业',
    life: '生活和自我',
    content: '内容产出'
  };
  return labels[domain] || domain || '未分类';
}

function daysBetween(start, end) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return 0;
  return Math.max(0, Math.floor((endDate.getTime() - startDate.getTime()) / 86400000));
}
