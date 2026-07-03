/* ========================================
   Unified Record Form
   ======================================== */

import { createRecord } from '../api.js?v=20260703e';
import { buildAiPendingCard, waitForRecordAiSuggestion } from './ai-polling.js?v=20260703e';
import { bindRecordDestinationActions, buildRecordDestinationActions } from './record-destinations.js?v=20260703e';
import {
  DOMAIN_OPTIONS,
  getAvailableRecordTypes,
  getRecordTypeHint,
  getRecordTypeLabel,
  getTopicTagOptions,
  normalizeRecordTypeForDomain
} from './record-types.js?v=20260703e';

export function buildUnifiedRecordForm(options = {}) {
  const id = options.id || 'unified-record';
  const defaultDomain = options.defaultDomain || localStorage.getItem('summary-dashboard:last-domain') || 'life';
  const defaultType = normalizeRecordTypeForDomain(options.defaultType || 'note', defaultDomain);
  const projects = options.projects || [];
  const title = options.title || '记一笔';
  const subtitle = options.subtitle || '先低摩擦写下来，系统再帮你结构化、分析和分流。';

  return `
    <section class="record-capture-panel unified-record-panel" data-unified-record-panel="${escapeAttr(id)}">
      <div class="record-capture-intro">
        <div class="ops-kicker">${escapeHtml(options.kicker || '统一记录中枢')}</div>
        <h2>${escapeHtml(title)}</h2>
        <p class="record-feedback-text">${escapeHtml(subtitle)}</p>
      </div>
      <form class="online-record-form unified-record-form" id="${escapeAttr(id)}-form">
        <textarea name="content" rows="${options.rows || 5}" placeholder="${escapeAttr(options.placeholder || '现在发生了什么？情绪、任务、想法、进展都可以直接写。')}"></textarea>
        <div class="record-form-grid">
          <label>
            <span>场景</span>
            <select name="domain">
              ${DOMAIN_OPTIONS.map(item => `<option value="${escapeAttr(item.value)}" ${item.value === defaultDomain ? 'selected' : ''}>${escapeHtml(item.label)}</option>`).join('')}
            </select>
          </label>
          <label>
            <span>类型</span>
            <select name="type">
              ${buildTypeOptions(defaultDomain, defaultType)}
            </select>
          </label>
          <label>
            <span>可见性</span>
            <select name="visibility">
              <option value="private">私密</option>
              <option value="public">公开</option>
            </select>
          </label>
        </div>
        <div class="record-type-hint" data-record-type-hint>${escapeHtml(getRecordTypeHint(defaultType))}</div>
        <details class="advanced-record-fields">
          <summary>补充字段</summary>
          <div class="record-form-grid">
            <label data-task-field>
              <span>任务标题</span>
              <input name="taskTitle" placeholder="任务类会进入未闭环事项">
            </label>
            <label>
              <span>关联项目</span>
              <select name="project">
                <option value="">不关联项目</option>
                ${projects.map(project => `<option value="${escapeAttr(project.name)}">${escapeHtml(project.name)}</option>`).join('')}
              </select>
            </label>
            <label data-task-field>
              <span>计划时间</span>
              <input name="dueDate" type="date">
            </label>
            <label>
              <span>情绪</span>
              <input name="mood" placeholder="焦虑 / 开心 / 疲惫...">
            </label>
            <label>
              <span>精力</span>
              <select name="energy">
                <option value="">不记录</option>
                <option value="1">1 低</option>
                <option value="2">2</option>
                <option value="3">3</option>
                <option value="4">4</option>
                <option value="5">5 高</option>
              </select>
            </label>
            <label>
              <span>枚举主题标签</span>
              <div class="tag-choice-list" data-topic-tag-options>
                ${buildTagPresetOptions(defaultType)}
              </div>
            </label>
            <label>
              <span>手动标签</span>
              <input name="manualTags" placeholder="枚举没有时填写，最多补到 3 个">
            </label>
            <label data-health-field>
              <span>睡眠时长</span>
              <input name="sleepHours" inputmode="decimal" placeholder="例如 6.5">
            </label>
            <label data-health-field>
              <span>运动</span>
              <input name="exercise" placeholder="例如 快走 30 分钟">
            </label>
            <label data-health-field>
              <span>饮食/身体状态</span>
              <input name="bodyState" placeholder="例如 饮食清淡，下午犯困">
            </label>
          </div>
        </details>
        <div class="record-form-footer">
          <span class="form-status" id="${escapeAttr(id)}-status"></span>
          <button class="primary-action" type="submit">${escapeHtml(options.submitLabel || '保存并生成建议')}</button>
        </div>
      </form>
      <div id="${escapeAttr(id)}-result"></div>
    </section>
  `;
}

