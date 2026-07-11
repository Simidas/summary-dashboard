import { generateCompanionSuggestion } from '../lib/ai-client.js';
import {
  isActiveProjectStatus,
  mapContentItem,
  mapFollowup,
  mapProject,
  mapRecord,
  mapInsight,
  mapSuggestionDecision,
  mapSuggestion,
  normalizeDomain,
  normalizeEnergy,
  normalizeFollowupStatus,
  normalizeProjectStatus,
  normalizeType,
  normalizeVisibility,
  nowIso,
  parseJsonText,
  slugifyProjectName,
  toJsonText,
  todayShanghai,
  updateUserStateAfterActivity,
  updateUserStateAfterRecord
} from '../lib/db.js';
import { fail, ok, readJson } from '../lib/response.js';
import { assertCsrf, getSession } from '../lib/session.js';
import { validationResponse } from '../lib/schema.js';
import { findRecordByAccess } from '../repositories/records-repository.js';
import { validateRecordBody } from '../services/input-schemas.js';
import { listRecordRows } from '../services/records-service.js';

const SUGGESTION_BATCH_SIZE = 50;
const SUGGESTION_COLUMNS = [
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
];
const SUGGESTION_SELECT = SUGGESTION_COLUMNS.join(', ');
const SUGGESTION_SELECT_ALIASED = SUGGESTION_COLUMNS.map(column => `s.${column}`).join(', ');

export async function handleRecords(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === '/api/records' && request.method === 'GET') {
    return listRecords(request, env);
  }

  if (path === '/api/records' && request.method === 'POST') {
    return createRecord(request, env, ctx);
  }

  const regenerateMatch = path.match(/^\/api\/records\/([^/]+)\/ai\/regenerate$/);
  if (regenerateMatch && request.method === 'POST') {
    return regenerateSuggestion(request, env, regenerateMatch[1]);
  }

  const destinationMatch = path.match(/^\/api\/records\/([^/]+)\/destinations$/);
  if (destinationMatch && request.method === 'POST') {
    return applyRecordDestination(request, env, destinationMatch[1]);
  }

  const recordMatch = path.match(/^\/api\/records\/([^/]+)$/);
  if (recordMatch && request.method === 'GET') {
    return getRecord(request, env, recordMatch[1]);
  }
  if (recordMatch && request.method === 'PATCH') {
    return updateRecord(request, env, recordMatch[1]);
  }
  if (recordMatch && request.method === 'DELETE') {
    return deleteRecord(request, env, recordMatch[1]);
  }

  return fail(404, 'NOT_FOUND', 'Records endpoint not found');
}

async function listRecords(request, env) {
  const session = await getSession(request, env);
  const url = new URL(request.url);
  const result = await listRecordRows(env, url, session);
  const records = result.items;
  const suggestions = await safeLoadLatestSuggestionsForRecords(env, records.map(row => row.id));
  const closureData = session?.user?.role === 'owner'
    ? await loadClosureDataForRecords(env, session.user.id, records.map(row => row.id))
    : { decisions: new Map(), insights: new Map() };

  return ok({
    records: records.map(row => ({
      ...mapRecord(row, suggestions.get(row.id)),
      decisions: closureData.decisions.get(row.id) || [],
      insights: closureData.insights.get(row.id) || []
    })),
    page: result.page
  });
}

async function getRecord(request, env, id) {
  const session = await getSession(request, env);
  const row = await findRecordByAccess(env, {
    id,
    ownerId: session?.user?.role === 'owner' ? session.user.id : null
  });
  if (!row) return fail(404, 'NOT_FOUND', '记录不存在');

  const suggestion = await safeLoadLatestSuggestionForRecord(env, row.id);
  const closureData = session?.user?.role === 'owner'
    ? await loadClosureDataForRecords(env, session.user.id, [row.id])
    : { decisions: new Map(), insights: new Map() };
  return ok({ record: {
    ...mapRecord(row, suggestion),
    decisions: closureData.decisions.get(row.id) || [],
    insights: closureData.insights.get(row.id) || []
  } });
}

