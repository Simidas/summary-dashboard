/* ========================================
   Record Destination Actions
   ======================================== */

import { applyRecordDestination, createInsight, saveRecordDecision } from '../api.js?v=20260711a';
import { getAuthState } from '../auth.js?v=20260711a';

const boundRoots = new WeakSet();

const DESTINATION_META = {
  followup: {
    label: '生成待办',
    appliedLabel: '已加入未闭环事项'
  },
  content: {
    label: '转为内容素材',
    appliedLabel: '已加入内容素材'
  },
  daily_review: {
    label: '纳入 Daily',
    appliedLabel: '已纳入 Daily 复盘'
  },
  project: {
    label: '加入项目',
    appliedLabel: '已关联项目'
  }
};

export function buildRecordDestinationActions(record, aiSuggestion, destinations = []) {
  const recordId = record?.id || aiSuggestion?.recordId;
  if (!canApplyDestinations()) return '';
  if (!recordId || !aiSuggestion || aiSuggestion.status !== 'completed') return '';

  const applied = normalizeAppliedDestinations(destinations);
  const decisions = record?.decisions || [];
  const candidates = collectCandidates(record || {}, aiSuggestion, applied, decisions);
  const insightCandidates = collectInsightCandidates(aiSuggestion, decisions);
  const confirmedInsights = record?.insights || [];
  if (!applied.length && !candidates.length && !insightCandidates.length && !confirmedInsights.length) return '';

  return `
    <div class="record-routing-panel" data-record-routing-panel="${escapeAttr(recordId)}">
      <div class="record-routing-title">AI 提炼结果</div>
      ${confirmedInsights.length ? `
        <div class="record-closure-group">
          <strong>已经记住</strong>
          ${confirmedInsights.map(item => `<div class="record-insight-confirmed">${escapeHtml(item.text)}</div>`).join('')}
        </div>
      ` : ''}
      ${insightCandidates.length ? `
        <div class="record-closure-group">
          <strong>值得记住</strong>
          ${insightCandidates.map(item => `
            <div class="record-insight-candidate" data-insight-candidate="${escapeAttr(item.key)}">
              <span>${escapeHtml(item.text)}</span>
              <div class="record-routing-actions">
                <button type="button" data-insight-action="accept" data-record-id="${escapeAttr(recordId)}"
                  data-suggestion-id="${escapeAttr(aiSuggestion.id)}" data-candidate-key="${escapeAttr(item.key)}"
                  data-insight-type="${escapeAttr(item.type)}" data-insight-text="${escapeAttr(item.text)}"
                  data-insight-evidence="${escapeAttr(JSON.stringify(item.evidence || []))}">记住这个发现</button>
                <button type="button" data-insight-action="dismiss" data-record-id="${escapeAttr(recordId)}"
                  data-suggestion-id="${escapeAttr(aiSuggestion.id)}" data-candidate-key="${escapeAttr(item.key)}">忽略</button>
              </div>
            </div>
          `).join('')}
        </div>
      ` : ''}
      ${applied.length ? `
        <div class="record-routing-applied">
          ${applied.map(item => `<span>${escapeHtml(item.label)}</span>`).join('')}
        </div>
      ` : ''}
      ${candidates.length ? `
        <div class="record-closure-group"><strong>可以去做</strong><div class="record-routing-actions">
          ${candidates.map(item => `
            <span class="record-action-candidate"><button
              type="button"
              data-record-destination-type="${escapeAttr(item.type)}"
              data-record-id="${escapeAttr(recordId)}"
              data-suggestion-id="${escapeAttr(aiSuggestion.id)}"
              data-candidate-key="${escapeAttr(item.key)}"
              ${item.name ? `data-record-destination-name="${escapeAttr(item.name)}"` : ''}
              title="${escapeAttr(item.reason || item.label)}"
            >${escapeHtml(item.label)}</button><button type="button" class="subtle-action"
              data-action-candidate-dismiss="true" data-record-id="${escapeAttr(recordId)}"
              data-suggestion-id="${escapeAttr(aiSuggestion.id)}" data-candidate-key="${escapeAttr(item.key)}"
              data-candidate-type="${escapeAttr(destinationCandidateType(item.type))}">忽略</button></span>
          `).join('')}
        </div></div>
        <div class="record-routing-status" data-record-routing-status="${escapeAttr(recordId)}"></div>
      ` : ''}
    </div>
  `;
}