export function bindUnifiedRecordForm(root, options = {}) {
  const id = options.id || 'unified-record';
  const form = root.querySelector(`#${cssEscape(id)}-form`);
  if (!form) return;

  const typeSelect = form.elements.type;
  const domainSelect = form.elements.domain;
  const hint = root.querySelector(`[data-unified-record-panel="${cssEscape(id)}"] [data-record-type-hint]`);
  const status = root.querySelector(`#${cssEscape(id)}-status`);
  const result = root.querySelector(`#${cssEscape(id)}-result`);
  bindRecordDestinationActions(root);

  domainSelect?.addEventListener('change', () => {
    refreshTypeOptions(form, typeSelect.value);
    updateTypeState(form, hint);
  });
  typeSelect?.addEventListener('change', () => updateTypeState(form, hint));
  form.addEventListener('change', (event) => {
    if (event.target?.name !== 'tagPresets') return;
    const checked = form.querySelectorAll('[name="tagPresets"]:checked');
    if (checked.length > 3) {
      event.target.checked = false;
      status.textContent = '主题标签最多选择 3 个。';
    }
  });
  refreshTypeOptions(form, typeSelect?.value || 'note');
  updateTypeState(form, hint);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const content = form.elements.content.value.trim();
    const type = form.elements.type.value;
    const taskTitle = form.elements.taskTitle?.value.trim() || firstLine(content);
    if (!content) {
      status.textContent = '先写一句就可以。';
      return;
    }
    if (type === 'task' && !taskTitle) {
      status.textContent = '任务需要一个标题。';
      return;
    }

    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    status.textContent = '保存中...';
    result.innerHTML = '';

    const project = form.elements.project?.value || '';
    const payload = {
      content,
      domain: form.elements.domain.value,
      type,
      visibility: form.elements.visibility.value,
      mood: form.elements.mood?.value.trim() || null,
      energy: form.elements.energy?.value || null,
      projects: project ? [project] : [],
      tags: collectTopicTags(form),
      taskTitle,
      dueDate: form.elements.dueDate?.value || null,
      structuredPayload: {
        sleepHours: form.elements.sleepHours?.value || null,
        exercise: form.elements.exercise?.value.trim() || null,
        bodyState: form.elements.bodyState?.value.trim() || null
      }
    };

    try {
      const data = await createRecord(payload);
      localStorage.setItem('summary-dashboard:last-domain', payload.domain);
      form.reset();
      form.elements.domain.value = payload.domain;
      refreshTypeOptions(form, type);
      updateTypeState(form, hint);
      status.textContent = data.aiPending ? buildSavedText(data.destinations) : '已保存';
      result.innerHTML = data.aiPending
        ? buildAiPendingCard('记录已保存，AI 正在根据类型生成更合适的反馈。')
        : buildUnifiedAiResult(data.aiSuggestion, data.destinations, data.record);
      options.onSaved?.(data);

      if (data.aiPending) {
        waitForRecordAiSuggestion(data.record.id, {
          onReady: (aiSuggestion, record) => {
            status.textContent = 'AI 建议已生成';
            result.innerHTML = buildUnifiedAiResult(aiSuggestion, data.destinations, record || data.record);
            options.onAiReady?.(aiSuggestion, record);
          },
          onTimeout: () => {
            status.textContent = '已保存，AI 建议稍后会出现在记录里';
          }
        });
      }
    } catch (error) {
      status.textContent = '';
      result.innerHTML = `
        <div class="access-note danger-note">
          <strong>保存失败</strong>
          <p>${escapeHtml(error.message || '请稍后重试。')}</p>
        </div>
      `;
    } finally {
      button.disabled = false;
    }
  });
}

export function buildUnifiedAiResult(aiSuggestion, destinations = [], record = null) {
  if (!aiSuggestion) {
    return '<div class="empty-inline">记录已保存，AI 建议稍后生成。</div>';
  }

  return `
    <article class="ai-result-card">
      <div class="domain-card-topline">
        <span>${aiSuggestion.status === 'completed' ? 'AI 类型化建议' : 'AI 待重试'}</span>
        <span>${escapeHtml(aiSuggestion.model || '')}</span>
      </div>
      ${aiSuggestion.summary ? `<p><strong>摘要：</strong>${escapeHtml(aiSuggestion.summary)}</p>` : ''}
      ${aiSuggestion.validation ? `<p><strong>接住你的是：</strong>${escapeHtml(aiSuggestion.validation)}</p>` : ''}
      ${aiSuggestion.emotionalRead ? `<p><strong>状态判断：</strong>${escapeHtml(aiSuggestion.emotionalRead)}</p>` : ''}
      <div class="next-small-step">
        <span>现在只做这一步</span>
        <strong>${escapeHtml(aiSuggestion.nextSmallStep || '先把这条记录保存下来。')}</strong>
      </div>
      ${buildAiLabelGroups(aiSuggestion.structuredResult?.labelGroups)}
      ${buildDestinationList(destinations, aiSuggestion.destinationSuggestions)}
      ${buildRecordDestinationActions(record || { id: aiSuggestion.recordId, type: aiSuggestion.recordType }, aiSuggestion, destinations)}
      ${aiSuggestion.encouragement ? `<p>${escapeHtml(aiSuggestion.encouragement)}</p>` : ''}
    </article>
  `;
}

