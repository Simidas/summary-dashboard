/* ========================================
   Domain View
   ======================================== */

import {
  getContentItems,
  createFollowup,
  createRecord,
  getAnalysisSnapshot,
  getDomainSettings,
  getFollowups,
  getProjects,
  getRecords,
  updateDomainSettings
} from '../api.js?v=20260703d';
import { getAuthState, isApiEnabled } from '../auth.js?v=20260703d';
import { loadDomainSummary, loadProjectsManifest } from '../data.js?v=20260703d';
import { buildDomainSummaries, getDomainMeta } from '../aggregations.js?v=20260703d';
import { buildAiPendingCard, waitForRecordAiSuggestion } from '../components/ai-polling.js?v=20260703d';
import { bindAnalysisPanel, buildAnalysisPanel } from '../components/analysis-panel.js?v=20260703d';
import {
  bindEditableFollowupList,
  buildEditableFollowupRow,
  buildFollowupTimeMeta
} from '../components/followup-list.js?v=20260703d';
import { getAvailableRecordTypes } from '../components/record-types.js?v=20260703d';

export async function renderDomainView(container, params = {}) {
  const domainId = params.date || 'work';

  container.innerHTML = `
    <div class="page">
      <div class="skeleton" style="height: 220px;"></div>
    </div>
  `;

  const authState = getAuthState();
  const useOwnerApi = isApiEnabled() && authState.user?.role === 'owner';
  const [staticDomain, onlineRecordsData, onlineSettingsData, onlineFollowupsData, onlineProjectsData, onlineContentData, domainAnalysisData, projectsManifest] = await Promise.all([
    useOwnerApi ? Promise.resolve(null) : loadDomainSummary(domainId),
    isApiEnabled() && authState.user ? getRecords({ domain: domainId, limit: 20 }).catch(() => null) : Promise.resolve(null),
    isApiEnabled() && authState.user ? getDomainSettings(domainId).catch(() => null) : Promise.resolve(null),
    isApiEnabled() && authState.user ? getFollowups({ domain: domainId, status: 'all', limit: 30 }).catch(() => null) : Promise.resolve(null),
    isApiEnabled() && authState.user ? getProjects().catch(() => null) : Promise.resolve(null),
    useOwnerApi ? getContentItems({ domain: domainId, limit: 100 }).catch(() => null) : Promise.resolve(null),
    useOwnerApi ? getAnalysisSnapshot('domain', domainId, { windowDays: 7 }).catch(() => null) : Promise.resolve(null),
    useOwnerApi ? Promise.resolve(null) : loadProjectsManifest()
  ]);
  const onlineRecords = onlineRecordsData?.records || [];
  const onlineSettings = onlineSettingsData?.settings || {};
  const onlineFollowups = (onlineFollowupsData?.followups || []).filter(item => item.status === 'open' || item.status === 'deferred');
  const projectOptions = useOwnerApi
    ? onlineProjectsData?.projects || []
    : mergeProjects(onlineProjectsData?.projects || [], projectsManifest?.projects || []);
  const domain = useOwnerApi
    ? buildDomainSummaries({
      records: onlineRecords,
      followups: onlineFollowupsData?.followups || [],
      contentItems: onlineContentData?.items || [],
      settingsByDomain: { [domainId]: onlineSettings }
    }).find(item => item.id === domainId) || getDomainMeta(domainId)
    : staticDomain;

  if (!domain) {
    renderEmpty(container);
    return;
  }

  const currentFocus = onlineSettings.currentFocus || domain.currentFocus || '这个场景还没有记录。';
  const nextAction = onlineSettings.nextAction || domain.nextAction || '等待下一条记录';

  const page = document.createElement('div');
  page.className = 'page operations-page';
  page.innerHTML = `
    <section class="ops-hero animate-fade-in-up">
      <div>
        <div class="ops-kicker">${escapeHtml(domain.description)}</div>
        <h1 class="ops-title">${escapeHtml(domain.label)}</h1>
        <p class="ops-hero-focus" id="domain-current-focus">${escapeHtml(currentFocus)}</p>
      </div>
      <div class="ops-next-step">
        <span>下一步</span>
        <strong id="domain-next-action">${escapeHtml(nextAction)}</strong>
      </div>
    </section>

    ${buildDomainSettingsPanel(authState, currentFocus, nextAction, onlineSettings)}
    ${buildDomainRecordPanel(authState, domainId)}
    ${useOwnerApi ? buildAnalysisPanel({
      scopeType: 'domain',
      scopeKey: domainId,
      windowDays: 7,
      windowOptions: [7, 30],
      analysis: domainAnalysisData?.analysis || null,
      title: 'AI 场景经营分析',
      generateLabel: '生成/刷新分析',
      emptyText: '基于这个场景近 7/30 天记录，生成趋势、成果、卡点和下一步。'
    }) : ''}

    <section class="metric-grid">
      ${buildMetric(domain.recordCount || onlineRecords.length || 0, '记录')}
      ${buildMetric(domain.progressCount || 0, '进展')}
      ${buildMetric(onlineFollowups.length || domain.openFollowUps?.length || 0, 'open')}
      ${buildMetric(domain.contentSeeds?.length || 0, '素材')}
    </section>

    <section class="ops-two-column">
      <div class="ops-panel">
        <div class="section-heading">
          <h2 class="section-title">未闭环事项</h2>
        </div>
        ${buildDomainFollowupsPanel(authState, domainId, onlineFollowups, domain.openFollowUps || [], projectOptions)}
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
      ${buildOnlineRecordTimeline(onlineRecords)}
      ${useOwnerApi ? '' : buildRecordTimeline(domain.recentRecords || [])}
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
  bindDomainSettingsForm(page, domainId);
  bindDomainRecordForm(page, domainId);
  bindDomainFollowups(page, domainId);
  bindAnalysisPanel(page);
  bindAnalysisFollowupInsert(page);
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

function buildDomainSettingsPanel(authState, currentFocus, nextAction, onlineSettings) {
  if (!authState.apiAvailable || authState.user?.role !== 'owner') return '';

  return `
    <section class="settings-panel">
      <div class="section-heading">
        <h2 class="section-title">场景设置</h2>
      </div>
      <form id="domain-settings-form" class="dashboard-settings-form">
        <label>
          <span>当前焦点</span>
          <input name="currentFocus" value="${escapeAttr(currentFocus)}" placeholder="这个场景现在最重要的经营点">
        </label>
        <label>
          <span>下一步</span>
          <input name="nextAction" value="${escapeAttr(nextAction)}" placeholder="小到能立刻开始的一步">
        </label>
        <div class="record-form-footer">
          <span class="form-status" id="domain-settings-status">${onlineSettings.updatedAt ? `上次更新 ${escapeHtml(formatShortTime(onlineSettings.updatedAt))}` : ''}</span>
          <button class="primary-action" type="submit">保存场景</button>
        </div>
      </form>
    </section>
  `;
}

function buildDomainRecordPanel(authState, domainId) {
  if (!authState.apiAvailable) {
    return `
      <section class="access-note">
        <strong>静态预览</strong>
        <p>当前环境没有连接 Workers API，场景页继续展示本地 JSON。</p>
      </section>
    `;
  }

  if (!authState.user) {
    return `
      <section class="record-capture-panel">
        <div>
          <div class="ops-kicker">Domain Capture</div>
          <h2>登录后记录这个场景</h2>
          <p>把这条状态放进场景里，后续周/月复盘会更容易收束。</p>
        </div>
        <a class="primary-action" href="/api/auth/google/start">Google 登录</a>
      </section>
    `;
  }

  if (authState.user.role !== 'owner') return '';

  return `
    <section class="record-capture-panel" data-domain-record-panel>
      <div class="record-capture-intro">
        <div class="ops-kicker">写一条场景记录</div>
        <h2>先把真实状态放下来</h2>
        <p class="record-feedback-text">不用写完整复盘，一句话也能成为后续复盘的数据。</p>
      </div>
      <form id="domain-record-form" class="online-record-form">
        <input type="hidden" name="domain" value="${escapeAttr(domainId)}">
        <textarea name="content" rows="4" placeholder="这个场景现在发生了什么？"></textarea>
        <div class="record-form-grid">
          <label>
            <span>类型</span>
            <select name="type">
              ${getAvailableRecordTypes(domainId).map(item => `<option value="${escapeAttr(item.value)}">${escapeHtml(item.label)}</option>`).join('')}
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
          <span class="form-status" id="domain-record-status"></span>
          <button class="primary-action" type="submit">保存记录</button>
        </div>
      </form>
      <div id="domain-record-result"></div>
    </section>
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
            <span>${escapeHtml(item.project || item.domainLabel || '未分类')}</span>
            <span class="followup-time-meta">${escapeHtml(buildFollowupTimeMeta(item))}</span>
          </div>
          <em>${item.overdue ? '超时' : `${item.ageDays || 0}d`}</em>
        </div>
      `).join('')}
    </div>
  `;
}