function canApplyDestinations() {
  const state = getAuthState();
  return state.apiAvailable && state.user?.role === 'owner';
}

export function bindRecordDestinationActions(root, options = {}) {
  if (!root || boundRoots.has(root)) return;
  boundRoots.add(root);

  root.addEventListener('click', async (event) => {
    const insightButton = event.target.closest('[data-insight-action]');
    if (insightButton) {
      await handleInsightAction(insightButton);
      return;
    }
    const dismissButton = event.target.closest('[data-action-candidate-dismiss]');
    if (dismissButton) {
      await dismissCandidate(dismissButton);
      return;
    }
    const button = event.target.closest('[data-record-destination-type]');
    if (!button) return;

    const recordId = button.dataset.recordId;
    const type = button.dataset.recordDestinationType;
    if (!recordId || !type) return;

    const panel = button.closest('[data-record-routing-panel]');
    const status = panel?.querySelector(`[data-record-routing-status="${cssEscape(recordId)}"]`);
    const previousText = button.textContent;
    button.disabled = true;
    button.textContent = '分流中...';
    if (status) status.textContent = '';

    try {
      const data = await applyRecordDestination(recordId, {
        type,
        name: button.dataset.recordDestinationName || undefined
      });
      const label = data.destination?.label || DESTINATION_META[type]?.appliedLabel || '已分流';
      button.textContent = label;
      button.classList.add('is-applied');
      if (status) status.textContent = label;
      options.onApplied?.(data, { recordId, type, button });
    } catch (error) {
      button.disabled = false;
      button.textContent = previousText;
      if (status) status.textContent = error.message || '分流失败，请稍后重试。';
    }
  });
}

function normalizeAppliedDestinations(destinations = []) {
  return (destinations || [])
    .map(item => ({
      type: item.type,
      label: item.label || DESTINATION_META[item.type]?.appliedLabel
    }))
    .filter(item => item.type && item.label);
}

function collectCandidates(record, aiSuggestion, applied = [], decisions = []) {
  const appliedTypes = new Set(applied.map(item => item.type));
  const processedKeys = new Set(decisions.filter(item => item.candidateType !== 'insight').map(item => item.candidateKey));
  const structured = aiSuggestion.structuredResult || {};
  const result = [];

  (aiSuggestion.destinationSuggestions || []).forEach(item => {
    addCandidate(result, record, appliedTypes, {
      type: normalizeDestinationType(item?.type),
      reason: item?.reason,
      name: item?.name || item?.project || item?.title
    });
  });

  if (structured.contentCandidate) {
    addCandidate(result, record, appliedTypes, { type: 'content', reason: 'AI 判断这条记录有内容沉淀价值' });
  }
  if (structured.followupCandidate || aiSuggestion.suggestedFollowUps?.length) {
    addCandidate(result, record, appliedTypes, { type: 'followup', reason: 'AI 判断这条记录有可执行动作' });
  }
  if (structured.reviewCandidate || ['diary', 'review', 'health'].includes(record.type)) {
    addCandidate(result, record, appliedTypes, { type: 'daily_review', reason: '适合成为当天复盘素材' });
  }

  const suggestedProject = firstText(structured.suggestedProjects);
  if (suggestedProject) {
    addCandidate(result, record, appliedTypes, { type: 'project', reason: 'AI 判断这条记录可能属于项目线索', name: suggestedProject });
  }

  return result.map(item => ({ ...item, key: `${item.type}:${item.name || 'default'}` }))
    .filter(item => !processedKeys.has(item.key)).slice(0, 4);
}

