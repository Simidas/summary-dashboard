import { json, fail } from '../lib/response.js';
import { parseJsonText } from '../lib/db.js';
import { requireOwner } from '../services/auth-service.js';

const EXPORT_TABLES = [
  'records', 'ai_suggestions', 'daily_reviews', 'user_state', 'projects',
  'dashboard_settings', 'content_items', 'followups', 'domain_settings',
  'period_reviews', 'analysis_snapshots'
];

export async function handleExports(request, env) {
  if (request.method !== 'GET') return fail(405, 'METHOD_NOT_ALLOWED', 'Method not allowed');
  const auth = await requireOwner(request, env);
  if (auth.error) return auth.error;

  const url = new URL(request.url);
  const format = url.searchParams.get('format') || 'json';
  if (!['json', 'markdown'].includes(format)) {
    return fail(400, 'FORMAT_INVALID', '导出格式只支持 json 或 markdown');
  }

  const data = await loadOwnerData(env, auth.session.user.id);
  const stamp = new Date().toISOString().slice(0, 10);
  if (format === 'markdown') {
    return new Response(toMarkdown(data), {
      headers: downloadHeaders(`summary-dashboard-${stamp}.md`, 'text/markdown; charset=utf-8')
    });
  }

  return json({
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    owner: { email: auth.session.user.email, name: auth.session.user.name },
    data
  }, { headers: downloadHeaders(`summary-dashboard-${stamp}.json`, 'application/json; charset=utf-8') });
}

async function loadOwnerData(env, ownerId) {
  const statements = EXPORT_TABLES.map(table => env.DB.prepare(
    `SELECT * FROM ${table} WHERE ${table === 'user_state' || table === 'dashboard_settings' ? 'owner_id' : 'owner_id'} = ? ORDER BY ${sortColumn(table)} DESC`
  ).bind(ownerId));
  const results = await env.DB.batch(statements);
  return Object.fromEntries(EXPORT_TABLES.map((table, index) => [table, results[index].results || []]));
}

function sortColumn(table) {
  if (table === 'user_state' || table === 'dashboard_settings') return 'updated_at';
  if (table === 'domain_settings') return 'domain';
  if (table === 'period_reviews') return 'period_key';
  return 'created_at';
}

function toMarkdown(data) {
  const records = data.records || [];
  const reviews = data.daily_reviews || [];
  const lines = ['# 个人经营数据导出', '', `导出时间：${new Date().toISOString()}`, ''];
  for (const record of records) {
    lines.push(`## ${record.date} · ${record.type}`, '', record.raw_content || '', '');
    if (record.summary) lines.push(`> ${record.summary}`, '');
    const tags = parseJsonText(record.tags_json);
    if (tags.length) lines.push(`标签：${tags.join('、')}`, '');
  }
  if (reviews.length) lines.push('# 每日复盘', '');
  for (const review of reviews) {
    lines.push(`## ${review.date}`, '');
    if (review.most_important_thing) lines.push(`最重要的事：${review.most_important_thing}`, '');
    if (review.reflection) lines.push(review.reflection, '');
    if (review.tomorrow_first_step) lines.push(`下一步：${review.tomorrow_first_step}`, '');
  }
  return lines.join('\n');
}

function downloadHeaders(filename, contentType) {
  return {
    'content-type': contentType,
    'content-disposition': `attachment; filename="${filename}"`,
    'cache-control': 'private, no-store'
  };
}
