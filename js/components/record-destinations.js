/* ========================================
   Record Destination Actions
   ======================================== */

import { applyRecordDestination } from '../api.js?v=20260703a';
import { getAuthState } from '../auth.js?v=20260703a';

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
  const candidates = collectCandidates(record || {}, aiSuggestion, applied);
  if (!applied.length && !candidates.length) return '';

  return `
    <div class="record-routing-panel" data-record-routing-panel="${escapeAttr(recordId)}">
      <div class="record-routing-title">AI 分流建议</div>
      ${applied.length ? `
        <div class="record-routing-applied">
          ${applied.map(item => `<span>${escapeHtml(item.label)}</span>`).join('')}
        </div>
      ` : ''}
      ${candidates.length ? `
        <div class="record-routing-actions">
          ${candidates.map(item => `
            <button
              type="button"
              data-record-destination-type="${escapeAttr(item.type)}"
              data-record-id="${escapeAttr(recordId)}"
              ${item.name ? `data-record-destination-name="${escapeAttr(item.name)}"` : ''}
              title="${escapeAttr(item.reason || item.label)}"
            >${escapeHtml(item.label)}</button>
          `).join('')}
        </div>
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

function collectCandidates(record, aiSuggestion, applied = []) {
  const appliedTypes = new Set(applied.map(item => item.type));
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

  return result.slice(0, 4);
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
