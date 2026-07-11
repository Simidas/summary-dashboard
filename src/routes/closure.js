import {
  mapDailyFocus,
  mapInsight,
  mapSuggestionDecision,
  normalizeDomain,
  nowIso,
  toJsonText,
  todayShanghai
} from '../lib/db.js';
import { fail, ok, readJson } from '../lib/response.js';
import { validationResponse } from '../lib/schema.js';
import { assertCsrf } from '../lib/session.js';
import { requireOwner } from '../services/auth-service.js';
import {
  validateDailyFocusBody,
  validateInsightBody,
  validateSuggestionDecisionBody
} from '../services/input-schemas.js';
import { calculateClosureMetrics } from '../services/closure-metrics.js';

export async function handleClosure(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === '/api/closure-metrics' && request.method === 'GET') {
    return getClosureMetrics(request, env, url);
  }

  const decisionsMatch = path.match(/^\/api\/records\/([^/]+)\/decisions$/);
  if (decisionsMatch && request.method === 'GET') return listDecisions(request, env, decisionsMatch[1]);
  if (decisionsMatch && request.method === 'POST') return saveDecision(request, env, decisionsMatch[1]);

  if (path === '/api/insights' && request.method === 'GET') return listInsights(request, env, url);
  if (path === '/api/insights' && request.method === 'POST') return createInsight(request, env);
  const insightMatch = path.match(/^\/api\/insights\/([^/]+)$/);
  if (insightMatch && request.method === 'PATCH') return updateInsight(request, env, insightMatch[1]);
  if (insightMatch && request.method === 'DELETE') return deleteInsight(request, env, insightMatch[1]);

  const focusMatch = path.match(/^\/api\/daily-focus\/([^/]+)$/);
  if (focusMatch && request.method === 'GET') return getDailyFocus(request, env, focusMatch[1]);
  if (focusMatch && request.method === 'PUT') return putDailyFocus(request, env, focusMatch[1]);

  return fail(404, 'NOT_FOUND', 'Closure endpoint not found');
}

async function getClosureMetrics(request, env, url) {
  const auth = await requireOwner(request, env);
  if (auth.error) return auth.error;
  const type = url.searchParams.get('type');
  const key = url.searchParams.get('key');
  const metrics = await calculateClosureMetrics(env, auth.session.user.id, type, key);
  if (!metrics) return fail(400, 'PERIOD_INVALID', '周期参数不正确');
  return ok({ metrics });
}

async function listDecisions(request, env, recordId) {
  const auth = await requireOwner(request, env);
  if (auth.error) return auth.error;
  const rows = await env.DB.prepare(`
    SELECT * FROM suggestion_decisions
    WHERE owner_id = ? AND record_id = ?
    ORDER BY updated_at DESC
  `).bind(auth.session.user.id, recordId).all();
  return ok({ decisions: (rows.results || []).map(mapSuggestionDecision) });
}

async function saveDecision(request, env, recordId) {
  const auth = await requireOwnerWrite(request, env);
  if (auth.error) return auth.error;
  const parsed = await validatedBody(request, validateSuggestionDecisionBody);
  if (parsed.error) return parsed.error;
  const body = parsed.data;

  const source = await env.DB.prepare(`
    SELECT s.id FROM ai_suggestions s
    JOIN records r ON r.id = s.record_id
    WHERE s.id = ? AND s.record_id = ? AND s.owner_id = ? AND r.deleted_at IS NULL
    LIMIT 1
  `).bind(body.suggestionId, recordId, auth.session.user.id).first();
  if (!source) return fail(404, 'SUGGESTION_NOT_FOUND', 'AI 建议不存在');

  const now = nowIso();
  await env.DB.prepare(`
    INSERT INTO suggestion_decisions (
      id, owner_id, suggestion_id, record_id, candidate_type, candidate_key,
      decision, destination_type, destination_id, original_payload_json,
      final_payload_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(owner_id, suggestion_id, candidate_type, candidate_key) DO UPDATE SET
      decision = excluded.decision,
      destination_type = excluded.destination_type,
      destination_id = excluded.destination_id,
      original_payload_json = excluded.original_payload_json,
      final_payload_json = excluded.final_payload_json,
      updated_at = excluded.updated_at
  `).bind(
    crypto.randomUUID(), auth.session.user.id, body.suggestionId, recordId,
    body.candidateType, body.candidateKey, body.decision,
    body.destinationType || null, body.destinationId || null,
    JSON.stringify(body.originalPayload || {}), JSON.stringify(body.finalPayload || {}), now, now
  ).run();

  const row = await env.DB.prepare(`
    SELECT * FROM suggestion_decisions
    WHERE owner_id = ? AND suggestion_id = ? AND candidate_type = ? AND candidate_key = ?
  `).bind(auth.session.user.id, body.suggestionId, body.candidateType, body.candidateKey).first();
  return ok({ decision: mapSuggestionDecision(row) }, { status: 201 });
}

