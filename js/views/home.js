/* ========================================
   Home View
   ======================================== */

import {
  loadContentSeeds,
  loadDomainOverview,
  loadOpenFollowups,
  loadProjectsManifest
} from '../data.js?v=20260711a';
import {
  getContentItems,
  getDashboard,
  getDomainSettings,
  getFollowups,
  getProjects,
  getRecords,
  updateDailyFocus
} from '../api.js?v=20260711a';
import { getAuthState, isApiEnabled } from '../auth.js?v=20260711a';
import { buildDomainSummaries, DOMAIN_META } from '../aggregations.js?v=20260711a';
import {
  bindEditableFollowupList,
  buildEditableFollowupRow,
  buildFollowupTimeMeta
} from '../components/followup-list.js?v=20260711a';
import { buildOnlineRecordList } from '../components/online-records.js?v=20260711a';
import { buildPetCompanionPanel } from '../components/pet.js?v=20260711a';
import { bindRecordDestinationActions } from '../components/record-destinations.js?v=20260711a';

const HOME_RECORDS_PAGE_SIZE = 10;
const HOME_FOLLOWUP_PAGE_SIZE = 10;

export async function renderHomeView(container) {
  container.innerHTML = `
    <div class="page">
      <div class="dashboard-grid">
        ${Array(4).fill('<div class="skeleton" style="height: 160px;"></div>').join('')}
      </div>
    </div>
  `;

  const authState = getAuthState();
  const useOwnerApi = isApiEnabled() && authState.user?.role === 'owner';
  const [overview, followups, content, projects, dashboard, onlineRecordsData, onlineProjectsData, onlineContentData, onlineFollowupsData, domainSettingsList] = await Promise.all([
    useOwnerApi ? Promise.resolve(null) : loadDomainOverview(),
    useOwnerApi ? Promise.resolve(null) : loadOpenFollowups(),
    useOwnerApi ? Promise.resolve(null) : loadContentSeeds(),
    useOwnerApi ? Promise.resolve(null) : loadProjectsManifest(),
    isApiEnabled() ? getDashboard().catch(() => null) : Promise.resolve(null),
    isApiEnabled() && authState.user ? getRecords({ limit: useOwnerApi ? 500 : 8 }).catch(() => null) : Promise.resolve(null),
    isApiEnabled() && authState.user ? getProjects().catch(() => null) : Promise.resolve(null),
    isApiEnabled() && authState.user ? getContentItems({ limit: useOwnerApi ? 100 : 5 }).catch(() => null) : Promise.resolve(null),
    useOwnerApi ? getFollowups({ status: 'all', limit: 200 }).catch(() => null) : Promise.resolve(null),
    useOwnerApi
      ? Promise.all(DOMAIN_META.map(domain => getDomainSettings(domain.id).catch(() => null)))
      : Promise.resolve([])
  ]);

  const onlineRecords = onlineRecordsData?.records || [];
  const onlineContentItems = onlineContentData?.items || [];
  const onlineFollowups = onlineFollowupsData?.followups || [];
  const domainSettings = Object.fromEntries(DOMAIN_META.map((domain, index) => [
    domain.id,
    domainSettingsList?.[index]?.settings || {}
  ]));
  const domains = useOwnerApi
    ? buildDomainSummaries({
      records: onlineRecords,
      followups: onlineFollowups,
      contentItems: onlineContentItems,
      settingsByDomain: domainSettings
    })
    : overview?.domains || [];
  const openFollowups = followups?.followups || [];
  const seeds = useOwnerApi
    ? mergeContentSeeds(onlineContentItems, [])
    : mergeContentSeeds(onlineContentItems, content?.seeds || []);
  const activeProjects = useOwnerApi
    ? onlineProjectsData?.projects || []
    : mergeProjects(onlineProjectsData?.projects || [], projects?.projects || []);
  const displayFollowups = useOwnerApi
    ? onlineFollowups.filter(item => item.status === 'open' || item.status === 'deferred')
    : dashboard?.followups || [];
  const heroFocus = dashboard?.todayFocus
    || overview?.todayFocus
    || '今天还没有记录最重要的事';
  const heroNextStep = dashboard?.nextSmallStep
    || overview?.tomorrowFirstStep
    || '先写下一个 25 分钟动作';
  const onlineRecordOptions = {
    title: authState.user?.role === 'owner' ? '最近在线记录' : '公开在线记录',
    emptyText: '还没有线上记录。写下第一句后，刷新页面也会在这里看到。'
  };

  const page = document.createElement('div');
  page.className = 'page operations-page';
  page.innerHTML = `
    <section class="ops-hero animate-fade-in-up">
      <div>
        <div class="ops-kicker">个人经营系统 · ${escapeHtml(dashboard?.today || overview?.latestDate || '')}</div>
        <h1 class="ops-title ops-title-long">帮你持续记录、接住情绪、推进事情、定期复盘</h1>
        <p class="ops-hero-focus" id="home-hero-focus">${escapeHtml(heroFocus)}</p>
        ${useOwnerApi ? buildDailyFocusEditor(dashboard?.dailyFocus, heroFocus) : ''}
      </div>
      <div class="ops-next-step">
        <span>现在下一步</span>
        <strong id="home-hero-next-step">${escapeHtml(heroNextStep)}</strong>
      </div>
    </section>

    ${buildRecordGuidePanel(dashboard, authState)}

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
        ${buildFollowupPanel(authState, displayFollowups, openFollowups.slice(0, 6), dashboard?.actionGroups)}
      </div>
      <div class="ops-panel">
        <div class="section-heading">
          <h2 class="section-title">项目主线</h2>
          <a href="#projects" class="text-link">Projects</a>
        </div>
        ${buildProjectList(activeProjects.slice(0, 5))}
      </div>
    </section>

    ${authState.apiAvailable && authState.user ? buildHomeOnlineRecordsSection(onlineRecords, onlineRecordOptions) : ''}

    <section class="ops-panel">
      <div class="section-heading">
        <h2 class="section-title">内容素材</h2>
        <a href="#content" class="text-link">Content</a>
      </div>
      ${buildSeedList(seeds.slice(0, 5))}
    </section>

    ${buildPetCompanionPanel(dashboard, authState)}
  `;

  container.innerHTML = '';
  container.appendChild(page);
  bindRecordDestinationActions(page);
  bindDailyFocusEditor(page, dashboard?.today);
  bindHomeRecordPagination(page, onlineRecords, onlineRecordOptions);
  bindFollowupPanel(page, displayFollowups);
}

