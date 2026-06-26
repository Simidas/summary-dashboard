/* ========================================
   Home View
   ======================================== */

import {
  loadContentSeeds,
  loadDomainOverview,
  loadOpenFollowups,
  loadProjectsManifest
} from '../data.js?v=20260626c';
import {
  createFollowup,
  createRecord,
  getContentItems,
  getDashboard,
  getProjects,
  getRecords,
  updateDashboardSettings,
  updateFollowup
} from '../api.js?v=20260626c';
import { getAuthState, isApiEnabled } from '../auth.js?v=20260626c';
import { buildOnlineRecordsSection } from '../components/online-records.js?v=20260626c';

export async function renderHomeView(container) {
  container.innerHTML = `
    <div class="page">
      <div class="dashboard-grid">
        ${Array(4).fill('<div class="skeleton" style="height: 160px;"></div>').join('')}
      </div>
    </div>
  `;

  const authState = getAuthState();
  const [overview, followups, content, projects, dashboard, onlineRecordsData, onlineProjectsData, onlineContentData] = await Promise.all([
    loadDomainOverview(),
    loadOpenFollowups(),
    loadContentSeeds(),
    loadProjectsManifest(),
    isApiEnabled() ? getDashboard().catch(() => null) : Promise.resolve(null),
    isApiEnabled() && authState.user ? getRecords({ limit: 8 }).catch(() => null) : Promise.resolve(null),
    isApiEnabled() && authState.user ? getProjects().catch(() => null) : Promise.resolve(null),
    isApiEnabled() && authState.user ? getContentItems({ limit: 5 }).catch(() => null) : Promise.resolve(null)
  ]);

  const domains = overview?.domains || [];
  const openFollowups = followups?.followups || [];
  const seeds = mergeContentSeeds(onlineContentData?.items || [], content?.seeds || []);
  const activeProjects = mergeProjects(onlineProjectsData?.projects || [], projects?.projects || []);
  const onlineRecords = onlineRecordsData?.records || [];
  const heroFocus = dashboard?.settings?.todayFocus || overview?.todayFocus || '今天还没有记录最重要的事';
  const heroNextStep = dashboard?.settings?.tomorrowFirstStep
    || dashboard?.nextSmallStep
    || overview?.tomorrowFirstStep
    || '先写下一个 25 分钟动作';

  const page = document.createElement('div');
  page.className = 'page operations-page';
  page.innerHTML = `
    <section class="ops-hero animate-fade-in-up">
      <div>
        <div class="ops-kicker">${escapeHtml(dashboard?.today || overview?.latestDate || '')}</div>
        <h1 class="ops-title">个人经营面板</h1>
        <p class="ops-hero-focus" id="home-hero-focus">${escapeHtml(heroFocus)}</p>
      </div>
      <div class="ops-next-step">
        <span>明天第一步</span>
        <strong id="home-hero-next-step">${escapeHtml(heroNextStep)}</strong>
      </div>
    </section>

    ${buildDashboardSettingsPanel(dashboard, authState, heroFocus, heroNextStep)}

    ${buildOnlineRecordPanel(dashboard, authState)}

    ${authState.apiAvailable && authState.user ? buildOnlineRecordsSection(onlineRecords, {
      title: authState.user.role === 'owner' ? '最近在线记录' : '公开在线记录',
      emptyText: '还没有线上记录。写下第一句后，刷新页面也会在这里看到。'
    }) : ''}

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
        ${buildFollowupPanel(authState, dashboard?.followups || [], openFollowups.slice(0, 6))}
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
  bindOnlineRecordForm(page, dashboard);
  bindDashboardSettingsForm(page);
  bindFollowupPanel(page);
}

function buildDashboardSettingsPanel(dashboard, authState, heroFocus, heroNextStep) {
  if (!authState.apiAvailable || authState.user?.role !== 'owner') return '';

  return `
    <section class="settings-panel">
      <div class="section-heading">
        <h2 class="section-title">面板头部设置</h2>
      </div>
      <form id="dashboard-settings-form" class="dashboard-settings-form">
        <label>
          <span>今日重点</span>
          <input name="todayFocus" value="${escapeAttr(heroFocus)}" placeholder="今天最重要的一件事">
        </label>
        <label>
          <span>下一步</span>
          <input name="tomorrowFirstStep" value="${escapeAttr(heroNextStep)}" placeholder="一个小到能启动的动作">
        </label>
        <div class="record-form-footer">
          <span class="form-status" id="dashboard-settings-status">${dashboard?.settings?.updatedAt ? `上次更新 ${escapeHtml(formatShortTime(dashboard.settings.updatedAt))}` : ''}</span>
          <button class="primary-action" type="submit">保存头部</button>
        </div>
      </form>
    </section>
  `;
}

function bindDashboardSettingsForm(page) {
  const form = page.querySelector('#dashboard-settings-form');
  if (!form) return;

  const status = page.querySelector('#dashboard-settings-status');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    const todayFocus = form.elements.todayFocus.value.trim();
    const tomorrowFirstStep = form.elements.tomorrowFirstStep.value.trim();

    button.disabled = true;
    status.textContent = '保存中...';

    try {
      const data = await updateDashboardSettings({ todayFocus, tomorrowFirstStep });
      page.querySelector('#home-hero-focus').textContent = data.settings.todayFocus || '今天还没有记录最重要的事';
      page.querySelector('#home-hero-next-step').textContent = data.settings.tomorrowFirstStep || '先写下一个 25 分钟动作';
      status.textContent = '已保存';
    } catch (error) {
      status.textContent = error.message || '保存失败';
    } finally {
      button.disabled = false;
    }
  });
}

function buildOnlineRecordPanel(dashboard, authState) {
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
          <div class="ops-kicker">Online Recording</div>
          <h2>登录后开始记录</h2>
          <p>写下一句真实状态，系统会帮你收束成一个更小的下一步。</p>
        </div>
        <a class="primary-action" href="/api/auth/google/start">Google 登录</a>
      </section>
    `;
  }

  if (authState.user.role !== 'owner') {
    return `
      <section class="access-note">
        <strong>只读账号</strong>
        <p>当前 Google 账号不是作者账号，只能浏览公开内容。</p>
      </section>
    `;
  }

  return `
    <section class="record-capture-panel" data-online-record-panel>
      <div class="record-capture-intro">
        <div class="ops-kicker">今天的入口</div>
        <h2>${dashboard?.hasRecordedToday ? '今天已经留下记录' : '先写一句真实状态'}</h2>
        ${buildDashboardFeedback(dashboard)}
      </div>
      <form class="online-record-form" id="online-record-form">
        <textarea id="online-record-content" name="content" rows="5" placeholder="现在最想记录什么？"></textarea>
        <div class="record-form-grid">
          <label>
            <span>场景</span>
            <select name="domain" id="online-record-domain">
              <option value="life">生活和自我</option>
              <option value="work">主业</option>
              <option value="side_business">副业</option>
              <option value="content">内容产出</option>
            </select>
          </label>
          <label>
            <span>类型</span>
            <select name="type">
              <option value="thought">想法</option>
              <option value="reflection">反思</option>
              <option value="progress">进展</option>
              <option value="blocker">卡点</option>
              <option value="diary">日记</option>
              <option value="content_seed">内容素材</option>
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
        <div class="record-form-footer">
          <span class="form-status" id="online-record-status"></span>
          <button class="primary-action" type="submit">记录并生成建议</button>
        </div>
      </form>
      <div id="online-record-result"></div>
    </section>
  `;
}