async function listInsights(request, env, url) {
  const auth = await requireOwner(request, env);
  if (auth.error) return auth.error;
  const status = url.searchParams.get('status');
  const domain = normalizeDomain(url.searchParams.get('domain'));
  const clauses = ['owner_id = ?', 'deleted_at IS NULL'];
  const params = [auth.session.user.id];
  if (status) { clauses.push('status = ?'); params.push(status); }
  if (domain) { clauses.push('domain = ?'); params.push(domain); }
  const rows = await env.DB.prepare(`
    SELECT * FROM insights WHERE ${clauses.join(' AND ')} ORDER BY updated_at DESC
  `).bind(...params).all();
  return ok({ insights: (rows.results || []).map(mapInsight) });
}

async function createInsight(request, env) {
  const auth = await requireOwnerWrite(request, env);
  if (auth.error) return auth.error;
  const parsed = await validatedBody(request, input => validateInsightBody(input));
  if (parsed.error) return parsed.error;
  const body = parsed.data;
  if (body.sourceSuggestionId && body.candidateKey) {
    const existingDecision = await env.DB.prepare(`
      SELECT destination_id FROM suggestion_decisions
      WHERE owner_id = ? AND suggestion_id = ? AND candidate_type = 'insight' AND candidate_key = ?
        AND decision IN ('accepted', 'modified')
      LIMIT 1
    `).bind(auth.session.user.id, body.sourceSuggestionId, body.candidateKey).first();
    if (existingDecision?.destination_id) {
      const existingInsight = await findInsight(env, auth.session.user.id, existingDecision.destination_id);
      if (existingInsight) return ok({ insight: mapInsight(existingInsight), created: false });
    }
  }
  const referenceError = await validateInsightReferences(env, auth.session.user.id, body);
  if (referenceError) return referenceError;
  const now = nowIso();
  const id = crypto.randomUUID();
  const status = body.status || 'observing';
  const statements = [env.DB.prepare(`
    INSERT INTO insights (
      id, owner_id, text, type, status, domain, project_id, source_record_id,
      source_suggestion_id, evidence_json, validation_note, confirmed_at,
      invalidated_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, auth.session.user.id, body.text, body.type, status, body.domain || null,
    body.projectId || null, body.sourceRecordId, body.sourceSuggestionId || null,
    toJsonText(body.evidence), body.validationNote || null,
    status === 'confirmed' ? now : null, status === 'invalidated' ? now : null, now, now
  )];
  if (body.sourceSuggestionId && body.candidateKey) {
    statements.push(env.DB.prepare(`
      INSERT INTO suggestion_decisions (
        id, owner_id, suggestion_id, record_id, candidate_type, candidate_key,
        decision, destination_type, destination_id, original_payload_json,
        final_payload_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'insight', ?, 'accepted', 'insight', ?, ?, ?, ?, ?)
      ON CONFLICT(owner_id, suggestion_id, candidate_type, candidate_key) DO UPDATE SET
        decision = 'accepted', destination_type = 'insight', destination_id = excluded.destination_id,
        final_payload_json = excluded.final_payload_json, updated_at = excluded.updated_at
    `).bind(
      crypto.randomUUID(), auth.session.user.id, body.sourceSuggestionId, body.sourceRecordId,
      body.candidateKey, id, JSON.stringify({ text: body.text, type: body.type, evidence: body.evidence || [] }),
      JSON.stringify({ insightId: id, text: body.text, type: body.type }), now, now
    ));
  }
  await env.DB.batch(statements);
  const row = await findInsight(env, auth.session.user.id, id);
  return ok({ insight: mapInsight(row), created: true }, { status: 201 });
}

async function updateInsight(request, env, id) {
  const auth = await requireOwnerWrite(request, env);
  if (auth.error) return auth.error;
  const existing = await findInsight(env, auth.session.user.id, id);
  if (!existing) return fail(404, 'NOT_FOUND', '认知不存在');
  const parsed = await validatedBody(request, input => validateInsightBody(input, { required: false }));
  if (parsed.error) return parsed.error;
  const body = parsed.data;
  const merged = {
    ...body,
    sourceRecordId: body.sourceRecordId || existing.source_record_id,
    sourceSuggestionId: body.sourceSuggestionId ?? existing.source_suggestion_id,
    projectId: body.projectId ?? existing.project_id
  };
  const referenceError = await validateInsightReferences(env, auth.session.user.id, merged);
  if (referenceError) return referenceError;
  const now = nowIso();
  const status = body.status || existing.status;
  await env.DB.prepare(`
    UPDATE insights SET text = ?, type = ?, status = ?, domain = ?, project_id = ?,
      source_record_id = ?, source_suggestion_id = ?, evidence_json = ?, validation_note = ?,
      confirmed_at = ?, invalidated_at = ?, updated_at = ?
    WHERE id = ? AND owner_id = ?
  `).bind(
    body.text || existing.text, body.type || existing.type, status,
    body.domain ?? existing.domain, merged.projectId, merged.sourceRecordId,
    merged.sourceSuggestionId, body.evidence == null ? existing.evidence_json : toJsonText(body.evidence),
    body.validationNote ?? existing.validation_note,
    status === 'confirmed' ? existing.confirmed_at || now : null,
    status === 'invalidated' ? existing.invalidated_at || now : null,
    now, id, auth.session.user.id
  ).run();
  return ok({ insight: mapInsight(await findInsight(env, auth.session.user.id, id)) });
}

async function deleteInsight(request, env, id) {
  const auth = await requireOwnerWrite(request, env);
  if (auth.error) return auth.error;
  await env.DB.prepare('UPDATE insights SET deleted_at = ?, updated_at = ? WHERE id = ? AND owner_id = ?')
    .bind(nowIso(), nowIso(), id, auth.session.user.id).run();
  return ok({ id, deleted: true });
}

async function getDailyFocus(request, env, rawDate) {
  const auth = await requireOwner(request, env);
  if (auth.error) return auth.error;
  const date = normalizeDate(rawDate);
  if (!date) return fail(400, 'DATE_INVALID', '日期格式不正确');
  const row = await env.DB.prepare('SELECT * FROM daily_focus WHERE owner_id = ? AND date = ?')
    .bind(auth.session.user.id, date).first();
  return ok({ focus: mapDailyFocus(row) });
}

async function putDailyFocus(request, env, rawDate) {
  const auth = await requireOwnerWrite(request, env);
  if (auth.error) return auth.error;
  const date = normalizeDate(rawDate);
  if (!date) return fail(400, 'DATE_INVALID', '日期格式不正确');
  const parsed = await validatedBody(request, validateDailyFocusBody);
  if (parsed.error) return parsed.error;
  const body = parsed.data;
  const referenceError = await validateFocusReferences(env, auth.session.user.id, body);
  if (referenceError) return referenceError;
  const now = nowIso();
  const status = body.status || 'active';
  await env.DB.prepare(`
    INSERT INTO daily_focus (
      id, owner_id, date, text, followup_id, project_id, status, completed_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(owner_id, date) DO UPDATE SET
      text = excluded.text, followup_id = excluded.followup_id,
      project_id = excluded.project_id, status = excluded.status,
      completed_at = excluded.completed_at, updated_at = excluded.updated_at
  `).bind(
    crypto.randomUUID(), auth.session.user.id, date, body.text, body.followupId || null,
    body.projectId || null, status, status === 'completed' ? now : null, now, now
  ).run();
  const row = await env.DB.prepare('SELECT * FROM daily_focus WHERE owner_id = ? AND date = ?')
    .bind(auth.session.user.id, date).first();
  return ok({ focus: mapDailyFocus(row) });
}

async function requireOwnerWrite(request, env) {
  const auth = await requireOwner(request, env);
  if (auth.error) return auth;
  if (!assertCsrf(request, auth.session, env)) return { error: fail(403, 'CSRF_FAILED', '请求校验失败') };
  return auth;
}

async function validatedBody(request, validator) {
  try { return { data: validator(await readJson(request)) }; }
  catch (error) { return { error: validationResponse(error, fail) || fail(400, 'INVALID_INPUT', '输入内容不符合要求') }; }
}

function findInsight(env, ownerId, id) {
  return env.DB.prepare('SELECT * FROM insights WHERE id = ? AND owner_id = ? AND deleted_at IS NULL')
    .bind(id, ownerId).first();
}

async function validateInsightReferences(env, ownerId, body) {
  const record = await env.DB.prepare('SELECT id FROM records WHERE id = ? AND owner_id = ? AND deleted_at IS NULL')
    .bind(body.sourceRecordId, ownerId).first();
  if (!record) return fail(400, 'SOURCE_RECORD_NOT_FOUND', '来源记录不存在');
  if (body.projectId) {
    const project = await env.DB.prepare('SELECT id FROM projects WHERE id = ? AND owner_id = ? AND deleted_at IS NULL')
      .bind(body.projectId, ownerId).first();
    if (!project) return fail(400, 'PROJECT_NOT_FOUND', '关联项目不存在');
  }
  if (body.sourceSuggestionId) {
    const suggestion = await env.DB.prepare('SELECT id FROM ai_suggestions WHERE id = ? AND owner_id = ? AND record_id = ?')
      .bind(body.sourceSuggestionId, ownerId, body.sourceRecordId).first();
    if (!suggestion) return fail(400, 'SUGGESTION_NOT_FOUND', '来源 AI 建议不存在');
  }
  return null;
}

async function validateFocusReferences(env, ownerId, body) {
  if (body.followupId) {
    const row = await env.DB.prepare('SELECT id FROM followups WHERE id = ? AND owner_id = ? AND deleted_at IS NULL')
      .bind(body.followupId, ownerId).first();
    if (!row) return fail(400, 'FOLLOWUP_NOT_FOUND', '关联待办不存在');
  }
  if (body.projectId) {
    const row = await env.DB.prepare('SELECT id FROM projects WHERE id = ? AND owner_id = ? AND deleted_at IS NULL')
      .bind(body.projectId, ownerId).first();
    if (!row) return fail(400, 'PROJECT_NOT_FOUND', '关联项目不存在');
  }
  return null;
}

function normalizeDate(value) {
  if (value === 'today') return todayShanghai();
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}
