/* ========================================
   Online Records
   ======================================== */

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
      ${records.map(record => `
        <article class="online-record-card">
          <div class="domain-card-topline">
            <span>${escapeHtml(getDomainLabel(record.domain))} · ${escapeHtml(getTypeLabel(record.type))}</span>
            <time>${escapeHtml(formatDateTime(record.createdAt || record.date))}</time>
          </div>
          <p>${escapeHtml(record.content || record.summary || '')}</p>
          ${buildRecordTags(record)}
          ${buildSuggestion(record.aiSuggestion)}
        </article>
      `).join('')}
    </div>
  `;
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

function getDomainLabel(domain) {
  const labels = {
    work: '主业',
    side_business: '副业',
    life: '生活和自我',
    content: '内容产出'
  };
  return labels[domain] || domain || '未分类';
}

function getTypeLabel(type) {
  const labels = {
    progress: '进展',
    thought: '想法',
    blocker: '卡点',
    reflection: '反思',
    diary: '日记',
    content_seed: '内容素材'
  };
  return labels[type] || type || '记录';
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