function collectInsightCandidates(aiSuggestion, decisions = []) {
  const processed = new Set(decisions.filter(item => item.candidateType === 'insight').map(item => item.candidateKey));
  return (aiSuggestion.structuredResult?.insightCandidates || [])
    .filter(item => item && typeof item === 'object')
    .map((item, index) => ({
      key: String(item.key || `insight-${index}`),
      text: String(item.text || '').trim(),
      type: ['pattern', 'judgment', 'risk', 'preference', 'strategy', 'observation'].includes(item.type)
        ? item.type : 'observation',
      evidence: Array.isArray(item.evidence) ? item.evidence : []
    }))
    .filter(item => item.text && !processed.has(item.key))
    .slice(0, 3);
}

async function handleInsightAction(button) {
  button.disabled = true;
  try {
    if (button.dataset.insightAction === 'accept') {
      await createInsight({
        text: button.dataset.insightText,
        type: button.dataset.insightType,
        status: 'confirmed',
        sourceRecordId: button.dataset.recordId,
        sourceSuggestionId: button.dataset.suggestionId,
        candidateKey: button.dataset.candidateKey,
        evidence: JSON.parse(button.dataset.insightEvidence || '[]')
      });
      button.closest('[data-insight-candidate]')?.replaceWith(buildHandledLabel(`已记住：${button.dataset.insightText}`));
    } else {
      await saveRecordDecision(button.dataset.recordId, {
        suggestionId: button.dataset.suggestionId,
        candidateType: 'insight',
        candidateKey: button.dataset.candidateKey,
        decision: 'dismissed'
      });
      button.closest('[data-insight-candidate]')?.remove();
    }
  } catch (error) {
    button.disabled = false;
    setPanelStatus(button, error.message || '处理失败');
  }
}

async function dismissCandidate(button) {
  button.disabled = true;
  try {
    await saveRecordDecision(button.dataset.recordId, {
      suggestionId: button.dataset.suggestionId,
      candidateType: button.dataset.candidateType,
      candidateKey: button.dataset.candidateKey,
      decision: 'dismissed'
    });
    button.closest('.record-action-candidate')?.remove();
  } catch (error) {
    button.disabled = false;
    setPanelStatus(button, error.message || '处理失败');
  }
}

function destinationCandidateType(type) {
  if (type === 'followup' || type === 'daily_review') return 'action';
  return type;
}

function setPanelStatus(button, message) {
  const target = button.closest('[data-record-routing-panel]')?.querySelector('[data-record-routing-status]');
  if (target) target.textContent = message;
}

function buildHandledLabel(text) {
  const element = document.createElement('div');
  element.className = 'record-insight-confirmed';
  element.textContent = text;
  return element;
}

function addCandidate(result, record, appliedTypes, candidate) {
  const type = candidate.type;
  if (!type || !DESTINATION_META[type] || appliedTypes.has(type)) return;
  if (type === 'followup' && record.type === 'task') return;
  if (type === 'project' && !candidate.name) return;
  if (result.some(item => item.type === type && item.name === candidate.name)) return;

  result.push({
    type,
    name: candidate.name || '',
    label: candidate.name && type === 'project'
      ? `${DESTINATION_META[type].label}：${candidate.name}`
      : DESTINATION_META[type].label,
    reason: candidate.reason || ''
  });
}

function normalizeDestinationType(type) {
  const normalized = String(type || '').trim();
  return DESTINATION_META[normalized] ? normalized : null;
}

function firstText(value) {
  if (!value) return '';
  const list = Array.isArray(value) ? value : [value];
  return list.map(item => String(item || '').trim()).find(Boolean) || '';
}

function cssEscape(value) {
  if (window.CSS?.escape) return window.CSS.escape(value);
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value == null ? '' : String(value);
  return div.innerHTML;
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/"/g, '&quot;');
}
