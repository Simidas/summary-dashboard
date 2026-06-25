export const DOMAINS = new Set(['work', 'side_business', 'life', 'content']);
export const TYPES = new Set(['progress', 'thought', 'blocker', 'reflection', 'diary', 'content_seed']);
export const VISIBILITIES = new Set(['private', 'public', 'shared']);

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
  return TYPES.has(type) ? type : 'thought';
}

export function normalizeVisibility(visibility) {
  return VISIBILITIES.has(visibility) ? visibility : 'private';
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
    errorMessage: row.error_message,
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

export async function updateUserStateAfterRecord(env, ownerId, recordDate) {
  const now = nowIso();
  const totalRow = await env.DB.prepare('SELECT COUNT(*) AS total FROM records WHERE owner_id = ? AND deleted_at IS NULL')
    .bind(ownerId)
    .first();
  const distinctRows = await env.DB.prepare(`
    SELECT DISTINCT date
    FROM records
    WHERE owner_id = ? AND deleted_at IS NULL
    ORDER BY date DESC
    LIMIT 90
  `).bind(ownerId).all();

  const dates = (distinctRows.results || []).map(row => row.date);
  const currentStreak = calculateCurrentStreak(dates, recordDate);
  const existing = await env.DB.prepare('SELECT * FROM user_state WHERE owner_id = ?')
    .bind(ownerId)
    .first();
  const totalRecords = Number(totalRow?.total || 0);
  const longest = Math.max(Number(existing?.longest_streak_days || 0), currentStreak);
  const xp = totalRecords * 10 + currentStreak * 5;
  const level = Math.max(1, Math.floor(xp / 100) + 1);

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
  `).bind(ownerId, totalRecords, currentStreak, longest, dates[0] || recordDate, level, xp, now).run();

  return {
    totalRecords,
    currentStreakDays: currentStreak,
    longestStreakDays: longest,
    lastRecordDate: dates[0] || recordDate,
    level,
    xp
  };
}

function calculateCurrentStreak(dates, fallbackDate) {
  const unique = new Set(dates);
  let cursor = parseDate(unique.has(todayShanghai()) ? todayShanghai() : dates[0] || fallbackDate);
  let streak = 0;

  while (cursor) {
    const key = cursor.toISOString().slice(0, 10);
    if (!unique.has(key)) break;
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  return streak;
}

function parseDate(dateStr) {
  if (!dateStr) return null;
  const date = new Date(`${dateStr}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}
