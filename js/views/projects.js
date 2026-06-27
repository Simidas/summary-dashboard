/* ========================================
   Projects View
   ======================================== */

import { loadProjectSummary, loadProjectsManifest } from '../data.js?v=20260626n';
import {
  createFollowup,
  createProject,
  createRecord,
  deleteProject,
  getFollowups,
  getProject,
  getProjects,
  getRecords,
  updateFollowup,
  updateProject
} from '../api.js?v=20260626n';
import { getAuthState, isApiEnabled } from '../auth.js?v=20260626n';
import { buildOnlineRecordList } from '../components/online-records.js?v=20260626n';

export async function renderProjectsView(container, params = {}) {
  const authState = getAuthState();

  if (params.date) {
    await renderProjectDetail(container, params.date, authState);
    return;
  }

  container.innerHTML = `
    <div class="page">
      <div class="aggregation-grid">
        ${Array(4).fill('<div class="skeleton" style="height: 160px;"></div>').join('')}
      </div>
    </div>
  `;

  const [manifest, onlineProjectsData] = await Promise.all([
    isApiEnabled() && authState.user?.role === 'owner' ? Promise.resolve(null) : loadProjectsManifest(),
    isApiEnabled() && authState.user ? getProjects().catch(() => null) : Promise.resolve(null)
  ]);
  const staticProjects = manifest?.projects || [];
  const onlineProjects = onlineProjectsData?.projects || [];
  const projects = isApiEnabled() && authState.user?.role === 'owner'
    ? onlineProjects
    : mergeProjects(onlineProjects, staticProjects);

  const page = document.createElement('div');
  page.className = 'page operations-page';
  page.innerHTML = `
    <div class="view-header animate-fade-in-up">
      <h1 class="view-title">Projects</h1>
      <p class="view-subtitle">按项目线查看长期推进过程</p>
    </div>
    ${buildProjectCreatePanel(authState)}
    <div class="project-grid" id="project-grid">
      ${projects.map(project => buildProjectCard(project)).join('')}
    </div>
  `;

  container.innerHTML = '';
  container.appendChild(page);
  bindProjectCreateForm(page);
}

