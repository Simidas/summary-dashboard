/* ========================================
   Diary View
   ======================================== */

import { createRecord, getRecords } from '../api.js?v=20260703e';
import { getAuthState, isApiEnabled } from '../auth.js?v=20260703e';
import { buildAiPendingCard, waitForRecordAiSuggestion } from '../components/ai-polling.js?v=20260703e';
import { buildOnlineRecordList, replaceOnlineRecordCard } from '../components/online-records.js?v=20260703e';
import { bindRecordDestinationActions } from '../components/record-destinations.js?v=20260703e';

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
  const onlineRecordsData = apiMode
    ? await getRecords({ type: 'diary', limit: 50 }).catch(() => null)
    : null;
  const onlineRecords = onlineRecordsData?.records || [];
  const drafts = canWriteLocal ? readDrafts() : [];
  const displayRecords = apiMode ? onlineRecords : drafts.map(mapDraftToRecord);

  const page = document.createElement('div');
  page.className = 'page operations-page';
  page.innerHTML = `
    <div class="view-header animate-fade-in-up">
      <h1 class="view-title">Diary</h1>
      <p class="view-subtitle">生活和自我场景下的日记入口，承接碎碎念、情绪出口和当下状态</p>
    </div>

    ${canWriteOnline ? buildOnlineDiaryForm() : canWriteLocal ? buildCaptureForm() : buildReadOnlyNotice(authState, apiMode)}

    <section class="ops-two-column">
      <div class="ops-panel">
        <div class="section-heading">
          <h2 class="section-title">最近状态</h2>
        </div>
        ${buildPatternSummary(displayRecords)}
      </div>
      <div class="ops-panel">
        <div class="section-heading">
          <h2 class="section-title">AI 回声</h2>
        </div>
        ${buildRecentAiEcho(displayRecords)}
      </div>
    </section>

    <section class="ops-panel">
      <div class="section-heading">
        <h2 class="section-title">Diary 记录</h2>
        ${apiMode ? '<a href="#records/diary" class="text-link">Records</a>' : ''}
      </div>
      <div id="diary-record-list">
        ${apiMode
          ? buildOnlineRecordList(onlineRecords, authState.user ? '还没有 Diary 记录。' : '还没有公开 Diary。')
          : buildDrafts(drafts)}
      </div>
    </section>
  `;

  container.innerHTML = '';
  container.appendChild(page);
  bindRecordDestinationActions(page);
  if (canWriteOnline) bindOnlineDiaryForm(page, onlineRecords);
  if (canWriteLocal) bindDraftForm(page);
}

function isLocalAuthorMode() {
  const localHosts = ['localhost', '127.0.0.1', '::1'];
  return localHosts.includes(window.location.hostname) || window.location.protocol === 'file:';
}

function buildCaptureForm() {
  return `
    <section class="diary-capture">
      <div class="diary-capture-heading">
        <div class="ops-kicker">生活和自我 · 日记</div>
        <h2>写下现在这一刻</h2>
      </div>
      <textarea id="diary-draft-input" rows="4" placeholder="现在脑子里有什么？"></textarea>
      <div class="diary-capture-actions">
        <button id="diary-save-draft" class="primary-action" type="button">保存草稿</button>
      </div>
    </section>
  `;
}

