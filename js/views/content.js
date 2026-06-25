/* ========================================
   Content View
   ======================================== */

import { loadContentSeeds } from '../data.js?v=20260625b';

const STATUSES = ['all', 'idea', 'outline', 'drafting', 'published', 'dropped'];

export async function renderContentView(container) {
  container.innerHTML = `
    <div class="page">
      <div class="skeleton" style="height: 220px;"></div>
    </div>
  `;

  const data = await loadContentSeeds();
  const seeds = data?.seeds || [];

  const page = document.createElement('div');
  page.className = 'page operations-page';
  page.innerHTML = `
    <div class="view-header animate-fade-in-up">
      <h1 class="view-title">Content</h1>
      <p class="view-subtitle">从真实经历里沉淀公众号选题和文章素材</p>
    </div>

    <section class="metric-grid">
      ${buildMetric(seeds.length, '素材')}
      ${buildMetric(data?.stats?.idea || 0, 'idea')}
      ${buildMetric(data?.stats?.drafting || 0, 'drafting')}
      ${buildMetric(data?.stats?.published || 0, 'published')}
    </section>

    <section class="ops-panel">
      <div class="filter-tabs" id="content-filter-tabs">
        ${STATUSES.map((status, index) => `
          <button class="filter-tab ${index === 0 ? 'active' : ''}" type="button" data-status="${escapeHtml(status)}">${escapeHtml(status)}</button>
        `).join('')}
      </div>
      <div id="content-seed-list">
        ${buildSeeds(seeds)}
      </div>
    </section>
  `;

  container.innerHTML = '';
  container.appendChild(page);
  bindFilters(page, seeds);
}

function bindFilters(page, seeds) {
  const tabs = page.querySelectorAll('.filter-tab');
  const list = page.querySelector('#content-seed-list');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const status = tab.dataset.status;
      tabs.forEach(item => item.classList.toggle('active', item === tab));
      const filtered = status === 'all' ? seeds : seeds.filter(seed => seed.status === status);
      list.innerHTML = buildSeeds(filtered);
    });
  });
}

function buildMetric(value, label) {
  return `
    <article class="metric-card">
      <strong>${escapeHtml(value)}</strong>
      <span>${escapeHtml(label)}</span>
    </article>
  `;
}

function buildSeeds(seeds) {
  if (!seeds.length) return '<div class="empty-inline">暂无匹配素材。</div>';

  return `
    <div class="seed-grid">
      ${seeds.map(seed => `
        <article class="seed-card">
          <div class="seed-meta">${escapeHtml(seed.sourceDomainLabel)} · ${escapeHtml(seed.sourceDate)} · ${escapeHtml(seed.status)}</div>
          <h3>${escapeHtml(seed.title)}</h3>
          ${seed.angle ? `<p>${escapeHtml(seed.angle)}</p>` : ''}
          ${seed.nextAction ? `<div class="record-line-action">下一步：${escapeHtml(seed.nextAction)}</div>` : ''}
          ${seed.tags?.length ? `
            <div class="pill-list">
              ${seed.tags.slice(0, 4).map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}
            </div>
          ` : ''}
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