function buildDailyFocusEditor(focus, fallbackText) {
  const status = focus?.status || 'active';
  return `
    <form class="daily-focus-editor" id="home-daily-focus-form">
      <input name="text" value="${escapeAttr(focus?.text || '')}" placeholder="今天最重要的一件事" maxlength="1000" required>
      <button type="submit">${focus ? '更新重点' : '设为今日重点'}</button>
      ${focus && status !== 'completed' ? '<button type="button" data-daily-focus-complete>完成</button>' : ''}
      ${status === 'completed' ? '<span class="daily-focus-completed">今日重点已完成</span>' : ''}
      <span class="form-status" data-daily-focus-status>${focus ? '' : `当前建议：${escapeHtml(fallbackText)}`}</span>
    </form>
  `;
}

function bindDailyFocusEditor(page, date = 'today') {
  const form = page.querySelector('#home-daily-focus-form');
  if (!form) return;
  const status = form.querySelector('[data-daily-focus-status]');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    await saveDailyFocus(form, status, date, 'active');
  });
  form.querySelector('[data-daily-focus-complete]')?.addEventListener('click', async () => {
    await saveDailyFocus(form, status, date, 'completed');
  });
}

async function saveDailyFocus(form, status, date, nextStatus) {
  const text = form.elements.text.value.trim();
  if (!text) return;
  const buttons = form.querySelectorAll('button');
  buttons.forEach(button => { button.disabled = true; });
  status.textContent = '保存中...';
  try {
    const data = await updateDailyFocus(date || 'today', { text, status: nextStatus });
    document.querySelector('#home-hero-focus').textContent = data.focus.text;
    status.textContent = nextStatus === 'completed' ? '今日重点已完成' : '今日重点已保存';
    if (nextStatus === 'completed') form.querySelector('[data-daily-focus-complete]')?.remove();
  } catch (error) {
    status.textContent = error.message || '保存失败';
  } finally {
    buttons.forEach(button => { button.disabled = false; });
  }
}

function buildHomeOnlineRecordsSection(records, options = {}, pageNumber = 1) {
  return `
    <section class="ops-panel online-records-section" data-home-online-records data-current-page="${pageNumber}">
      ${buildHomeOnlineRecordsInner(records, options, pageNumber)}
    </section>
  `;
}

function buildHomeOnlineRecordsInner(records = [], options = {}, pageNumber = 1) {
  const total = records.length;
  const totalPages = Math.max(1, Math.ceil(total / HOME_RECORDS_PAGE_SIZE));
  const currentPage = Math.min(Math.max(Number(pageNumber) || 1, 1), totalPages);
  const start = (currentPage - 1) * HOME_RECORDS_PAGE_SIZE;
  const pageRecords = records.slice(start, start + HOME_RECORDS_PAGE_SIZE);
  const title = options.title || '最近在线记录';
  const emptyText = options.emptyText || '还没有线上记录。';

  return `
    <div class="section-heading">
      <h2 class="section-title">${escapeHtml(title)}</h2>
      ${total ? `<span class="panel-date">共 ${total} 条 · 第 ${currentPage}/${totalPages} 页</span>` : ''}
    </div>
    <div data-home-record-page>
      ${buildOnlineRecordList(pageRecords, emptyText)}
    </div>
    ${total > HOME_RECORDS_PAGE_SIZE ? buildHomeRecordPagination(currentPage, totalPages) : ''}
  `;
}

