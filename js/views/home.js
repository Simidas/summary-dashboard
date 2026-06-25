/* ========================================
   Home View
   ======================================== */

import {
  loadContentSeeds,
  loadDomainOverview,
  loadOpenFollowups,
  loadProjectsManifest
} from '../data.js?v=20260625a';

export async function renderHomeView(container) {
  container.innerHTML = `
    <div class="page">
      <div class="dashboard-grid">
        ${Array(4).fill('<div class="skeleton" style="height: 160px;"></div>').join('')}
      </div>
    </div>
  `;

  const [overview, followups, content, projects] = await Promise.all([
    loadDomainOverview(),
    loadOpenFollowups(),
    loadContentSeeds(),
    loadProjectsManifest()
  ]);

  const domains = overview?.domains || [];
  const openFollowups = followups?.followups || [];
  const seeds = content?.seeds || [];
  const activeProjects = projects?.projects || [];

  const page = document.createElement('div');
  page.className = 'page operations-page';
  page.innerHTML = `
    <section class="ops-hero animate-fade-in-up">
      <div>
        <div class="ops-kicker">${escapeHtml(overview?.latestDate || '')}</div>
        <h1 class="ops-title">个人经营面板</h1>
        <p class="ops-hero-focus">${escapeHtml(overview?.todayFocus || '今天还没有记录最重要的事')}</p>
      </div>
      <div class="ops-next-step">
        <span>明天第一步</span>
        <strong>${escapeHtml(overview?.tomorrowFirstStep || '先写下一个 25 分钟动作')}</strong>
      </div>
    </section>

    <section class="section">
      <div class="section-heading">
        <h2 class="section-title">四个场景</h2>
      </div>
      <div class="domain-grid">
        ${domains.map(domain => buildDomainCard(domain)).join('')}
      </div>
    </section>

    <section class="ops-two-column">
      <div class="ops-panel">
        <div class="section-heading">
          <h2 class="section-title">未闭环事项</h2>
          <a href="#daily" class="text-link">Daily</a>
        </div>
        ${buildFollowupList(openFollowups.slice(0, 6))}
      </div>
      <div class="ops-panel">
        <div class="section-heading">
          <h2 class="section-title">项目主线</h2>
          <a href="#projects" class="text-link">Projects</a>
        </div>
        ${buildProjectList(activeProjects.slice(0, 5))}
      </div>
    </section>

    <section class="ops-panel">
      <div class="section-heading">
        <h2 class="section-title">内容素材</h2>
        <a href="#content" class="text-link">Content</a>
      </div>
      ${buildSeedList(seeds.slice(0, 5))}
    </section>
  `;

  container.innerHTML = '';
  container.appendChild(page);
}

function buildDomainCard(domain) {
  const openCount = domain.openFollowUps?.length || 0;
  const overdueCount = domain.overdueFollowUps?.length || 0;

  return `
    <a class="domain-card" href="#domain/${escapeHtml(domain.id)}">
      <div class="domain-card-topline">
        <span>${escapeHtml(domain.label)}</span>
        <span>${domain.recordCount || 0} 条</span>
      </div>
      <h3>${escapeHtml(domain.currentFocus || domain.description)}</h3>
      <p>${escapeHtml(domain.nextAction || '暂无下一步')}</p>
      <div class="metric-row">
        <span>${domain.progressCount || 0} 进展</span>
        <span>${openCount} open</span>
        ${overdueCount ? `<span class="danger-text">${overdueCount} overdue</span>` : ''}
      </div>
    </a>
  `;
}

function buildFollowupList(followups) {
  if (!followups.length) {
    return '<div class="empty-inline">暂无 open follow-up。</div>';
  }

  return `
    <div class="compact-list">
      ${followups.map(item => `
        <div class="compact-row ${item.overdue ? 'is-overdue' : ''}">
          <div>
            <strong>${escapeHtml(item.text)}</strong>
            <span>${escapeHtml(item.domainLabel)}${item.project ? ` · ${escapeHtml(item.project)}` : ''}</span>
          </div>
          <em>${item.ageDays || 0}d</em>
        </div>
      `).join('')}
    </div>
  `;
}

function buildProjectList(projects) {
  if (!projects.length) {
    return '<div class="empty-inline">暂无项目记录。</div>';
  }

  return `
    <div class="compact-list">
      ${projects.map(project => `
        <a class="compact-row" href="#projects/${escapeHtml(project.slug)}">
          <div>
            <strong>${escapeHtml(project.name)}</strong>
            <span>${escapeHtml(project.summary || '')}</span>
          </div>
          <em>${project.openFollowUps || 0} open</em>
        </a>
      `).join('')}
    </div>
  `;
}

function buildSeedList(seeds) {
  if (!seeds.length) {
    return '<div class="empty-inline">暂无内容素材。</div>';
  }

  return `
    <div class="seed-grid">
      ${seeds.map(seed => `
        <article class="seed-card">
          <div class="seed-meta">${escapeHtml(seed.sourceDomainLabel)} · ${escapeHtml(seed.status)}</div>
          <h3>${escapeHtml(seed.title)}</h3>
          ${seed.nextAction ? `<p>${escapeHtml(seed.nextAction)}</p>` : ''}
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