async function loadClosureDataForRecords(env, ownerId, recordIds) {
  const decisions = new Map();
  const insights = new Map();
  for (let index = 0; index < recordIds.length; index += 50) {
    const batch = recordIds.slice(index, index + 50);
    if (!batch.length) continue;
    const placeholders = batch.map(() => '?').join(', ');
    const [decisionRows, insightRows] = await Promise.all([
      env.DB.prepare(`
        SELECT * FROM suggestion_decisions WHERE owner_id = ? AND record_id IN (${placeholders}) ORDER BY updated_at DESC
      `).bind(ownerId, ...batch).all(),
      env.DB.prepare(`
        SELECT * FROM insights WHERE owner_id = ? AND source_record_id IN (${placeholders}) AND deleted_at IS NULL ORDER BY updated_at DESC
      `).bind(ownerId, ...batch).all()
    ]);
    for (const row of decisionRows.results || []) {
      if (!decisions.has(row.record_id)) decisions.set(row.record_id, []);
      decisions.get(row.record_id).push(mapSuggestionDecision(row));
    }
    for (const row of insightRows.results || []) {
      if (!insights.has(row.source_record_id)) insights.set(row.source_record_id, []);
      insights.get(row.source_record_id).push(mapInsight(row));
    }
  }
  return { decisions, insights };
}

async function createRecord(request, env, ctx) {
  const session = await getSession(request, env);
  if (!session) return fail(401, 'UNAUTHORIZED', '请先登录');
  if (session.user.role !== 'owner') return fail(403, 'FORBIDDEN', '当前账号没有写入权限');
  if (!assertCsrf(request, session, env)) return fail(403, 'CSRF_FAILED', '请求校验失败');

  let body;
  try {
    body = validateRecordBody(await readJson(request));
  } catch (error) {
    return validationResponse(error, fail) || fail(400, 'INVALID_INPUT', '输入内容不符合要求');
  }
  const content = String(body?.content || '').trim();
  if (!content) return fail(400, 'CONTENT_REQUIRED', '记录内容不能为空');

  const now = nowIso();
  const date = body.date || todayShanghai();
  const record = {
    id: crypto.randomUUID(),
    ownerId: session.user.id,
    date,
    createdAt: now,
    updatedAt: now,
    domain: normalizeDomain(body.domain),
    type: normalizeType(body.type),
    content,
    summary: String(body.summary || '').trim() || null,
    visibility: normalizeVisibility(body.visibility),
    mood: String(body.mood || '').trim() || null,
    energy: normalizeEnergy(body.energy),
    projects: normalizeProjectRefs(body.projects),
    tags: normalizeTopicTags(body.tags),
    nextActions: Array.isArray(body.nextActions) ? body.nextActions : [],
    structuredPayload: buildStructuredPayload(body)
  };

  const validationError = await validateRecordInput(env, session.user.id, record, body);
  if (validationError) return validationError;

  await env.DB.prepare(`
    INSERT INTO records (
      id, owner_id, date, created_at, updated_at, domain, type, raw_content, summary,
      visibility, mood, energy, projects_json, tags_json, next_actions_json,
      structured_payload_json, ai_status, source
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'web')
  `).bind(
    record.id,
    record.ownerId,
    record.date,
    record.createdAt,
    record.updatedAt,
    record.domain,
    record.type,
    record.content,
    record.summary,
    record.visibility,
    record.mood,
    record.energy,
    toJsonText(record.projects),
    toJsonText(record.tags),
    toJsonText(record.nextActions),
    JSON.stringify(record.structuredPayload)
  ).run();

  const destinations = await createInitialDestinations(env, record, body);
  scheduleSuggestionGeneration(ctx, env, record);
  const userState = await updateUserStateAfterRecord(env, record.ownerId, record.date);

  return ok({
    record: {
      id: record.id,
      date: record.date,
      createdAt: record.createdAt,
      domain: record.domain,
      type: record.type,
      content: record.content,
      visibility: record.visibility,
      mood: record.mood,
      energy: record.energy,
      projects: record.projects,
      tags: record.tags,
      structuredPayload: record.structuredPayload,
      aiStatus: 'pending',
      aiSuggestion: null
    },
    aiSuggestion: null,
    aiPending: true,
    destinations,
    userState
  }, { status: 201 });
}

function scheduleSuggestionGeneration(ctx, env, record) {
  const task = generateAndInsertSuggestion(env, record)
    .catch(error => console.error('Async AI suggestion failed', error));

  if (ctx?.waitUntil) {
    ctx.waitUntil(task);
  }
}