function buildDashboardFeedback(dashboard) {
  if (!dashboard || dashboard.mode !== 'owner') {
    return '<p class="record-feedback-text">从一句话开始就够了，不需要一次整理完整。</p>';
  }

  const state = dashboard.userState || {};
  return `
    <div class="record-feedback">
      <div>
        <span>${dashboard.hasRecordedToday ? '今日已记录' : '今日未记录'}</span>
        <strong>${escapeHtml(dashboard.nextSmallStep || '先写下一个 25 分钟动作')}</strong>
      </div>
      <div class="record-feedback-stats">
        <span>连续 ${state.currentStreakDays || 0} 天</span>
        <span>本周 ${state.thisWeekRecordDays || 0} 天</span>
        <span>累计 ${state.totalRecords || 0} 条</span>
      </div>
    </div>
  `;
}

function bindOnlineRecordForm(page, dashboard) {
  const form = page.querySelector('#online-record-form');
  if (!form) return;

  const input = form.querySelector('#online-record-content');
  const domain = form.querySelector('#online-record-domain');
  const status = page.querySelector('#online-record-status');
  const result = page.querySelector('#online-record-result');
  const intro = page.querySelector('.record-capture-intro');
  const savedDomain = localStorage.getItem('summary-dashboard:last-domain');
  if (savedDomain) domain.value = savedDomain;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const content = input.value.trim();
    if (!content) {
      status.textContent = '先写一句就可以。';
      return;
    }

    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    status.textContent = '保存中...';
    result.innerHTML = '';

    try {
      const data = await createRecord({
        content,
        domain: form.elements.domain.value,
        type: form.elements.type.value,
        visibility: form.elements.visibility.value
      });
      localStorage.setItem('summary-dashboard:last-domain', form.elements.domain.value);
      input.value = '';
      status.textContent = '已保存';
      result.innerHTML = buildAiResult(data.aiSuggestion);
      prependOnlineRecord(page, data.record, data.aiSuggestion);
      if (intro) {
        intro.innerHTML = `
          <div class="ops-kicker">今天的入口</div>
          <h2>刚刚这条已经接住了</h2>
          ${buildDashboardFeedback({
            mode: 'owner',
            hasRecordedToday: true,
            nextSmallStep: data.aiSuggestion?.nextSmallStep,
            userState: data.userState || dashboard?.userState || {}
          })}
        `;
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

function prependOnlineRecord(page, record, aiSuggestion) {
  const list = page.querySelector('.online-record-list');
  const section = page.querySelector('.online-records-section');
  if (!section) return;

  const recordWithSuggestion = { ...record, aiSuggestion };
  const html = buildOnlineRecordsSection([recordWithSuggestion], { title: '最近在线记录' });
  const temp = document.createElement('div');
  temp.innerHTML = html;
  const freshCard = temp.querySelector('.online-record-card');

  if (list && freshCard) {
    list.prepend(freshCard);
    return;
  }

  section.outerHTML = buildOnlineRecordsSection([recordWithSuggestion], { title: '最近在线记录' });
}

function buildAiResult(aiSuggestion) {
  if (!aiSuggestion) {
    return '<div class="empty-inline">记录已保存，AI 建议稍后生成。</div>';
  }

  return `
    <article class="ai-result-card">
      <div class="domain-card-topline">
        <span>${aiSuggestion.status === 'completed' ? 'AI 建议' : 'AI 待重试'}</span>
        <span>${escapeHtml(aiSuggestion.model || '')}</span>
      </div>
      ${aiSuggestion.summary ? `<p><strong>我听到的是：</strong>${escapeHtml(aiSuggestion.summary)}</p>` : ''}
      ${aiSuggestion.validation ? `<p><strong>值得肯定的是：</strong>${escapeHtml(aiSuggestion.validation)}</p>` : ''}
      <div class="next-small-step">
        <span>现在只做这一步</span>
        <strong>${escapeHtml(aiSuggestion.nextSmallStep || '先把这条记录保存下来。')}</strong>
      </div>
      ${aiSuggestion.encouragement ? `<p>${escapeHtml(aiSuggestion.encouragement)}</p>` : ''}
    </article>
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
            <span>${escapeHtml(item.domainLabel)}${item.project ? ` · ${escapeHtml(item.project)}` : ''}</span>
          </div>
          <em>${item.ageDays || 0}d</em>
        </div>
      `).join('')}
    </div>
  `;
}

function buildFollowupPanel(authState, onlineFollowups, staticFollowups) {
  if (authState.apiAvailable && authState.user?.role === 'owner') {
    return `
      <form class="quick-inline-form" id="home-followup-form">
        <input name="text" placeholder="新增一个需要闭环的小事项">
        <select name="domain" aria-label="场景">
          <option value="">未分类</option>
          <option value="work">主业</option>
          <option value="side_business">副业</option>
          <option value="life">生活和自我</option>
          <option value="content">内容产出</option>
        </select>
        <input name="project" placeholder="项目，可选">
        <input name="dueDate" type="date" aria-label="截止日期">
        <button class="primary-action" type="submit">新增</button>
      </form>
      <div class="form-status" id="home-followup-status"></div>
      <div class="compact-list manageable-list" id="home-followup-list">
        ${onlineFollowups.length ? onlineFollowups.map(buildOnlineFollowupRow).join('') : '<div class="empty-inline">暂无在线待办。新增一个，就能在这里闭环。</div>'}
      </div>
    `;
  }

  return buildFollowupList(staticFollowups);
}

function buildOnlineFollowupRow(item) {
  const statusLabel = {
    open: 'open',
    deferred: 'deferred',
    closed: 'closed',
    dropped: 'dropped'
  }[item.status] || item.status || 'open';

  return `
    <div class="compact-row ${item.overdue ? 'is-overdue' : ''}" data-followup-id="${escapeAttr(item.id)}">
      <div>
        <strong>${escapeHtml(item.text)}</strong>
        <span>${escapeHtml(item.domainLabel || item.domain || '未分类')}${item.project ? ` · ${escapeHtml(item.project)}` : ''}${item.dueDate ? ` · ${escapeHtml(item.dueDate)}` : ''}</span>
      </div>
      <div class="row-actions">
        <em>${escapeHtml(statusLabel)}</em>
        ${item.status === 'open' ? '<button type="button" data-followup-action="deferred">延后</button>' : '<button type="button" data-followup-action="open">打开</button>'}
        <button type="button" data-followup-action="closed">完成</button>
        <button type="button" data-followup-action="dropped">放弃</button>
      </div>
    </div>
  `;
}

function bindFollowupPanel(page) {
  const form = page.querySelector('#home-followup-form');
  const list = page.querySelector('#home-followup-list');
  const status = page.querySelector('#home-followup-status');

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const text = form.elements.text.value.trim();
    if (!text) {
      status.textContent = '先写一个具体事项。';
      return;
    }

    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    status.textContent = '保存中...';

    try {
      const data = await createFollowup({
        text,
        domain: form.elements.domain.value,
        project: form.elements.project.value,
        dueDate: form.elements.dueDate.value
      });
      form.reset();
      status.textContent = '已新增';
      if (list) {
        const empty = list.querySelector('.empty-inline');
        if (empty) empty.remove();
        list.insertAdjacentHTML('afterbegin', buildOnlineFollowupRow(data.followup));
      }
    } catch (error) {
      status.textContent = error.message || '保存失败';
    } finally {
      button.disabled = false;
    }
  });

  list?.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-followup-action]');
    if (!button) return;

    const row = button.closest('[data-followup-id]');
    const id = row?.dataset.followupId;
    if (!id) return;

    const nextStatus = button.dataset.followupAction;
    button.disabled = true;
    if (status) status.textContent = '更新中...';

    try {
      const data = await updateFollowup(id, { status: nextStatus });
      if (nextStatus === 'closed' || nextStatus === 'dropped') {
        row.remove();
        if (list && !list.querySelector('[data-followup-id]')) {
          list.innerHTML = '<div class="empty-inline">暂无在线待办。新增一个，就能在这里闭环。</div>';
        }
      } else {
        row.outerHTML = buildOnlineFollowupRow(data.followup);
      }
      if (status) status.textContent = '已更新';
    } catch (error) {
      if (status) status.textContent = error.message || '更新失败';
      button.disabled = false;
    }
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
    seen.add(project.slug);
    result.push({
      ...project,
      openFollowUps: 0
    });
  });

  staticProjects.forEach(project => {
    if (!seen.has(project.slug)) result.push(project);
  });

  return result;
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
  return escapeHtml(value).replace(/"/g, '&quot;');
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
