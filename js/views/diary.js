/* ========================================
   Diary View
   ======================================== */

import { loadDiaryEntries } from '../data.js?v=20260626g';
import { createRecord, getRecords } from '../api.js?v=20260626g';
import { getAuthState, isApiEnabled } from '../auth.js?v=20260626g';
import { buildOnlineRecordList } from '../components/online-records.js?v=20260626g';

const DRAFT_KEY = 'summary-dashboard:diary-drafts';

export async function renderDiaryView(container) {
  container.innerHTML = `
    <div class="page">
      <div class="skeleton" style="height: 220px;"></div>
    </div>
  `;

  const authState = getAuthState();
  const apiMode = isApiEnabled();
  const canWriteOnline = apiMode && authState.user?.role === 'owner';
  const canWriteLocal = !apiMode && isLocalAuthorMode();
  const [allEntries, onlineRecordsData] = await Promise.all([
    loadDiaryEntries(),
    apiMode ? getRecords({ type: 'diary', limit: 30 }).catch(() => null) : Promise.resolve(null)
  ]);
  const entries = canWriteLocal || canWriteOnline
    ? allEntries
    : allEntries.filter(entry => entry.visibility === 'public');
  const onlineRecords = onlineRecordsData?.records || [];
  const drafts = canWriteLocal ? readDrafts() : [];

  const page = document.createElement('div');
  page.className = 'page operations-page';
  page.innerHTML = `
    <div class="view-header animate-fade-in-up">
      <h1 class="view-title">Diary</h1>
      <p class="view-subtitle">随手记录想法、情绪和碎片念头</p>
    </div>

    ${canWriteOnline ? buildOnlineDiaryForm() : canWriteLocal ? buildCaptureForm() : buildReadOnlyNotice(authState, apiMode)}

    <section class="ops-two-column">
      <div class="ops-panel">
        <div class="section-heading">
          <h2 class="section-title">${canWriteOnline ? '线上 Diary' : canWriteLocal ? '本地草稿' : '访问权限'}</h2>
        </div>
        ${canWriteOnline
          ? `<div id="diary-online-list">${buildOnlineRecordList(onlineRecords, '还没有线上 Diary。')}</div>`
          : canWriteLocal
            ? `<div id="diary-draft-list">${buildDrafts(drafts)}</div>`
            : '<div class="empty-inline">登录 owner 账号后可写入 Diary。访客只能浏览公开内容。</div>'}
      </div>
      <div class="ops-panel">
        <div class="section-heading">
          <h2 class="section-title">最近模式</h2>
        </div>
        ${buildPatternSummary(entries)}
      </div>
    </section>

    <section class="ops-panel">
      <div class="section-heading">
        <h2 class="section-title">Diary 记录</h2>
      </div>
      ${buildEntries(entries)}
    </section>
  `;

  container.innerHTML = '';
  container.appendChild(page);
  if (canWriteOnline) bindOnlineDiaryForm(page);
  if (canWriteLocal) bindDraftForm(page);
}

function isLocalAuthorMode() {
  const localHosts = ['localhost', '127.0.0.1', '::1'];
  return localHosts.includes(window.location.hostname) || window.location.protocol === 'file:';
}

function buildCaptureForm() {
  return `
    <section class="diary-capture">
      <textarea id="diary-draft-input" rows="4" placeholder="现在脑子里有什么？"></textarea>
      <div class="diary-capture-actions">
        <select id="diary-domain-select" aria-label="场景">
          <option value="life">生活和自我</option>
          <option value="work">主业</option>
          <option value="side_business">副业</option>
          <option value="content">内容产出</option>
        </select>
        <button id="diary-save-draft" class="primary-action" type="button">保存草稿</button>
      </div>
    </section>
  `;
}

function buildOnlineDiaryForm() {
  return `
    <section class="diary-capture">
      <textarea id="diary-online-input" rows="5" placeholder="现在脑子里有什么？不用整理，直接写。"></textarea>
      <div class="diary-capture-actions">
        <select id="diary-domain-select" aria-label="场景">
          <option value="life">生活和自我</option>
          <option value="work">主业</option>
          <option value="side_business">副业</option>
          <option value="content">内容产出</option>
        </select>
        <select id="diary-visibility-select" aria-label="可见性">
          <option value="private">私密</option>
          <option value="public">公开</option>
        </select>
        <button id="diary-save-online" class="primary-action" type="button">保存 Diary</button>
      </div>
      <div class="form-status" id="diary-online-status"></div>
      <div id="diary-online-result"></div>
    </section>
  `;
}

function buildReadOnlyNotice(authState, apiMode) {
  if (apiMode && !authState.user) {
    return `
      <section class="access-note">
        <strong>登录后写 Diary</strong>
        <p>当前可以浏览公开 Diary。使用 Google 登录 owner 账号后，就能在这里写入私密记录。</p>
      </section>
    `;
  }

  return `
    <section class="access-note">
      <strong>只读模式</strong>
      <p>当前账号没有写入权限。访客可以浏览你主动公开的内容，但不能记录或提交内容。</p>
    </section>
  `;
}