async function generateAndInsertSuggestion(env, record) {
  const recentRows = await env.DB.prepare(`
    SELECT date, raw_content, summary
    FROM records
    WHERE owner_id = ? AND deleted_at IS NULL AND id != ?
      AND (? IS NULL OR domain = ?)
    ORDER BY created_at DESC
    LIMIT 5
  `).bind(record.ownerId, record.id, record.domain, record.domain).all();

  const aiSuggestion = await generateCompanionSuggestion(env, record, recentRows.results || []);
  await insertSuggestion(env, record, aiSuggestion);
}

async function updateRecord(request, env, id) {
  const session = await getOwnerSession(request, env);
  if (session instanceof Response) return session;
  if (!assertCsrf(request, session, env)) return fail(403, 'CSRF_FAILED', '请求校验失败');

  let body;
  try {
    body = validateRecordBody(await readJson(request), { required: false });
  } catch (error) {
    return validationResponse(error, fail) || fail(400, 'INVALID_INPUT', '输入内容不符合要求');
  }
  const existing = await env.DB.prepare('SELECT * FROM records WHERE id = ? AND owner_id = ? AND deleted_at IS NULL')
    .bind(id, session.user.id)
    .first();
  if (!existing) return fail(404, 'NOT_FOUND', '记录不存在');

  const content = body.content == null ? existing.raw_content : String(body.content).trim();
  if (!content) return fail(400, 'CONTENT_REQUIRED', '记录内容不能为空');
  const projects = body.projects == null ? null : normalizeProjectRefs(body.projects);
  const projectError = await validateActiveProjectNames(env, session.user.id, projects || []);
  if (projectError) return projectError;

  await env.DB.prepare(`
    UPDATE records
    SET raw_content = ?, domain = ?, type = ?, visibility = ?, mood = ?, energy = ?,
        projects_json = ?, tags_json = ?, next_actions_json = ?, structured_payload_json = ?,
        updated_at = ?
    WHERE id = ? AND owner_id = ?
  `).bind(
    content,
    body.domain == null ? existing.domain : normalizeDomain(body.domain),
    body.type == null ? existing.type : normalizeType(body.type),
    body.visibility == null ? existing.visibility : normalizeVisibility(body.visibility),
    body.mood == null ? existing.mood : String(body.mood || '').trim() || null,
    body.energy == null ? existing.energy : normalizeEnergy(body.energy),
    body.projects == null ? existing.projects_json : toJsonText(projects),
    body.tags == null ? existing.tags_json : toJsonText(body.tags),
    body.nextActions == null ? existing.next_actions_json : toJsonText(body.nextActions),
    body.structuredPayload == null ? existing.structured_payload_json : JSON.stringify(sanitizeObject(body.structuredPayload)),
    nowIso(),
    id,
    session.user.id
  ).run();

  return ok({ id, updated: true });
}

async function deleteRecord(request, env, id) {
  const session = await getOwnerSession(request, env);
  if (session instanceof Response) return session;
  if (!assertCsrf(request, session, env)) return fail(403, 'CSRF_FAILED', '请求校验失败');

  await env.DB.prepare('UPDATE records SET deleted_at = ?, updated_at = ? WHERE id = ? AND owner_id = ?')
    .bind(nowIso(), nowIso(), id, session.user.id)
    .run();
  return ok({ id, deleted: true });
}

async function regenerateSuggestion(request, env, id) {
  const session = await getOwnerSession(request, env);
  if (session instanceof Response) return session;
  if (!assertCsrf(request, session, env)) return fail(403, 'CSRF_FAILED', '请求校验失败');

  const row = await env.DB.prepare('SELECT * FROM records WHERE id = ? AND owner_id = ? AND deleted_at IS NULL')
    .bind(id, session.user.id)
    .first();
  if (!row) return fail(404, 'NOT_FOUND', '记录不存在');

  const record = mapRecord(row);
  const aiSuggestion = await generateCompanionSuggestion(env, {
    id: record.id,
    ownerId: session.user.id,
    date: record.date,
    domain: record.domain,
    type: record.type,
    content: record.content,
    mood: record.mood,
    energy: record.energy,
    projects: record.projects,
    tags: record.tags
  });
  await insertSuggestion(env, { id: record.id, ownerId: session.user.id, type: record.type }, aiSuggestion);

  return ok({ aiSuggestion });
}

