/* ========================================
   Domain View
   ======================================== */

import { loadDomainSummary } from '../data.js?v=20260626b';

export async function renderDomainView(container, params = {}) {
  const domainId = params.date || 'work';

  container.innerHTML = `
    <div class="page">
      <div class="skeleton" style="height: 220px;"></div>
    </div>
  `;

  const domain = await loadDomainSummary(domainId);
  if (!domain) {
    renderEmpty(container);
    return;
  }

  const page = document.createElement('div');
  page.className = 'page operations-page';
  page.innerHTML = `
    <section class="ops-hero animate-fade-in-up">
      <div>
        <div class="ops-kicker">${escapeHtml(domain.description)}</div>
        <h1 class="ops-title">${escapeHtml(domain.label)}</h1>
        <p class="ops-hero-focus">${escapeHtml(domain.currentFocus || '这个场景还没有记录。')}</p>
      </div>
      <div class="ops-next-step">
        <span>下一步</span>
        <strong>${escapeHtml(domain.nextAction || '等待下一条记录')}</strong>
      </div>
    </section>

    <section class="metric-grid">
      ${buildMetric(domain.recordCount || 0, '记录')}
      ${buildMetric(domain.progressCount || 0, '进展')}
      ${buildMetric(domain.openFollowUps?.length || 0, 'open')}
      ${buildMetric(domain.contentSeeds?.length || 0, '素材')}
    </section>

    <section class="ops-two-column">
      <div class="ops-panel">
        <div class="section-heading">
          <h2 class="section-title">未闭环事项</h2>
        </div>
        ${buildFollowups(domain.openFollowUps || [])}
      </div>
      <div class="ops-panel">
        <div class="section-heading">
          <h2 class="section-title">高频卡点</h2>
        </div>
        ${buildPillList(domain.blockers || [], '暂无显式卡点')}
      </div>
    </section>

    <section class="ops-panel">
      <div class="section-heading">
        <h2 class="section-title">最近记录</h2>
        <a href="#daily" class="text-link">Daily</a>
      </div>
      ${buildRecordTimeline(domain.recentRecords || [])}
    </section>

    <section class="ops-panel">
      <div class="section-heading">
        <h2 class="section-title">可沉淀内容</h2>
        <a href="#content" class="text-link">Content</a>
      </div>
      ${buildSeeds(domain.contentSeeds || [])}
    </section>
  `;

  container.innerHTML = '';
  container.appendChild(page);
}

function renderEmpty(container) {
  container.innerHTML = `
    <div class="page">
      <div class="empty-state">
        <div class="empty-state-icon">□</div>
        <p class="empty-state-text">这个场景暂时没有数据。</p>
      </div>
    </div>
  `;
}

function buildMetric(value, label) {
  return `
    <article class="metric-card">
      <strong>${escapeHtml(value)}</strong>
      <span>${escapeHtml(label)}</span>
    </article>
  `;
}

function buildFollowups(items) {
  if (!items.length) return '<div class="empty-inline">暂无 open follow-up。</div>';

  return `
    <div class="compact-list">
      ${items.map(item => `
        <div class="compact-row ${item.overdue ? 'is-overdue' : ''}">
          <div>
            <strong>${escapeHtml(item.text)}</strong>
            <span>${escapeHtml(item.project || item.sourceDate)}</span>
          </div>
          <em>${item.overdue ? 'overdue' : `${item.ageDays || 0}d`}</em>
        </div>
      `).join('')}
    </div>
  `;
}

function buildPillList(items, emptyText) {
  if (!items.length) return `<div class="empty-inline">${escapeHtml(emptyText)}</div>`;

  return `
    <div class="pill-list">
      ${items.map(item => `<span class="tag">${escapeHtml(item)}</span>`).join('')}
    </div>
  `;
}

function buildRecordTimeline(records) {
  if (!records.length) return '<div class="empty-inline">暂无记录。</div>';

  return `
    <div class="record-timeline">
      ${records.map(record => `
        <article class="record-line">
          <time>${escapeHtml(record.date)}</time>
          <div>
            <div class="record-line-meta">${escapeHtml(record.type)}${record.projects?.length ? ` · ${escapeHtml(record.projects[0])}` : ''}</div>
            <p>${escapeHtml(record.text)}</p>
            ${record.nextActions?.length ? `<div class="record-line-action">下一步：${escapeHtml(record.nextActions[0])}</div>` : ''}
          </div>
        </article>
      `).join('')}
    </div>
  `;
}

function buildSeeds(seeds) {
  if (!seeds.length) return '<div class="empty-inline">暂无内容素材。</div>';

  return `
    <div class="seed-grid">
      ${seeds.map(seed => `
        <article class="seed-card">
          <div class="seed-meta">${escapeHtml(seed.sourceDate)} · ${escapeHtml(seed.status)}</div>
          <h3>${escapeHtml(seed.title)}</h3>
          ${seed.angle ? `<p>${escapeHtml(seed.angle)}</p>` : ''}
        </article>
      `).join('')}
    </div>
  `;
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value == null ? '' : String(value);
  return div.innerHTML;
}