function buildTypeOptions(domain, selectedType) {
  return getAvailableRecordTypes(domain)
    .map(item => `<option value="${escapeAttr(item.value)}" ${item.value === selectedType ? 'selected' : ''}>${escapeHtml(item.label)}</option>`)
    .join('');
}

function refreshTypeOptions(form, preferredType) {
  const domain = form.elements.domain.value;
  const type = normalizeRecordTypeForDomain(preferredType, domain);
  form.elements.type.innerHTML = buildTypeOptions(domain, type);
  form.elements.type.value = type;
  refreshTagPresetOptions(form, type);
}

function updateTypeState(form, hint) {
  const type = form.elements.type.value;
  if (hint) hint.textContent = getRecordTypeHint(type);
  form.classList.toggle('is-task-record', type === 'task');
  form.classList.toggle('is-health-record', type === 'health');
  refreshTagPresetOptions(form, type);
}

function buildTagPresetOptions(type, selected = '') {
  const options = getTopicTagOptions(type);
  const selectedTags = Array.isArray(selected) ? selected : [selected].filter(Boolean);
  return options.map(tag => `
    <label>
      <input type="checkbox" name="tagPresets" value="${escapeAttr(tag)}" ${selectedTags.includes(tag) ? 'checked' : ''}>
      <span>${escapeHtml(tag)}</span>
    </label>
  `).join('');
}

function refreshTagPresetOptions(form, type) {
  const container = form.querySelector('[data-topic-tag-options]');
  if (!container) return;
  const selected = Array.from(form.querySelectorAll('[name="tagPresets"]:checked')).map(item => item.value);
  container.innerHTML = buildTagPresetOptions(type, selected);
}

function buildAiLabelGroups(labelGroups = {}) {
  const groups = [
    ['状态标签', labelGroups.statusTags],
    ['对象标签', labelGroups.objectTags],
    ['行动标签', labelGroups.actionTags],
    ['影响标签', labelGroups.impactTags]
  ].filter(([, tags]) => Array.isArray(tags) && tags.length);

  if (!groups.length) return '';

  return `
    <div class="ai-label-groups">
      ${groups.map(([label, tags]) => `
        <div>
          <span>${escapeHtml(label)}</span>
          <strong>${tags.slice(0, 5).map(tag => escapeHtml(tag)).join(' / ')}</strong>
        </div>
      `).join('')}
    </div>
  `;
}

function buildSavedText(destinations = []) {
  const labels = destinations.map(item => ({
    followup: '未闭环事项',
    content: '内容素材'
  }[item.type])).filter(Boolean);
  return labels.length ? `已保存，并进入${labels.join('、')}，AI 建议生成中...` : '已保存，AI 建议生成中...';
}

function buildDestinationList(destinations = [], suggestions = []) {
  const items = [
    ...destinations.map(item => ({
      label: item.type === 'followup' ? '已加入未闭环事项' : item.type === 'content' ? '已加入内容素材' : '已分流',
      reason: '来自记录类型的自动分流'
    })),
    ...(suggestions || []).map(item => ({
      label: `建议流向：${item.type || '待判断'}`,
      reason: item.reason || ''
    }))
  ];

  if (!items.length) return '';

  return `
    <div class="record-destination-list">
      ${items.slice(0, 4).map(item => `
        <span>${escapeHtml(item.label)}${item.reason ? ` · ${escapeHtml(item.reason)}` : ''}</span>
      `).join('')}
    </div>
  `;
}

function collectTopicTags(form) {
  return [
    ...Array.from(form.querySelectorAll('[name="tagPresets"]:checked')).map(item => item.value),
    ...splitTags(form.elements.manualTags?.value)
  ].filter(Boolean).slice(0, 3);
}

function splitTags(value) {
  return String(value || '')
    .split(/[,，\s]+/)
    .map(item => item.trim())
    .filter(Boolean)
    .filter((item, index, list) => list.indexOf(item) === index);
}

function firstLine(value) {
  return String(value || '').trim().split(/\n+/)[0]?.slice(0, 80) || '';
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

export { getRecordTypeLabel };