async function renderProjectDetail(container, slug, authState) {
  const normalizedSlug = normalizeRouteSlug(slug);
  container.innerHTML = `
    <div class="page">
      <div class="skeleton" style="height: 220px;"></div>
    </div>
  `;

  if (isApiEnabled() && authState.user?.role === 'owner') {
    const onlineProjectData = await getProject(normalizedSlug).catch(() => null);
    if (onlineProjectData?.project) {
      const onlineFollowupsData = await getFollowups({ project: onlineProjectData.project.name, status: 'all', limit: 30 }).catch(() => null);
      const onlineFollowups = (onlineFollowupsData?.followups || [])
        .filter(item => item.status === 'open' || item.status === 'deferred');
      renderManagedProjectDetail(container, onlineProjectData.project, onlineProjectData.records || [], onlineFollowups, authState);
      return;
    }

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

  const [manifest, onlineProjectsData] = await Promise.all([
    loadProjectsManifest().catch(() => null),
    isApiEnabled() && authState.user ? getProjects().catch(() => null) : Promise.resolve(null)
  ]);
  const staticProjectMeta = (manifest?.projects || []).find(project => project.slug === normalizedSlug);
  const onlineProjectMeta = (onlineProjectsData?.projects || [])
    .find(project => project.slug === normalizedSlug || project.id === normalizedSlug);

  const onlineProjectData = isApiEnabled() && authState.user && (onlineProjectMeta || !staticProjectMeta)
    ? await getProject(normalizedSlug).catch(() => null)
    : null;

  if (onlineProjectData?.project) {
    const onlineFollowupsData = isApiEnabled() && authState.user
      ? await getFollowups({ project: onlineProjectData.project.name, status: 'all', limit: 30 }).catch(() => null)
      : null;
    const onlineFollowups = (onlineFollowupsData?.followups || [])
      .filter(item => item.status === 'open' || item.status === 'deferred');
    renderManagedProjectDetail(container, onlineProjectData.project, onlineProjectData.records || [], onlineFollowups, authState);
    return;
  }

  const project = staticProjectMeta ? await loadProjectSummary(staticProjectMeta.slug) : null;
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

  const [onlineRecordsData, onlineFollowupsData] = await Promise.all([
    isApiEnabled() && authState.user ? getRecords({ project: project.name, limit: 30 }).catch(() => null) : Promise.resolve(null),
    isApiEnabled() && authState.user ? getFollowups({ project: project.name, status: 'all', limit: 30 }).catch(() => null) : Promise.resolve(null)
  ]);
  const onlineFollowups = (onlineFollowupsData?.followups || [])
    .filter(item => item.status === 'open' || item.status === 'deferred');

  renderStaticProjectDetail(container, project, onlineRecordsData?.records || [], onlineFollowups, authState);
}

function renderManagedProjectDetail(container, project, records, followups, authState) {
  const page = document.createElement('div');
  page.className = 'page operations-page';
  page.innerHTML = `
    <section class="ops-hero animate-fade-in-up">
      <div>
        <div class="ops-kicker">${escapeHtml(project.updatedAt || '')}</div>
        <h1 class="ops-title">${escapeHtml(project.name)}</h1>
        <p class="ops-hero-focus">${escapeHtml(project.summary || '暂无项目说明')}</p>
      </div>
      <div class="ops-next-step">
        <span>${escapeHtml(project.status)}</span>
        <strong>${escapeHtml(project.nextAction || '先写一条项目进展')}</strong>
      </div>
    </section>

    ${authState.user?.role === 'owner' ? buildProjectEditPanel(project) : ''}
    ${authState.user?.role === 'owner' ? buildProjectRecordPanel(project) : ''}
    ${authState.user?.role === 'owner' ? buildProjectFollowupPanel(project, followups) : ''}

    <section class="ops-panel">
      <div class="section-heading">
        <h2 class="section-title">项目记录</h2>
        <a href="#projects" class="text-link">Back</a>
      </div>
      <div id="project-record-list">
        ${buildOnlineRecordList(records, '还没有项目记录。')}
      </div>
    </section>
  `;

  container.innerHTML = '';
  container.appendChild(page);
  bindProjectEditForm(page, project);
  bindProjectRecordForm(page, project);
  bindProjectFollowupForm(page, project);
}

function renderStaticProjectDetail(container, project, onlineRecords = [], onlineFollowups = [], authState = {}) {
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

    ${authState.user?.role === 'owner' ? buildStaticProjectNotice() : ''}
    ${authState.user?.role === 'owner' ? buildProjectRecordPanel(project) : ''}
    ${authState.user?.role === 'owner' ? buildProjectFollowupPanel(project, onlineFollowups) : ''}

    <section class="metric-grid">
      ${buildMetric((project.timeline?.length || 0) + onlineRecords.length, '记录')}
      ${buildMetric((project.openFollowUps?.length || 0) + onlineFollowups.length, 'open')}
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
      <div id="project-record-list">
        ${buildOnlineRecordList(onlineRecords, '还没有在线项目记录。')}
      </div>
      ${buildTimeline(project.timeline || [])}
    </section>
  `;

  container.innerHTML = '';
  container.appendChild(page);
  bindProjectRecordForm(page, project);
  bindProjectFollowupForm(page, project);
}

function buildStaticProjectNotice() {
  return `
    <section class="access-note">
      <strong>历史项目</strong>
      <p>这个项目来自历史 JSON 汇总。新增的项目记录和待办会写入 D1，并用项目名关联到这里。</p>
    </section>
  `;
}

function buildProjectCreatePanel(authState) {
  if (!isApiEnabled()) {
    return '<div class="access-note"><strong>静态预览</strong><p>当前环境没有连接 Workers API，项目管理不可用。</p></div>';
  }

  if (authState.user?.role !== 'owner') {
    return '<div class="access-note"><strong>只读模式</strong><p>登录 owner 账号后可以新增和管理项目。</p></div>';
  }

  return `
    <details class="settings-panel collapsible-panel">
      <summary>
        <span>
          <strong>新增项目</strong>
          <small>新开一条长期主线</small>
        </span>
      </summary>
      <form id="project-create-form" class="dashboard-settings-form">
        <label>
          <span>项目名</span>
          <input name="name" placeholder="例如：AI 工作复盘系统">
        </label>
        <label>
          <span>下一步</span>
          <input name="nextAction" placeholder="一个小到能启动的动作">
        </label>
        <label class="form-wide">
          <span>项目说明</span>
          <textarea name="summary" rows="3" placeholder="这个项目要解决什么问题？"></textarea>
        </label>
        <div class="record-form-footer">
          <span class="form-status" id="project-create-status"></span>
          <button class="primary-action" type="submit">创建项目</button>
        </div>
      </form>
    </details>
  `;
}

function buildProjectEditPanel(project) {
  return `
    <details class="settings-panel collapsible-panel">
      <summary>
        <span>
          <strong>项目设置</strong>
          <small>状态、重点、下一步</small>
        </span>
      </summary>
      <form id="project-edit-form" class="dashboard-settings-form">
        <label>
          <span>项目名</span>
          <input name="name" value="${escapeAttr(project.name)}">
        </label>
        <label>
          <span>状态</span>
          <select name="status">
            ${['active', 'paused', 'shipped', 'dropped'].map(status => `
              <option value="${status}" ${project.status === status ? 'selected' : ''}>${status}</option>
            `).join('')}
          </select>
        </label>
        <label class="form-wide">
          <span>项目说明</span>
          <textarea name="summary" rows="3">${escapeHtml(project.summary || '')}</textarea>
        </label>
        <label class="form-wide">
          <span>当前重点</span>
          <input name="currentFocus" value="${escapeAttr(project.currentFocus || '')}">
        </label>
        <label class="form-wide">
          <span>下一步</span>
          <input name="nextAction" value="${escapeAttr(project.nextAction || '')}">
        </label>
        <div class="record-form-footer">
          <span class="form-status" id="project-edit-status"></span>
          <button class="primary-action" type="submit">保存项目</button>
        </div>
      </form>
      <div class="danger-zone">
        <button class="danger-action" id="project-delete-button" type="button">删除项目</button>
      </div>
    </details>
  `;
}

function buildProjectRecordPanel(project) {
  return `
    <section class="diary-capture">
      <textarea id="project-record-input" rows="4" placeholder="记录一条项目进展、卡点或想法"></textarea>
      <div class="diary-capture-actions">
        <select id="project-record-domain" aria-label="场景">
          <option value="side_business">副业</option>
          <option value="work">主业</option>
          <option value="content">内容产出</option>
          <option value="life">生活和自我</option>
        </select>
        <select id="project-record-type" aria-label="类型">
          <option value="progress">进展</option>
          <option value="blocker">卡点</option>
          <option value="reflection">反思</option>
          <option value="thought">想法</option>
        </select>
        <button id="project-record-save" class="primary-action" type="button">写入项目记录</button>
      </div>
      <div class="form-status" id="project-record-status"></div>
    </section>
  `;
}

function buildProjectFollowupPanel(project, followups) {
  return `
    <section class="ops-panel">
      <div class="section-heading">
        <h2 class="section-title">项目待办</h2>
      </div>
      <form class="quick-inline-form followup-quick-form" id="project-followup-form">
        <textarea name="text" rows="2" placeholder="这个项目还有什么要闭环？"></textarea>
        <div class="followup-form-grid">
          <select name="domain" aria-label="场景">
            <option value="side_business">副业</option>
            <option value="work">主业</option>
            <option value="content">内容产出</option>
            <option value="life">生活和自我</option>
          </select>
          <input name="dueDate" type="date" aria-label="截止日期">
          <button class="primary-action" type="submit">新增</button>
        </div>
      </form>
      <div class="form-status" id="project-followup-status"></div>
      <div class="compact-list manageable-list" id="project-followup-list">
        ${followups.length ? followups.map(buildOnlineProjectFollowupRow).join('') : '<div class="empty-inline">暂无在线项目待办。</div>'}
      </div>
    </section>
  `;
}

function buildOnlineProjectFollowupRow(item) {
  return `
    <div class="compact-row ${item.overdue ? 'is-overdue' : ''}" data-followup-id="${escapeAttr(item.id)}">
      <div>
        <strong>${escapeHtml(item.text)}</strong>
        <span>${escapeHtml(item.domainLabel || item.domain || '未分类')}${item.dueDate ? ` · ${escapeHtml(item.dueDate)}` : ''}</span>
      </div>
      <div class="row-actions">
        <em>${escapeHtml(item.status || 'open')}</em>
        ${item.status === 'open' ? '<button type="button" data-followup-action="deferred">延后</button>' : '<button type="button" data-followup-action="open">打开</button>'}
        <button type="button" data-followup-action="closed">完成</button>
        <button type="button" data-followup-action="dropped">放弃</button>
      </div>
    </div>
  `;
}

function bindProjectCreateForm(page) {
  const form = page.querySelector('#project-create-form');
  if (!form) return;

  const status = page.querySelector('#project-create-status');
  const grid = page.querySelector('#project-grid');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = form.elements.name.value.trim();
    if (!name) {
      status.textContent = '项目名不能为空。';
      return;
    }

    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    status.textContent = '创建中...';

    try {
      const data = await createProject({
        name,
        summary: form.elements.summary.value,
        nextAction: form.elements.nextAction.value,
        status: 'active'
      });
      status.textContent = '已创建';
      form.reset();
      grid.insertAdjacentHTML('afterbegin', buildProjectCard(data.project));
    } catch (error) {
      status.textContent = error.message || '创建失败';
    } finally {
      button.disabled = false;
    }
  });
}

function bindProjectEditForm(page, project) {
  const form = page.querySelector('#project-edit-form');
  if (!form) return;

  const status = page.querySelector('#project-edit-status');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    status.textContent = '保存中...';

    try {
      await updateProject(project.slug || project.id, {
        name: form.elements.name.value,
        status: form.elements.status.value,
        summary: form.elements.summary.value,
        currentFocus: form.elements.currentFocus.value,
        nextAction: form.elements.nextAction.value
      });
      status.textContent = '已保存';
    } catch (error) {
      status.textContent = error.message || '保存失败';
    } finally {
      button.disabled = false;
    }
  });

  const deleteButton = page.querySelector('#project-delete-button');
  deleteButton?.addEventListener('click', async () => {
    const confirmed = window.confirm(`确定删除项目「${project.name}」吗？已写入的记录不会被删除。`);
    if (!confirmed) return;

    deleteButton.disabled = true;
    status.textContent = '删除中...';

    try {
      await deleteProject(project.slug || project.id);
      window.location.hash = 'projects';
    } catch (error) {
      status.textContent = error.message || '删除失败';
      deleteButton.disabled = false;
    }
  });
}

function bindProjectRecordForm(page, project) {
  const input = page.querySelector('#project-record-input');
  const button = page.querySelector('#project-record-save');
  const status = page.querySelector('#project-record-status');
  const list = page.querySelector('#project-record-list');
  if (!button) return;

  button.addEventListener('click', async () => {
    const content = input.value.trim();
    if (!content) {
      status.textContent = '先写一句项目记录。';
      return;
    }

    button.disabled = true;
    status.textContent = '保存中...';

    try {
      const data = await createRecord({
        content,
        domain: page.querySelector('#project-record-domain').value,
        type: page.querySelector('#project-record-type').value,
        projects: [project.name],
        visibility: 'private'
      });
      input.value = '';
      status.textContent = '已保存';
      list.innerHTML = buildOnlineRecordList([{ ...data.record, aiSuggestion: data.aiSuggestion }], '还没有项目记录。')
        + list.innerHTML.replace('<div class="empty-inline">还没有项目记录。</div>', '');
    } catch (error) {
      status.textContent = error.message || '保存失败';
    } finally {
      button.disabled = false;
    }
  });
}

function bindProjectFollowupForm(page, project) {
  const form = page.querySelector('#project-followup-form');
  const list = page.querySelector('#project-followup-list');
  const status = page.querySelector('#project-followup-status');
  if (!form) return;

  form.addEventListener('submit', async (event) => {
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
        project: project.name,
        dueDate: form.elements.dueDate.value
      });
      form.reset();
      status.textContent = '已新增';
      const empty = list.querySelector('.empty-inline');
      if (empty) empty.remove();
      list.insertAdjacentHTML('afterbegin', buildOnlineProjectFollowupRow(data.followup));
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
    status.textContent = '更新中...';

    try {
      const data = await updateFollowup(id, { status: nextStatus });
      if (nextStatus === 'closed' || nextStatus === 'dropped') {
        row.remove();
        if (!list.querySelector('[data-followup-id]')) {
          list.innerHTML = '<div class="empty-inline">暂无在线项目待办。</div>';
        }
      } else {
        row.outerHTML = buildOnlineProjectFollowupRow(data.followup);
      }
      status.textContent = '已更新';
    } catch (error) {
      status.textContent = error.message || '更新失败';
      button.disabled = false;
    }
  });
}

function mergeProjects(onlineProjects, staticProjects) {
  const seen = new Set();
  const result = [];

  onlineProjects.forEach(project => {
    seen.add(project.slug);
    result.push(project);
  });

  staticProjects.forEach(project => {
    if (!seen.has(project.slug)) result.push(project);
  });

  return result;
}

function buildProjectCard(project) {
  return `
    <a class="project-card" href="#projects/${escapeAttr(encodeURIComponent(project.slug))}">
      <div class="domain-card-topline">
        <span>${escapeHtml(project.status || 'active')}${project.source === 'd1' ? ' · online' : ''}</span>
        <span>${escapeHtml((project.updatedAt || project.lastUpdated || '').slice(0, 10))}</span>
      </div>
      <h3>${escapeHtml(project.name)}</h3>
      <p>${escapeHtml(project.summary || project.currentFocus || '')}</p>
      <div class="metric-row">
        <span>${project.recordCount || 0} 记录</span>
        <span>${escapeHtml(project.nextAction || `${project.openFollowUps || 0} open`)}</span>
      </div>
    </a>
  `;
}

function normalizeRouteSlug(value) {
  let normalized = String(value || '');
  for (let i = 0; i < 2; i += 1) {
    try {
      const next = decodeURIComponent(normalized);
      if (next === normalized) break;
      normalized = next;
    } catch (error) {
      break;
    }
  }
  return normalized;
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

function escapeAttr(value) {
  return escapeHtml(value).replace(/"/g, '&quot;');
}