function buildDomainFollowupsPanel(authState, domainId, onlineFollowups, staticFollowups, projects = []) {
  if (authState.apiAvailable && authState.user?.role === 'owner') {
    return `
      <form class="quick-inline-form followup-quick-form" id="domain-followup-form">
        <textarea name="text" rows="2" placeholder="这个场景还有什么要闭环？"></textarea>
        <div class="followup-form-grid">
          ${buildProjectSelect(projects)}
          <input name="dueDate" type="date" aria-label="截止日期">
          <button class="primary-action" type="submit">新增</button>
        </div>
      </form>
      <div class="form-status" id="domain-followup-status"></div>
      <div class="compact-list manageable-list" id="domain-followup-list" data-domain="${escapeAttr(domainId)}">
        ${onlineFollowups.length ? onlineFollowups.map(item => buildEditableFollowupRow(item, {
          contextLabel: buildDomainFollowupContext
        })).join('') : '<div class="empty-inline">暂无在线待办。</div>'}
      </div>
    `;
  }

  return buildFollowups(staticFollowups);
}

function buildProjectSelect(projects = []) {
  const options = projects
    .filter(project => project?.name)
    .map(project => `<option value="${escapeAttr(project.name)}">${escapeHtml(project.name)}</option>`)
    .join('');

  return `
    <select name="project" aria-label="项目">
      <option value="">不关联项目</option>
      ${options || '<option value="" disabled>暂无可关联项目</option>'}
    </select>
  `;
}

