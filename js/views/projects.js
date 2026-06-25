/* ========================================
   Projects View
   ======================================== */

import { loadProjectSummary, loadProjectsManifest } from '../data.js?v=20260625b';

export async function renderProjectsView(container, params = {}) {
  if (params.date) {
    await renderProjectDetail(container, params.date);
    return;
  }

  container.innerHTML = `
    <div class="page">
      <div class="aggregation-grid">
        ${Array(4).fill('<div class="skeleton" style="height: 160px;"></div>').join('')}
      </div>
    </div>
  `;

  const manifest = await loadProjectsManifest();
  const projects = manifest?.projects || [];

  const page = document.createElement('div');
  page.className = 'page operations-page';
  page.innerHTML = `
    <div class="view-header animate-fade-in-up">
      <h1 class="view-title">Projects</h1>
      <p class="view-subtitle">按项目线查看长期推进过程</p>
    </div>
    <div class="project-grid">
      ${projects.map(project => buildProjectCard(project)).join('')}
    </div>
  `;

  container.innerHTML = '';
  container.appendChild(page);
}

async function renderProjectDetail(container, slug) {
  container.innerHTML = `
    <div class="page">
      <div class="skeleton" style="height: 220px;"></div>
    </div>
  `;

  const project = await loadProjectSummary(slug);
  if (!project) {
    container.innerHTML = `
      <div class="page">
        <div class="empty-state">
          <div class="empty-state-icon">□</div>
          <p class="empty-state-text">这个项目暂时没有数据。</p>
        </div>
      </div>
    `;
    return;
  }

  const page = document.createElement('div');
  page.className = 'page operations-page';
  page.innerHTML = `
    <section class="ops-hero animate-fade-in-up">
      <div>
        <div class="ops-kicker">${escapeHtml(project.firstSeen)} ~ ${escapeHtml(project.lastUpdated)}</div>
        <h1 class="ops-title">${escapeHtml(project.name)}</h1>
        <p class="ops-hero-focus">${escapeHtml(project.summary || '')}</p>
      </div>
      <div class="ops-next-step">
        <span>状态</span>
        <strong>${escapeHtml(project.status)}</strong>
      </div>
    </section>

    <section class="metric-grid">
      ${buildMetric(project.timeline?.length || 0, '记录')}
      ${buildMetric(project.openFollowUps?.length || 0, 'open')}
      ${buildMetric(project.decisions?.length || 0, '决策')}
      ${buildMetric(project.blockers?.length || 0, '卡点')}
    </section>

    <section class="ops-two-column">
      <div class="ops-panel">
        <div class="section-heading">
          <h2 class="section-title">未闭环事项</h2>
        </div>
        ${buildFollowups(project.openFollowUps || [])}
      </div>
      <div class="ops-panel">
        <div class="section-heading">
          <h2 class="section-title">关键决策</h2>
        </div>
        ${buildList(project.decisions || [], '暂无决策记录')}
      </div>
    </section>

    <section class="ops-panel">
      <div class="section-heading">
        <h2 class="section-title">项目时间线</h2>
        <a href="#projects" class="text-link">Back</a>
      </div>
      ${buildTimeline(project.timeline || [])}
    </section>
  `;

  container.innerHTML = '';
  container.appendChild(page);
}

function buildProjectCard(project) {
  return `
    <a class="project-card" href="#projects/${escapeHtml(project.slug)}">
      <div class="domain-card-topline">
        <span>${escapeHtml(project.status)}</span>
        <span>${escapeHtml(project.lastUpdated)}</span>
      </div>
      <h3>${escapeHtml(project.name)}</h3>
      <p>${escapeHtml(project.summary || '')}</p>
      <div class="metric-row">
        <span>${project.recordCount || 0} 记录</span>
        <span>${project.openFollowUps || 0} open</span>
      </div>
    </a>
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
            <span>${escapeHtml(item.domainLabel)} · ${escapeHtml(item.sourceDate)}</span>
          </div>
          <em>${item.overdue ? 'overdue' : `${item.ageDays || 0}d`}</em>
        </div>
      `).join('')}
    </div>
  `;
}

function buildList(items, emptyText) {
  if (!items.length) return `<div class="empty-inline">${escapeHtml(emptyText)}</div>`;

  return `
    <ul class="plain-list">
      ${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}
    </ul>
  `;
}

function buildTimeline(items) {
  if (!items.length) return '<div class="empty-inline">暂无时间线。</div>';

  return `
    <div class="record-timeline">
      ${items.map(item => `
        <article class="record-line">
          <time>${escapeHtml(item.date)}</time>
          <div>
            <div class="record-line-meta">${escapeHtml(item.domainLabel)} · ${escapeHtml(item.type)}</div>
            <p>${escapeHtml(item.text)}</p>
            ${item.nextActions?.length ? `<div class="record-line-action">下一步：${escapeHtml(item.nextActions[0])}</div>` : ''}
          </div>
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
