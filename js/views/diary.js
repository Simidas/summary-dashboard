/* ========================================
   Diary View
   ======================================== */

import { loadDiaryEntries } from '../data.js?v=20260625a';

const DRAFT_KEY = 'summary-dashboard:diary-drafts';

export async function renderDiaryView(container) {
  container.innerHTML = `
    <div class="page">
      <div class="skeleton" style="height: 220px;"></div>
    </div>
  `;

  const canWrite = isLocalAuthorMode();
  const allEntries = await loadDiaryEntries();
  const entries = canWrite
    ? allEntries
    : allEntries.filter(entry => entry.visibility === 'public');
  const drafts = canWrite ? readDrafts() : [];

  const page = document.createElement('div');
  page.className = 'page operations-page';
  page.innerHTML = `
    <div class="view-header animate-fade-in-up">
      <h1 class="view-title">Diary</h1>
      <p class="view-subtitle">随手记录想法、情绪和碎片念头</p>
    </div>

    ${canWrite ? buildCaptureForm() : buildReadOnlyNotice()}

    <section class="ops-two-column">
      <div class="ops-panel">
        <div class="section-heading">
          <h2 class="section-title">${canWrite ? '本地草稿' : '访问权限'}</h2>
        </div>
        ${canWrite
          ? `<div id="diary-draft-list">${buildDrafts(drafts)}</div>`
          : '<div class="empty-inline">公开站点为只读模式，访客不能写入你的 Diary。</div>'}
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
  if (canWrite) bindDraftForm(page);
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

function buildReadOnlyNotice() {
  return `
    <section class="access-note">
      <strong>只读模式</strong>
      <p>Diary 写入只在本地作者环境开放。公开访问者可以浏览你主动公开的内容，但不能记录或提交内容。</p>
    </section>
  `;
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
