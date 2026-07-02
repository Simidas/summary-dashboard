/* ========================================
   Online Records
   ======================================== */

import { getDomainLabel, getRecordTypeLabel } from './record-types.js?v=20260702c';

export function buildOnlineRecordsSection(records, options = {}) {
  const title = options.title || '最近在线记录';
  const emptyText = options.emptyText || '还没有线上记录。';

  return `
    <section class="ops-panel online-records-section">
      <div class="section-heading">
        <h2 class="section-title">${escapeHtml(title)}</h2>
      </div>
      ${buildOnlineRecordList(records, emptyText)}
    </section>
  `;
}

export function buildOnlineRecordList(records, emptyText = '还没有线上记录。') {
  if (!records?.length) {
    return `<div class="empty-inline">${escapeHtml(emptyText)}</div>`;
  }

  return `
    <div class="online-record-list">
      ${records.map(buildOnlineRecordCard).join('')}
    </div>
  `;
}

export function buildOnlineRecordCard(record) {
  return `
    <article class="online-record-card" data-online-record-id="${escapeAttr(record.id || '')}">
      <div class="domain-card-topline">
        <span>${escapeHtml(getDomainLabel(record.domain))} · ${escapeHtml(getRecordTypeLabel(record.type))}</span>
        <time>${escapeHtml(formatDateTime(record.createdAt || record.date))}</time>
      </div>
      <p>${escapeHtml(record.content || record.summary || '')}</p>
      ${buildRecordTags(record)}
      ${buildSuggestion(record.aiSuggestion)}
    </article>
  `;
}

export function replaceOnlineRecordCard(root, record) {
  if (!root || !record?.id) return false;
  const card = Array.from(root.querySelectorAll('[data-online-record-id]'))
    .find(item => item.dataset.onlineRecordId === record.id);
  if (!card) return false;
  card.outerHTML = buildOnlineRecordCard(record);
  return true;
}

function buildRecordTags(record) {
  const tags = [
    record.visibility,
    ...(record.tags || []),
    ...(record.projects || [])
  ].filter(Boolean);

  if (!tags.length) return '';

  return `
    <div class="pill-list">
      ${tags.slice(0, 6).map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}
    </div>
  `;
}

function buildSuggestion(suggestion) {
  if (!suggestion?.nextSmallStep) return '';

  return `
    <div class="record-next-step">
      <span>下一小步</span>
      <strong>${escapeHtml(suggestion.nextSmallStep)}</strong>
    </div>
  `;
}

function formatDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 16);

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value == null ? '' : String(value);
  return div.innerHTML;
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/"/g, '&quot;');
}