function buildHomeRecordPagination(currentPage, totalPages) {
  return `
    <div class="record-pagination" aria-label="最近在线记录分页">
      <button type="button" data-home-record-page-action="prev" ${currentPage <= 1 ? 'disabled' : ''}>上一页</button>
      <span>${currentPage} / ${totalPages}</span>
      <button type="button" data-home-record-page-action="next" ${currentPage >= totalPages ? 'disabled' : ''}>下一页</button>
    </div>
  `;
}

function bindHomeRecordPagination(page, records, options) {
  const section = page.querySelector('[data-home-online-records]');
  if (!section) return;

  section.addEventListener('click', (event) => {
    const button = event.target.closest('[data-home-record-page-action]');
    if (!button) return;

    const currentPage = Number(section.dataset.currentPage || 1);
    const totalPages = Math.max(1, Math.ceil(records.length / HOME_RECORDS_PAGE_SIZE));
    const nextPage = button.dataset.homeRecordPageAction === 'next'
      ? Math.min(totalPages, currentPage + 1)
      : Math.max(1, currentPage - 1);
    if (nextPage === currentPage) return;

    section.dataset.currentPage = String(nextPage);
    section.innerHTML = buildHomeOnlineRecordsInner(records, options, nextPage);
  });
}

function buildRecordGuidePanel(dashboard, authState) {
  if (!authState.apiAvailable) {
    return `
      <section class="access-note">
        <strong>静态预览</strong>
        <p>当前环境没有连接 Workers API，页面继续展示本地 JSON 数据。</p>
      </section>
    `;
  }

  if (!authState.user) {
    return `
      <section class="record-capture-panel">
        <div>
          <div class="ops-kicker">记录入口</div>
          <h2>登录后去 Records 记录</h2>
          <p>所有输入统一进入 Records，写下真实状态后再由系统做分类、建议和沉淀。</p>
        </div>
        <a class="primary-action" href="/api/auth/google/start">Google 登录</a>
      </section>
    `;
  }

  if (authState.user.role !== 'owner') {
    return `
      <section class="access-note">
        <strong>只读账号</strong>
        <p>当前 Google 账号不是作者账号，只能浏览公开内容，不能写入 Records。</p>
      </section>
    `;
  }

  const state = dashboard?.userState || {};
  return `
    <section class="record-capture-panel record-guide-panel">
      <div class="record-capture-intro">
        <div class="ops-kicker">今天的记录入口</div>
        <h2>${dashboard?.hasRecordedToday ? '今天已经留下记录' : '去 Records 记一笔'}</h2>
        <p>${escapeHtml(dashboard?.nextSmallStep || '先写下一句真实状态，不需要一次整理完整。')}</p>
        <div class="record-feedback-stats">
          <span>连续 ${state.currentStreakDays || 0} 天</span>
          <span>本周 ${state.thisWeekRecordDays || 0} 天</span>
          <span>累计 ${state.totalRecords || 0} 条</span>
        </div>
      </div>
      <div class="record-guide-actions">
        <a class="primary-action" href="#records">去 Records 记一笔</a>
        <div class="record-guide-shortcuts" aria-label="记录快捷类型">
          <a href="#records/task">任务</a>
          <a href="#records/emotion">情绪</a>
          <a href="#records/health">健康</a>
          <a href="#records/review">复盘</a>
        </div>
      </div>
    </section>
  `;
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
            <span>${escapeHtml(buildFollowupContextMeta(item))}</span>
            <span class="followup-time-meta">${escapeHtml(buildFollowupTimeMeta(item))}</span>
          </div>
          <em>${item.overdue ? '超时' : `${item.ageDays || 0}d`}</em>
        </div>
      `).join('')}
    </div>
  `;
}

function buildFollowupPanel(authState, onlineFollowups, staticFollowups, actionGroups = null) {
  if (authState.apiAvailable && authState.user?.role === 'owner') {
    return `
      <div class="followup-home-guide">
        <p>新增任务统一去 Records 选择“任务”，系统会自动进入未闭环事项。</p>
        <a class="primary-action" href="#records/task">新增任务</a>
      </div>
      <div class="form-status" id="home-followup-status"></div>
      <div class="compact-list manageable-list" id="home-followup-list">
        ${actionGroups ? buildActionWorkbench(actionGroups) : buildHomeFollowupListPage(onlineFollowups)}
      </div>
    `;
  }

  return buildFollowupList(staticFollowups);
}