async function applyRecordDestination(request, env, id) {
  const session = await getOwnerSession(request, env);
  if (session instanceof Response) return session;
  if (!assertCsrf(request, session, env)) return fail(403, 'CSRF_FAILED', '请求校验失败');

  const body = await readJson(request);
  const type = normalizeDestinationType(body?.type);
  if (!type) return fail(400, 'DESTINATION_TYPE_REQUIRED', '请选择要分流到哪里');

  const row = await env.DB.prepare(`
    SELECT *
    FROM records
    WHERE id = ? AND owner_id = ? AND deleted_at IS NULL
    LIMIT 1
  `).bind(id, session.user.id).first();
  if (!row) return fail(404, 'NOT_FOUND', '记录不存在');

  const suggestionRow = await safeLoadLatestSuggestionForRecord(env, row.id);
  const record = {
    ...mapRecord(row, suggestionRow),
    ownerId: session.user.id
  };
  const suggestion = suggestionRow ? mapSuggestion(suggestionRow) : null;

  let destination;
  if (type === 'followup') {
    destination = await applyFollowupDestination(env, record, suggestion, body);
  } else if (type === 'content') {
    destination = await applyContentDestination(env, record, suggestion, body);
  } else if (type === 'daily_review') {
    destination = await applyDailyReviewDestination(env, record, suggestion, body);
  } else if (type === 'project') {
    destination = await applyProjectDestination(env, record, suggestion, body);
  }

  if (destination instanceof Response) return destination;
  const decision = suggestionRow
    ? await recordAcceptedDestinationDecision(env, record, suggestionRow, type, destination, body)
    : null;
  return ok({ destination, decision });
}

async function recordAcceptedDestinationDecision(env, record, suggestionRow, type, destination, body) {
  const candidateType = type === 'followup' ? 'action'
    : type === 'content' ? 'content'
      : type === 'project' ? 'project' : 'action';
  const candidateKey = `${type}:${cleanText(body?.name) || 'default'}`;
  const now = nowIso();
  const decision = body?.modified ? 'modified' : 'accepted';
  await env.DB.prepare(`
    INSERT INTO suggestion_decisions (
      id, owner_id, suggestion_id, record_id, candidate_type, candidate_key,
      decision, destination_type, destination_id, original_payload_json,
      final_payload_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(owner_id, suggestion_id, candidate_type, candidate_key) DO UPDATE SET
      decision = excluded.decision, destination_type = excluded.destination_type,
      destination_id = excluded.destination_id, final_payload_json = excluded.final_payload_json,
      updated_at = excluded.updated_at
  `).bind(
    crypto.randomUUID(), record.ownerId, suggestionRow.id, record.id,
    candidateType, candidateKey, decision, type, destination?.id || null,
    JSON.stringify({ type, name: body?.name || null }),
    JSON.stringify({ ...body, destination }), now, now
  ).run();
  return { candidateType, candidateKey, decision, destinationType: type, destinationId: destination?.id || null };
}