function buildOnlineDiaryForm() {
  return `
    <section class="diary-capture">
      <div class="diary-capture-heading">
        <div class="ops-kicker">生活和自我 · 日记</div>
        <h2>写下现在这一刻</h2>
      </div>
      <textarea id="diary-online-input" rows="5" placeholder="现在脑子里有什么？不用整理，直接写。"></textarea>
      <div class="diary-capture-actions">
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

function bindOnlineDiaryForm(page, onlineRecords = []) {
  const input = page.querySelector('#diary-online-input');
  const visibilitySelect = page.querySelector('#diary-visibility-select');
  const button = page.querySelector('#diary-save-online');
  const status = page.querySelector('#diary-online-status');
  const result = page.querySelector('#diary-online-result');
  const list = page.querySelector('#diary-record-list');

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
        domain: 'life',
        type: 'diary',
        visibility: visibilitySelect.value
      });
      input.value = '';
      status.textContent = data.aiPending ? '已保存，AI 建议生成中...' : '已保存';
      result.innerHTML = data.aiPending ? buildAiPendingCard('Diary 已保存，AI 正在温柔地读一遍。') : buildOnlineAnalysis(data.aiSuggestion);
      if (list) {
        onlineRecords.unshift({ ...data.record, aiSuggestion: data.aiSuggestion });
        list.innerHTML = buildOnlineRecordList(onlineRecords, '还没有 Diary 记录。');
      }
      if (data.aiPending) {
        waitForRecordAiSuggestion(data.record.id, {
          onReady: (aiSuggestion, record) => {
            status.textContent = 'AI 建议已生成';
            result.innerHTML = buildOnlineAnalysis(aiSuggestion);
            const index = onlineRecords.findIndex(item => item.id === record.id);
            if (index >= 0) onlineRecords[index] = { ...record, aiSuggestion };
            replaceOnlineRecordCard(list, { ...record, aiSuggestion });
          },
          onTimeout: () => {
            status.textContent = '已保存，AI 建议稍后会出现在列表里';
          }
        });
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
  const button = page.querySelector('#diary-save-draft');
  const list = page.querySelector('#diary-record-list');

  button?.addEventListener('click', () => {
    const content = input.value.trim();
    if (!content) return;

    const drafts = readDrafts();
    drafts.unshift({
      id: `draft-${Date.now()}`,
      createdAt: new Date().toISOString(),
      domain: 'life',
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
  if (!entries.length) {
    return '<div class="empty-inline">还没有 Diary 数据。</div>';
  }

  const recentEntries = entries.slice(0, 10);
  const tags = topValues(entries.flatMap(entry => [
    ...(entry.tags || []),
    ...(entry.aiSuggestion?.suggestedTags || [])
  ]), 8);
  const moods = topValues(entries.map(entry => entry.mood).filter(Boolean), 6);
  const dates = new Set(entries.map(entry => getDateKey(entry)).filter(Boolean));
  const lastDate = getDateKey(entries[0]);
  const privateCount = entries.filter(entry => entry.visibility === 'private').length;
  const publicCount = entries.filter(entry => entry.visibility === 'public').length;

  return `
    <div class="metric-row wrap">
      <span>${entries.length} 条记录</span>
      <span>${dates.size} 个记录日</span>
      ${lastDate ? `<span>最近 ${escapeHtml(lastDate)}</span>` : ''}
      ${privateCount ? `<span>${privateCount} 私密</span>` : ''}
      ${publicCount ? `<span>${publicCount} 公开</span>` : ''}
    </div>
    ${moods.length || tags.length ? `
      <div class="pill-list">
        ${[...moods, ...tags].slice(0, 10).map(item => `<span class="tag">${escapeHtml(item)}</span>`).join('')}
      </div>
    ` : ''}
    <div class="diary-recent-lines">
      ${recentEntries.slice(0, 3).map(entry => `
        <p>${escapeHtml(String(entry.content || entry.summary || '').slice(0, 90))}</p>
      `).join('')}
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

function buildRecentAiEcho(entries) {
  const echoes = entries
    .map(entry => entry.aiSuggestion)
    .filter(Boolean)
    .flatMap(suggestion => [
      suggestion.validation,
      suggestion.emotionalRead,
      suggestion.nextSmallStep ? `下一小步：${suggestion.nextSmallStep}` : ''
    ])
    .filter(Boolean)
    .slice(0, 5);

  if (!echoes.length) {
    return '<div class="empty-inline">AI 建议生成后，会在这里沉淀最近的反馈。</div>';
  }

  return `
    <ul class="plain-list">
      ${echoes.map(item => `<li>${escapeHtml(item)}</li>`).join('')}
    </ul>
  `;
}

function mapDraftToRecord(draft) {
  return {
    id: draft.id,
    createdAt: draft.createdAt,
    date: draft.createdAt?.slice(0, 10),
    domain: 'life',
    type: 'diary',
    content: draft.content,
    visibility: draft.visibility
  };
}

function getDateKey(entry) {
  return entry.date || entry.createdAt?.slice(0, 10) || '';
}

function topValues(values, limit = 8) {
  const counts = new Map();
  values
    .map(value => String(value || '').trim())
    .filter(Boolean)
    .forEach(value => counts.set(value, (counts.get(value) || 0) + 1));

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN'))
    .slice(0, limit)
    .map(([value]) => value);
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value == null ? '' : String(value);
  return div.innerHTML;
}