function bindOnlineDiaryForm(page) {
  const input = page.querySelector('#diary-online-input');
  const domainSelect = page.querySelector('#diary-domain-select');
  const visibilitySelect = page.querySelector('#diary-visibility-select');
  const button = page.querySelector('#diary-save-online');
  const status = page.querySelector('#diary-online-status');
  const result = page.querySelector('#diary-online-result');
  const list = page.querySelector('#diary-online-list');

  button?.addEventListener('click', async () => {
    const content = input.value.trim();
    if (!content) {
      status.textContent = '先写一句就可以。';
      return;
    }

    button.disabled = true;
    status.textContent = '保存中...';
    result.innerHTML = '';

    try {
      const data = await createRecord({
        content,
        domain: domainSelect.value,
        type: 'diary',
        visibility: visibilitySelect.value
      });
      input.value = '';
      status.textContent = '已保存';
      result.innerHTML = buildOnlineAnalysis(data.aiSuggestion);
      if (list) {
        list.innerHTML = buildOnlineRecordList([{ ...data.record, aiSuggestion: data.aiSuggestion }], '还没有线上 Diary。')
          + list.innerHTML.replace('<div class="empty-inline">还没有线上 Diary。</div>', '');
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

function bindDraftForm(page) {
  const input = page.querySelector('#diary-draft-input');
  const domainSelect = page.querySelector('#diary-domain-select');
  const button = page.querySelector('#diary-save-draft');
  const list = page.querySelector('#diary-draft-list');

  button?.addEventListener('click', () => {
    const content = input.value.trim();
    if (!content) return;

    const drafts = readDrafts();
    drafts.unshift({
      id: `draft-${Date.now()}`,
      createdAt: new Date().toISOString(),
      domain: domainSelect.value,
      content,
      visibility: 'private'
    });
    writeDrafts(drafts);
    input.value = '';
    list.innerHTML = buildDrafts(drafts);
  });
}

function readDrafts() {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_KEY) || '[]');
  } catch (e) {
    return [];
  }
}

function writeDrafts(drafts) {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(drafts.slice(0, 20)));
}

function buildDrafts(drafts) {
  if (!drafts.length) return '<div class="empty-inline">暂无本地草稿。</div>';

  return `
    <div class="compact-list">
      ${drafts.map(draft => `
        <article class="compact-row">
          <div>
            <strong>${escapeHtml(getDomainLabel(draft.domain))}</strong>
            <span>${escapeHtml(draft.content)}</span>
          </div>
          <em>private</em>
        </article>
      `).join('')}
    </div>
  `;
}

function buildPatternSummary(entries) {
  const tags = entries.flatMap(entry => entry.tags || []);
  const moods = entries.map(entry => entry.mood).filter(Boolean);

  if (!entries.length) {
    return '<div class="empty-inline">暂无可汇总的 Diary JSON。</div>';
  }

  return `
    <div class="metric-row wrap">
      <span>${entries.length} 条记录</span>
      <span>${new Set(moods).size} 种情绪</span>
      <span>${new Set(tags).size} 个主题</span>
    </div>
    <div class="pill-list">
      ${Array.from(new Set([...moods, ...tags])).slice(0, 8).map(item => `<span class="tag">${escapeHtml(item)}</span>`).join('')}
    </div>
  `;
}

function buildEntries(entries) {
  if (!entries.length) {
    return '<div class="empty-inline">还没有正式 Diary JSON 记录。</div>';
  }

  return `
    <div class="diary-list">
      ${entries.map(entry => `
        <article class="diary-entry">
          <div class="domain-card-topline">
            <span>${escapeHtml(getDomainLabel(entry.domain))}</span>
            <span>${escapeHtml(entry.visibility || 'private')}</span>
          </div>
          <h3>${escapeHtml(entry.date || entry.createdAt?.slice(0, 10) || '')}</h3>
          <p>${escapeHtml(entry.content || '')}</p>
          ${buildAnalysis(entry.aiAnalysis)}
        </article>
      `).join('')}
    </div>
  `;
}

function buildAnalysis(analysis) {
  if (!analysis) return '<div class="empty-inline">AI 分析待生成。</div>';

  return `
    <div class="analysis-box">
      ${analysis.summary ? `<p>${escapeHtml(analysis.summary)}</p>` : ''}
      ${analysis.reframe ? `<p>${escapeHtml(analysis.reframe)}</p>` : ''}
      ${analysis.suggestions?.length ? `
        <ul class="plain-list">
          ${analysis.suggestions.map(item => `<li>${escapeHtml(item)}</li>`).join('')}
        </ul>
      ` : ''}
    </div>
  `;
}

function buildOnlineAnalysis(suggestion) {
  if (!suggestion) return '<div class="empty-inline">Diary 已保存，AI 建议稍后生成。</div>';

  return `
    <div class="analysis-box">
      ${suggestion.summary ? `<p>${escapeHtml(suggestion.summary)}</p>` : ''}
      ${suggestion.validation ? `<p>${escapeHtml(suggestion.validation)}</p>` : ''}
      ${suggestion.nextSmallStep ? `<p><strong>下一小步：</strong>${escapeHtml(suggestion.nextSmallStep)}</p>` : ''}
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

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value == null ? '' : String(value);
  return div.innerHTML;
}