async function insertSuggestion(env, record, suggestion) {
  const now = nowIso();
  const id = crypto.randomUUID();
  await env.DB.prepare(`
    INSERT INTO ai_suggestions (
      id, record_id, owner_id, provider, model, status, summary, validation, emotional_read,
      possible_need, next_small_step, gentle_reminder, encouragement, suggested_tags_json,
      suggested_followups_json, raw_response_json, error_message, record_type, prompt_version,
      structured_result_json, destination_suggestions_json, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    record.id,
    record.ownerId,
    suggestion.provider,
    suggestion.model,
    suggestion.status,
    suggestion.summary,
    suggestion.validation,
    suggestion.emotionalRead,
    suggestion.possibleNeed,
    suggestion.nextSmallStep,
    suggestion.gentleReminder,
    suggestion.encouragement,
    toJsonText(suggestion.suggestedTags),
    JSON.stringify(suggestion.suggestedFollowUps || []),
    suggestion.rawResponse ? JSON.stringify(suggestion.rawResponse) : null,
    suggestion.errorMessage,
    record.type || null,
    'companion-v2-type-aware',
    JSON.stringify(suggestion.structuredResult || {}),
    JSON.stringify(suggestion.destinationSuggestions || []),
    now,
    now
  ).run();

  await env.DB.prepare(`
    UPDATE records
    SET ai_status = ?, updated_at = ?
    WHERE id = ? AND owner_id = ?
  `).bind(
    suggestion.status === 'completed' ? 'completed' : 'failed',
    now,
    record.id,
    record.ownerId
  ).run();

  return mapSuggestion({
    id,
    record_id: record.id,
    owner_id: record.ownerId,
    created_at: now,
    updated_at: now,
    record_type: record.type || null,
    prompt_version: 'companion-v2-type-aware',
    structured_result_json: JSON.stringify(suggestion.structuredResult || {}),
    destination_suggestions_json: JSON.stringify(suggestion.destinationSuggestions || []),
    ...suggestion
  });
}

async function applyFollowupDestination(env, record, suggestion, body = {}) {
  const existing = await env.DB.prepare(`
    SELECT *
    FROM followups
    WHERE owner_id = ? AND source_record_id = ? AND deleted_at IS NULL
    LIMIT 1
  `).bind(record.ownerId, record.id).first();
  if (existing) {
    return {
      type: 'followup',
      id: existing.id,
      status: 'existing',
      label: '已在未闭环事项',
      item: mapFollowup(existing)
    };
  }

  const structured = suggestion?.structuredResult || {};
  const suggestedFollowup = firstObject(suggestion?.suggestedFollowUps);
  const text = cleanText(body.text)
    || cleanText(suggestedFollowup?.text)
    || cleanText(structured.taskTitle)
    || cleanText(suggestion?.nextSmallStep)
    || firstLine(record.content);
  if (!text) return fail(400, 'FOLLOWUP_TEXT_REQUIRED', '没有可生成待办的内容');

  const now = nowIso();
  const id = crypto.randomUUID();
  const projectName = cleanText(record.projects?.[0]);
  const projectError = await validateActiveProjectNames(env, record.ownerId, projectName ? [projectName] : []);
  if (projectError) return projectError;

  await env.DB.batch([env.DB.prepare(`
    INSERT INTO followups (
      id, owner_id, text, note, domain, project, status, source_record_id, source_type, due_date,
      created_at, updated_at, closed_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'record', ?, ?, ?, ?)
  `).bind(
    id,
    record.ownerId,
    text,
    cleanText(body.note),
    record.domain,
    projectName,
    'open',
    record.id,
    cleanDate(body.dueDate || structured.suggestedDueDate),
    now,
    now,
    null
  ), createFollowupCreatedEvent(env, record.ownerId, id, 'open', now, record.id)]);

  const row = await env.DB.prepare('SELECT * FROM followups WHERE id = ?').bind(id).first();
  return {
    type: 'followup',
    id,
    status: 'created',
    label: '已加入未闭环事项',
    item: mapFollowup(row)
  };
}

async function applyContentDestination(env, record, suggestion, body = {}) {
  const existing = await env.DB.prepare(`
    SELECT *
    FROM content_items
    WHERE owner_id = ? AND source_record_id = ? AND deleted_at IS NULL
    LIMIT 1
  `).bind(record.ownerId, record.id).first();
  if (existing) {
    return {
      type: 'content',
      id: existing.id,
      status: 'existing',
      label: '已在内容素材',
      item: mapContentItem(existing)
    };
  }

  const structured = suggestion?.structuredResult || {};
  const title = cleanText(body.title)
    || cleanText(structured.topic)
    || cleanText(structured.ideaSummary)
    || cleanText(suggestion?.summary)
    || firstLine(record.content);
  if (!title) return fail(400, 'CONTENT_TITLE_REQUIRED', '没有可生成内容素材的标题');

  const outline = uniqueTexts([
    ...toArray(structured.keyPoints),
    structured.audience ? `目标读者：${structured.audience}` : '',
    structured.value ? `读者价值：${structured.value}` : ''
  ]).slice(0, 6);
  const tags = uniqueTexts([
    ...(record.tags || []),
    ...(suggestion?.suggestedTags || []),
    ...toArray(structured.labelGroups?.impactTags),
    ...toArray(structured.labelGroups?.actionTags)
  ]).slice(0, 8);
  const now = nowIso();
  const id = crypto.randomUUID();

  await env.DB.prepare(`
    INSERT INTO content_items (
      id, owner_id, title, source_domain, status, angle, outline_json, tags_json,
      next_action, source_record_id, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    record.ownerId,
    title,
    record.domain,
    'idea',
    cleanText(body.angle) || cleanText(structured.angle),
    toJsonText(outline),
    toJsonText(tags),
    cleanText(suggestion?.nextSmallStep),
    record.id,
    now,
    now
  ).run();

  const row = await env.DB.prepare('SELECT * FROM content_items WHERE id = ?').bind(id).first();
  return {
    type: 'content',
    id,
    status: 'created',
    label: '已加入内容素材',
    item: mapContentItem(row)
  };
}

async function applyDailyReviewDestination(env, record, suggestion, body = {}) {
  const existing = await env.DB.prepare(`
    SELECT *
    FROM daily_reviews
    WHERE owner_id = ? AND date = ?
    LIMIT 1
  `).bind(record.ownerId, record.date).first();
  const structured = suggestion?.structuredResult || {};
  const summary = cleanText(body.summary)
    || cleanText(suggestion?.summary)
    || cleanText(record.summary)
    || firstLine(record.content);
  const reflectionLine = summary ? `自动分流记录：${summary}` : '';
  const reflection = appendUniqueLine(existing?.reflection, reflectionLine);
  const wins = uniqueTexts([
    ...parseJsonText(existing?.wins_json),
    ...toArray(structured.wins),
    suggestion?.validation
  ]).slice(0, 8);
  const blockers = uniqueTexts([
    ...parseJsonText(existing?.blockers_json),
    ...toArray(structured.problems),
    structured.blocker,
    structured.risk
  ]).slice(0, 8);
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
    record.ownerId,
    record.date,
    cleanText(existing?.most_important_thing) || summary,
    toJsonText(wins),
    toJsonText(blockers),
    reflection,
    cleanText(existing?.tomorrow_first_step) || cleanText(suggestion?.nextSmallStep),
    cleanText(existing?.mood) || cleanText(record.mood),
    existing?.energy || record.energy || null,
    now,
    now
  ).run();
  await updateUserStateAfterActivity(env, record.ownerId, record.date);

  const row = await env.DB.prepare('SELECT * FROM daily_reviews WHERE owner_id = ? AND date = ?')
    .bind(record.ownerId, record.date)
    .first();
  return {
    type: 'daily_review',
    id: row?.id || record.date,
    status: existing && existing.reflection === reflection ? 'existing' : 'updated',
    label: '已纳入 Daily 复盘',
    item: {
      id: row?.id,
      date: row?.date
    }
  };
}