function buildActionWorkbench(groups = {}) {
  const sections = [
    ['已逾期', groups.overdue || [], 'danger'],
    ['今天到期', groups.dueToday || [], 'today'],
    ['后续事项', groups.upcoming || [], 'upcoming']
  ];
  if (!sections.some(([, items]) => items.length)) {
    return '<div class="empty-inline">暂无待处理行动。</div>';
  }
  return sections.filter(([, items]) => items.length).map(([title, items, tone]) => `
    <section class="home-action-group is-${tone}">
      <div class="home-action-heading"><strong>${title}</strong><span>${items.length} 项</span></div>
      ${items.slice(0, 8).map(buildEditableFollowupRow).join('')}
      ${items.length > 8 ? `<div class="panel-date">另有 ${items.length - 8} 项，请到 Daily 查看</div>` : ''}
    </section>
  `).join('');
}

function buildFollowupContextMeta(item) {
  return [
    item.domainLabel || getDomainLabel(item.domain),
    item.project
  ].filter(Boolean).join(' · ') || '未分类';
}

function buildHomeFollowupListPage(followups = [], pageNumber = 1) {
  const total = followups.length;
  const totalPages = Math.max(1, Math.ceil(total / HOME_FOLLOWUP_PAGE_SIZE));
  const currentPage = Math.min(Math.max(Number(pageNumber) || 1, 1), totalPages);
  const start = (currentPage - 1) * HOME_FOLLOWUP_PAGE_SIZE;
  const pageFollowups = followups.slice(start, start + HOME_FOLLOWUP_PAGE_SIZE);

  return `
    ${total ? `<div class="panel-date home-followup-count">共 ${total} 项 · 第 ${currentPage}/${totalPages} 页</div>` : ''}
    ${pageFollowups.length ? pageFollowups.map(buildEditableFollowupRow).join('') : '<div class="empty-inline">暂无在线待办。去 Records 新增一个任务，就能在这里闭环。</div>'}
    ${total > HOME_FOLLOWUP_PAGE_SIZE ? buildHomeFollowupPagination(currentPage, totalPages) : ''}
  `;
}

function buildHomeFollowupPagination(currentPage, totalPages) {
  return `
    <div class="record-pagination" aria-label="首页待办分页">
      <button type="button" data-home-followup-page="${currentPage - 1}" ${currentPage <= 1 ? 'disabled' : ''}>上一页</button>
      <span>${currentPage} / ${totalPages}</span>
      <button type="button" data-home-followup-page="${currentPage + 1}" ${currentPage >= totalPages ? 'disabled' : ''}>下一页</button>
    </div>
  `;
}

function bindFollowupPanel(page, followups = []) {
  const list = page.querySelector('#home-followup-list');
  const status = page.querySelector('#home-followup-status');
  bindEditableFollowupList(list, {
    statusEl: status,
    emptyText: '暂无在线待办。新增一个，就能在这里闭环。'
  });

  list?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-home-followup-page]');
    if (!button) return;
    list.innerHTML = buildHomeFollowupListPage(followups, Number(button.dataset.homeFollowupPage || 1));
  });
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
            ${project.actionState === 'missing_next_action' ? '<span class="project-action-warning">缺少明确下一步</span>' : ''}
            ${project.actionState === 'stalled' ? '<span class="project-action-warning">超过 14 天没有推进</span>' : ''}
          </div>
          <em>${project.openFollowUps || 0} open</em>
        </a>
      `).join('')}
    </div>
  `;
}

function mergeProjects(onlineProjects, staticProjects) {
  const seen = new Set();
  const result = [];

  onlineProjects.forEach(project => {
    if (!isVisibleProject(project)) return;
    seen.add(project.slug);
    result.push({
      ...project,
      openFollowUps: 0
    });
  });

  staticProjects.forEach(project => {
    if (!isVisibleProject(project)) return;
    if (!seen.has(project.slug)) result.push(project);
  });

  return result;
}

function isVisibleProject(project) {
  return ['active', 'paused'].includes(project?.status);
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

function mergeContentSeeds(onlineItems, staticSeeds) {
  return [
    ...onlineItems.map(item => ({
      ...item,
      sourceDomainLabel: getDomainLabel(item.sourceDomain),
      sourceDate: item.createdAt ? item.createdAt.slice(0, 10) : ''
    })),
    ...staticSeeds
  ];
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

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value == null ? '' : String(value);
  return div.innerHTML;
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function formatShortTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}