function mergeProjects(onlineProjects, staticProjects) {
  const seen = new Set();
  const result = [];

  onlineProjects.forEach(project => {
    if (!isVisibleProject(project)) return;
    if (!project?.name) return;
    seen.add(project.name);
    result.push(project);
  });

  staticProjects.forEach(project => {
    if (!isVisibleProject(project)) return;
    if (!project?.name || seen.has(project.name)) return;
    result.push(project);
  });

  return result;
}

function isVisibleProject(project) {
  return ['active', 'paused'].includes(project?.status);
}

function buildDomainFollowupContext(item) {
  return item.project || item.domainLabel || '未分类';
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

function buildOnlineRecordTimeline(records) {
  if (!records.length) return '';

  return `
    <div class="record-timeline online-domain-records" id="domain-online-records">
      ${records.map(buildOnlineRecordLine).join('')}
    </div>
  `;
}

function buildOnlineRecordLine(record) {
  return `
    <article class="record-line" data-online-record-id="${escapeAttr(record.id || '')}">
      <time>${escapeHtml(record.date || record.createdAt?.slice(0, 10) || '')}</time>
      <div>
        <div class="record-line-meta">在线 · ${escapeHtml(record.type || 'thought')}</div>
        <p>${escapeHtml(record.summary || record.content || '')}</p>
        ${record.aiSuggestion?.nextSmallStep ? `<div class="record-line-action">AI 下一步：${escapeHtml(record.aiSuggestion.nextSmallStep)}</div>` : ''}
        ${record.aiPending ? '<div class="record-line-action">AI 建议生成中...</div>' : ''}
      </div>
    </article>
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

function bindDomainSettingsForm(page, domainId) {
  const form = page.querySelector('#domain-settings-form');
  if (!form) return;

  const status = page.querySelector('#domain-settings-status');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    status.textContent = '保存中...';

    try {
      const data = await updateDomainSettings(domainId, {
        currentFocus: form.elements.currentFocus.value,
        nextAction: form.elements.nextAction.value
      });
      page.querySelector('#domain-current-focus').textContent = data.settings.currentFocus || '这个场景还没有记录。';
      page.querySelector('#domain-next-action').textContent = data.settings.nextAction || '等待下一条记录';
      status.textContent = '已保存';
    } catch (error) {
      status.textContent = error.message || '保存失败';
    } finally {
      button.disabled = false;
    }
  });
}

function bindDomainRecordForm(page, domainId) {
  const form = page.querySelector('#domain-record-form');
  if (!form) return;

  const status = page.querySelector('#domain-record-status');
  const result = page.querySelector('#domain-record-result');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const content = form.elements.content.value.trim();
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
        domain: domainId,
        type: form.elements.type.value,
        visibility: form.elements.visibility.value
      });
      form.elements.content.value = '';
      status.textContent = data.aiPending ? '已保存，AI 建议生成中...' : '已保存';
      result.innerHTML = data.aiPending
        ? buildAiPendingCard('记录已保存，AI 正在整理下一步。')
        : data.aiSuggestion?.nextSmallStep
        ? `<div class="next-small-step"><span>现在只做这一步</span><strong>${escapeHtml(data.aiSuggestion.nextSmallStep)}</strong></div>`
        : '<div class="empty-inline">记录已保存。</div>';
      prependDomainRecord(page, { ...data.record, aiSuggestion: data.aiSuggestion, aiPending: data.aiPending });
      if (data.aiPending) {
        waitForRecordAiSuggestion(data.record.id, {
          onReady: (aiSuggestion, record) => {
            status.textContent = 'AI 建议已生成';
            result.innerHTML = aiSuggestion?.nextSmallStep
              ? `<div class="next-small-step"><span>现在只做这一步</span><strong>${escapeHtml(aiSuggestion.nextSmallStep)}</strong></div>`
              : '<div class="empty-inline">AI 建议已生成。</div>';
            replaceDomainRecordLine(page, { ...record, aiSuggestion });
          },
          onTimeout: () => {
            status.textContent = '已保存，AI 建议稍后会出现在记录里';
          }
        });
      }
    } catch (error) {
      status.textContent = error.message || '保存失败';
    } finally {
      button.disabled = false;
    }
  });
}

function bindDomainFollowups(page, domainId) {
  const form = page.querySelector('#domain-followup-form');
  const list = page.querySelector('#domain-followup-list');
  const status = page.querySelector('#domain-followup-status');

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
        domain: domainId,
        project: form.elements.project.value,
        dueDate: form.elements.dueDate.value
      });
      form.reset();
      status.textContent = '已新增';
      const empty = list?.querySelector('.empty-inline');
      if (empty) empty.remove();
      list?.insertAdjacentHTML('afterbegin', buildEditableFollowupRow(data.followup, {
        contextLabel: buildDomainFollowupContext
      }));
    } catch (error) {
      status.textContent = error.message || '保存失败';
    } finally {
      button.disabled = false;
    }
  });

  bindEditableFollowupList(list, {
    statusEl: status,
    emptyText: '暂无在线待办。',
    contextLabel: buildDomainFollowupContext
  });
}

function bindAnalysisFollowupInsert(page) {
  page.addEventListener('analysis-followup-created', (event) => {
    const followup = event.detail?.followup;
    if (!event.detail?.created || !followup) return;

    const list = page.querySelector('#domain-followup-list');
    const empty = list?.querySelector('.empty-inline');
    if (empty) empty.remove();
    list?.insertAdjacentHTML('afterbegin', buildEditableFollowupRow(followup, {
      contextLabel: buildDomainFollowupContext
    }));
  });
}

function prependDomainRecord(page, record) {
  let list = page.querySelector('#domain-online-records');
  const timelineSection = [...page.querySelectorAll('.ops-panel')]
    .find(section => section.querySelector('.section-title')?.textContent === '最近记录');

  if (!list && timelineSection) {
    const wrapper = document.createElement('div');
    wrapper.className = 'record-timeline online-domain-records';
    wrapper.id = 'domain-online-records';
    timelineSection.insertBefore(wrapper, timelineSection.querySelector('.record-timeline'));
    list = wrapper;
  }

  list?.insertAdjacentHTML('afterbegin', buildOnlineRecordLine(record));
}

function replaceDomainRecordLine(page, record) {
  const line = Array.from(page.querySelectorAll('[data-online-record-id]'))
    .find(item => item.dataset.onlineRecordId === record.id);
  if (!line) return;
  line.outerHTML = buildOnlineRecordLine(record);
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

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value == null ? '' : String(value);
  return div.innerHTML;
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/"/g, '&quot;');
}