async function applyProjectDestination(env, record, suggestion, body = {}) {
  const structured = suggestion?.structuredResult || {};
  const projectName = cleanText(body.name)
    || cleanText(firstText(structured.suggestedProjects))
    || cleanText(firstDestinationName(suggestion?.destinationSuggestions, 'project'));
  if (!projectName) return fail(400, 'PROJECT_NAME_REQUIRED', '没有可分流的项目名称');

  const now = nowIso();
  let project = await env.DB.prepare(`
    SELECT *
    FROM projects
    WHERE owner_id = ? AND deleted_at IS NULL AND name = ?
    LIMIT 1
  `).bind(record.ownerId, projectName).first();
  if (project && !isActiveProjectStatus(project.status)) {
    return fail(400, 'PROJECT_CLOSED', '完成或废弃的项目不能继续关联新记录');
  }

  if (!project) {
    const id = crypto.randomUUID();
    const slug = await uniqueProjectSlug(env, record.ownerId, slugifyProjectName(projectName));
    await env.DB.prepare(`
      INSERT INTO projects (
        id, owner_id, slug, name, summary, status, current_focus, next_action, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      record.ownerId,
      slug,
      projectName,
      cleanText(suggestion?.summary),
      normalizeProjectStatus(body.status),
      firstLine(record.content),
      cleanText(suggestion?.nextSmallStep),
      now,
      now
    ).run();
    project = await env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(id).first();
  }

  const nextProjects = uniqueTexts([...(record.projects || []), project.name]);
  await env.DB.prepare(`
    UPDATE records
    SET projects_json = ?, updated_at = ?
    WHERE id = ? AND owner_id = ?
  `).bind(
    toJsonText(nextProjects),
    now,
    record.id,
    record.ownerId
  ).run();

  return {
    type: 'project',
    id: project.id,
    status: record.projects?.includes(project.name) ? 'existing' : 'updated',
    label: record.projects?.includes(project.name) ? '已关联项目' : '已关联项目',
    item: mapProject(project)
  };
}

async function loadLatestSuggestionsForRecords(env, recordIds) {
  if (!recordIds.length) return new Map();

  const suggestions = new Map();
  for (let index = 0; index < recordIds.length; index += SUGGESTION_BATCH_SIZE) {
    const batchIds = recordIds.slice(index, index + SUGGESTION_BATCH_SIZE);
    const placeholders = batchIds.map(() => '?').join(', ');
    const rows = await env.DB.prepare(`
      SELECT ${SUGGESTION_SELECT_ALIASED}
      FROM ai_suggestions s
      JOIN (
        SELECT record_id, MAX(created_at) AS created_at
        FROM ai_suggestions
        WHERE record_id IN (${placeholders})
        GROUP BY record_id
      ) latest
        ON latest.record_id = s.record_id
       AND latest.created_at = s.created_at
    `).bind(...batchIds).all();

    (rows.results || []).forEach(row => {
      suggestions.set(row.record_id, row);
    });
  }

  return suggestions;
}

async function loadLatestSuggestionForRecord(env, recordId) {
  return env.DB.prepare(`
    SELECT ${SUGGESTION_SELECT}
    FROM ai_suggestions
    WHERE record_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).bind(recordId).first();
}

async function safeLoadLatestSuggestionsForRecords(env, recordIds) {
  try {
    return await loadLatestSuggestionsForRecords(env, recordIds);
  } catch (error) {
    console.error('Failed to load latest suggestions for records', error);
    return new Map();
  }
}

async function safeLoadLatestSuggestionForRecord(env, recordId) {
  try {
    return await loadLatestSuggestionForRecord(env, recordId);
  } catch (error) {
    console.error('Failed to load latest suggestion for record', error);
    return null;
  }
}

async function validateRecordInput(env, ownerId, record, body) {
  if (!record.domain) return fail(400, 'DOMAIN_REQUIRED', '请选择记录所属场景');
  if (!record.type) return fail(400, 'TYPE_REQUIRED', '请选择记录类型');
  if (!isTypeAllowedInDomain(record.type, record.domain)) {
    return fail(400, 'TYPE_DOMAIN_MISMATCH', '当前场景不能选择这个记录类型');
  }

  const projectError = await validateActiveProjectNames(env, ownerId, record.projects);
  if (projectError) return projectError;

  if (record.type !== 'task') return null;

  const taskTitle = cleanText(body.taskTitle || record.structuredPayload.taskTitle || record.summary || firstLine(record.content));
  if (!taskTitle) return fail(400, 'TASK_TITLE_REQUIRED', '任务记录需要一个明确标题');

  return null;
}

async function createInitialDestinations(env, record, body) {
  const destinations = [];

  if (record.type === 'task') {
    const followup = await createFollowupFromRecord(env, record, body);
    if (followup) destinations.push({ type: 'followup', id: followup.id });
  }

  return destinations;
}

async function createFollowupFromRecord(env, record, body) {
  const now = nowIso();
  const id = crypto.randomUUID();
  const title = cleanText(body.taskTitle || record.structuredPayload.taskTitle || record.summary || firstLine(record.content));
  if (!title) return null;

  const status = normalizeFollowupStatus(body.status);
  if (status === 'closed' || status === 'dropped') return null;
  await env.DB.batch([env.DB.prepare(`
    INSERT INTO followups (
      id, owner_id, text, note, domain, project, status, source_record_id, source_type, due_date,
      created_at, updated_at, closed_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'record', ?, ?, ?, ?)
  `).bind(
    id,
    record.ownerId,
    title,
    cleanText(body.note),
    record.domain,
    cleanText(record.projects[0]),
    status,
    record.id,
    cleanDate(body.dueDate || record.structuredPayload.dueDate),
    now,
    now,
    null
  ), createFollowupCreatedEvent(env, record.ownerId, id, status, now, record.id)]);

  return { id };
}

function createFollowupCreatedEvent(env, ownerId, followupId, status, now, sourceRecordId) {
  return env.DB.prepare(`
    INSERT INTO followup_events (
      id, owner_id, followup_id, event_type, from_status, to_status, note, metadata_json, created_at
    ) VALUES (?, ?, ?, 'created', NULL, ?, NULL, ?, ?)
  `).bind(
    crypto.randomUUID(), ownerId, followupId, status,
    JSON.stringify({ sourceType: 'record', sourceRecordId }), now
  );
}

function buildStructuredPayload(body) {
  const existing = sanitizeObject(body?.structuredPayload);
  return sanitizeObject({
    ...existing,
    taskTitle: body?.taskTitle,
    dueDate: cleanDate(body?.dueDate),
    title: body?.title,
    angle: body?.angle,
    outline: Array.isArray(body?.outline) ? body.outline : [],
    noteKind: body?.noteKind,
    sleepHours: existing.sleepHours,
    exercise: existing.exercise,
    bodyState: existing.bodyState
  });
}

function isTypeAllowedInDomain(type, domain) {
  const lifeOnly = new Set(['diary', 'health']);
  if (lifeOnly.has(type)) return domain === 'life';
  return true;
}

function sanitizeObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item != null && item !== '')
      .map(([key, item]) => [key, Array.isArray(item) ? item.map(String).filter(Boolean) : item])
  );
}

