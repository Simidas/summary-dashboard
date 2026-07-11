export async function calculateClosureMetrics(env, ownerId, type, key) {
  const range = getPeriodDateRange(type, key);
  if (!range) return null;
  const { start, endExclusive } = range;
  const results = await env.DB.batch([
    env.DB.prepare(`
      SELECT COUNT(*) AS count FROM records
      WHERE owner_id = ? AND date >= ? AND date < ? AND deleted_at IS NULL
    `).bind(ownerId, start, endExclusive),
    env.DB.prepare(`
      SELECT
        COUNT(DISTINCT CASE WHEN d.candidate_type = 'action' AND d.decision IN ('accepted','modified') THEN d.record_id END) AS action_records,
        COUNT(DISTINCT CASE WHEN d.candidate_type = 'insight' AND d.decision IN ('accepted','modified') THEN d.record_id END) AS insight_records,
        SUM(CASE WHEN d.decision = 'accepted' THEN 1 ELSE 0 END) AS accepted,
        SUM(CASE WHEN d.decision = 'modified' THEN 1 ELSE 0 END) AS modified,
        SUM(CASE WHEN d.decision = 'dismissed' THEN 1 ELSE 0 END) AS dismissed
      FROM suggestion_decisions d
      JOIN records r ON r.id = d.record_id
      WHERE d.owner_id = ? AND r.date >= ? AND r.date < ? AND r.deleted_at IS NULL
    `).bind(ownerId, start, endExclusive),
    env.DB.prepare(`
      SELECT
        COUNT(*) AS created,
        SUM(CASE WHEN outcome_type = 'completed' THEN 1 ELSE 0 END) AS completed,
        SUM(CASE WHEN outcome_type = 'partial' THEN 1 ELSE 0 END) AS partial,
        SUM(CASE WHEN outcome_type IN ('not_needed','replaced','invalid') THEN 1 ELSE 0 END) AS decided_not_done,
        SUM(CASE WHEN status IN ('closed','dropped') THEN 1 ELSE 0 END) AS closed
      FROM followups
      WHERE owner_id = ? AND date(created_at, '+8 hours') >= ? AND date(created_at, '+8 hours') < ? AND deleted_at IS NULL
    `).bind(ownerId, start, endExclusive),
    env.DB.prepare(`
      SELECT COUNT(*) AS deferred
      FROM followup_events
      WHERE owner_id = ? AND event_type = 'deferred'
        AND date(created_at, '+8 hours') >= ? AND date(created_at, '+8 hours') < ?
    `).bind(ownerId, start, endExclusive),
    env.DB.prepare(`
      SELECT id, text, status, outcome_type, defer_count, source_record_id
      FROM followups
      WHERE owner_id = ? AND date(created_at, '+8 hours') >= ? AND date(created_at, '+8 hours') < ? AND deleted_at IS NULL
      ORDER BY defer_count DESC, updated_at DESC LIMIT 20
    `).bind(ownerId, start, endExclusive)
  ]);

  const recordCount = number(results[0].results?.[0]?.count);
  const decisions = results[1].results?.[0] || {};
  const followups = results[2].results?.[0] || {};
  const handledDecisions = number(decisions.accepted) + number(decisions.modified) + number(decisions.dismissed);
  return {
    type,
    key,
    range,
    recordCount,
    recordsWithActions: number(decisions.action_records),
    recordsWithInsights: number(decisions.insight_records),
    actionConversionRate: ratio(number(decisions.action_records), recordCount),
    decisions: {
      accepted: number(decisions.accepted),
      modified: number(decisions.modified),
      dismissed: number(decisions.dismissed),
      adoptionRate: ratio(number(decisions.accepted) + number(decisions.modified), handledDecisions)
    },
    followups: {
      created: number(followups.created),
      completed: number(followups.completed),
      partial: number(followups.partial),
      decidedNotDone: number(followups.decided_not_done),
      closed: number(followups.closed),
      deferredEvents: number(results[3].results?.[0]?.deferred),
      closureRate: ratio(number(followups.closed), number(followups.created))
    },
    evidence: (results[4].results || []).map(row => ({
      id: row.id,
      text: row.text,
      status: row.status,
      outcomeType: row.outcome_type,
      deferCount: number(row.defer_count),
      sourceRecordId: row.source_record_id
    }))
  };
}

export function getPeriodDateRange(type, key) {
  if (type === 'weekly') {
    const match = /^(\d{4})-W(\d{2})$/.exec(key);
    if (!match) return null;
    const year = Number(match[1]);
    const week = Number(match[2]);
    if (week < 1 || week > 53) return null;
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const day = jan4.getUTCDay() || 7;
    const startDate = new Date(jan4);
    startDate.setUTCDate(jan4.getUTCDate() - day + 1 + (week - 1) * 7);
    return { start: isoDate(startDate), endExclusive: shiftDate(isoDate(startDate), 7) };
  }
  if (type === 'monthly') {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(key)) return null;
    const [year, month] = key.split('-').map(Number);
    return { start: `${key}-01`, endExclusive: isoDate(new Date(Date.UTC(year, month, 1))) };
  }
  if (type === 'yearly') {
    if (!/^\d{4}$/.test(key)) return null;
    return { start: `${key}-01-01`, endExclusive: `${Number(key) + 1}-01-01` };
  }
  return null;
}

function shiftDate(value, days) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return isoDate(date);
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function number(value) {
  return Number(value || 0);
}

function ratio(value, total) {
  return total > 0 ? Math.round((value / total) * 1000) / 10 : 0;
}