function cleanText(value) {
  const text = String(value || '').trim();
  return text || null;
}

function cleanDate(value) {
  const text = cleanText(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text || '') ? text : null;
}

function normalizeProjectRefs(projects) {
  if (!Array.isArray(projects)) return [];
  return uniqueTexts(projects).slice(0, 5);
}

async function validateActiveProjectNames(env, ownerId, projectNames = []) {
  const names = uniqueTexts(projectNames);
  if (!names.length) return null;

  const placeholders = names.map(() => '?').join(', ');
  const rows = await env.DB.prepare(`
    SELECT name, status
    FROM projects
    WHERE owner_id = ? AND deleted_at IS NULL AND name IN (${placeholders})
  `).bind(ownerId, ...names).all();

  const byName = new Map((rows.results || []).map(row => [row.name, row]));
  const missing = names.find(name => !byName.has(name));
  if (missing) return fail(400, 'PROJECT_NOT_FOUND', '关联项目必须从已有可用项目中选择');

  const closed = names
    .map(name => byName.get(name))
    .find(project => !isActiveProjectStatus(project.status));
  if (closed) return fail(400, 'PROJECT_CLOSED', '完成或废弃的项目不能继续关联新记录');

  return null;
}

function firstLine(value) {
  return String(value || '').trim().split(/\n+/)[0]?.slice(0, 80) || '';
}

function normalizeTopicTags(tags) {
  if (!Array.isArray(tags)) return [];
  return Array.from(new Set(tags.map(item => String(item || '').trim()).filter(Boolean))).slice(0, 3);
}

function normalizeDestinationType(type) {
  const normalized = String(type || '').trim();
  const allowed = new Set(['followup', 'content', 'daily_review', 'project']);
  return allowed.has(normalized) ? normalized : null;
}

function firstObject(value) {
  return Array.isArray(value) ? value.find(item => item && typeof item === 'object') : null;
}

function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value];
}

function firstText(value) {
  return toArray(value).map(item => String(item || '').trim()).find(Boolean) || null;
}

function firstDestinationName(suggestions = [], type) {
  const item = toArray(suggestions).find(candidate => candidate?.type === type);
  return cleanText(item?.name || item?.project || item?.title);
}

function uniqueTexts(values = []) {
  const result = [];
  values.forEach(value => {
    const text = String(value || '').trim();
    if (text && !result.includes(text)) result.push(text);
  });
  return result;
}

function appendUniqueLine(existing, line) {
  const current = String(existing || '').trim();
  const next = String(line || '').trim();
  if (!next) return current || null;
  if (current.includes(next)) return current;
  return [current, next].filter(Boolean).join('\n');
}

async function uniqueProjectSlug(env, ownerId, baseSlug) {
  let slug = baseSlug;
  let index = 2;
  while (await env.DB.prepare('SELECT id FROM projects WHERE owner_id = ? AND slug = ? LIMIT 1').bind(ownerId, slug).first()) {
    slug = `${baseSlug}-${index}`;
    index += 1;
  }
  return slug;
}

async function getOwnerSession(request, env) {
  const session = await getSession(request, env);
  if (!session) return fail(401, 'UNAUTHORIZED', '请先登录');
  if (session.user.role !== 'owner') return fail(403, 'FORBIDDEN', '当前账号没有写入权限');
  return session;
}
