/* ========================================
   Records Center View
   ======================================== */

import { getProjects, getRecords } from '../api.js?v=20260702d';
import { getAuthState, isApiEnabled } from '../auth.js?v=20260702d';
import { buildOnlineRecordList, replaceOnlineRecordCard } from '../components/online-records.js?v=20260702d';
import { bindUnifiedRecordForm, buildUnifiedRecordForm } from '../components/unified-record-form.js?v=20260702d';
import { DOMAIN_OPTIONS, RECORD_TYPE_OPTIONS } from '../components/record-types.js?v=20260702d';

const PAGE_SIZE = 12;
const QUICK_RECORD_TYPES = new Set(RECORD_TYPE_OPTIONS.map(item => item.value));
const LIFE_ONLY_QUICK_TYPES = new Set(['diary', 'health']);

export async function renderRecordsView(container, params = {}) {
  container.innerHTML = `
    <div class="page">
      <div class="skeleton" style="height: 220px;"></div>
    </div>
  `;

  const authState = getAuthState();
  const canUseApi = isApiEnabled() && authState.user;
  const canWrite = canUseApi && authState.user?.role === 'owner';
  const [recordsData, projectsData] = await Promise.all([
    canUseApi ? getRecords({ limit: 200 }).catch(() => null) : Promise.resolve(null),
    canWrite ? getProjects().catch(() => null) : Promise.resolve(null)
  ]);
  const records = recordsData?.records || [];
  const projects = projectsData?.projects || [];
  const recordDefaults = resolveRecordDefaults(params);

  const page = document.createElement('div');
  page.className = 'page operations-page';
  page.innerHTML = `
    <section class="ops-hero animate-fade-in-up">
      <div>
        <div class="ops-kicker">记录中枢</div>
        <h1 class="ops-title">所有输入先从这里进入</h1>
        <p class="ops-hero-focus">情绪、任务、笔记、复盘、灵感、日记和健康都可以低摩擦记录，内容素材交给 AI 从记录里识别。</p>
      </div>
      <div class="ops-next-step">
        <span>使用原则</span>
        <strong>先记录，再让 AI 帮你理解、拆小和沉淀。</strong>
      </div>
    </section>

    ${buildAccessOrForm(authState, canWrite, projects, recordDefaults)}

    <section class="ops-panel records-filter-panel">
      <div class="section-heading">
        <h2 class="section-title">记录库</h2>
        <span class="panel-date">共 ${records.length} 条</span>
      </div>
      <div class="records-filter-row">
        <select id="records-domain-filter" aria-label="场景筛选">
          <option value="">全部场景</option>
          ${DOMAIN_OPTIONS.map(item => `<option value="${escapeAttr(item.value)}">${escapeHtml(item.label)}</option>`).join('')}
        </select>
        <select id="records-type-filter" aria-label="类型筛选">
          <option value="">全部类型</option>
          ${RECORD_TYPE_OPTIONS.map(item => `<option value="${escapeAttr(item.value)}">${escapeHtml(item.label)}</option>`).join('')}
        </select>
      </div>
      <div id="records-list"></div>
    </section>
  `;

  container.innerHTML = '';
  container.appendChild(page);
  if (canWrite) {
    bindUnifiedRecordForm(page, {
      id: 'records-center',
      onSaved: (data) => {
        records.unshift({ ...data.record, aiSuggestion: data.aiSuggestion });
        renderRecordList(page, records, 1);
      },
      onAiReady: (aiSuggestion, record) => {
        const cached = records.find(item => item.id === record.id);
        if (cached) cached.aiSuggestion = aiSuggestion;
        replaceOnlineRecordCard(page, { ...record, aiSuggestion });
      }
    });
  }
  bindFilters(page, records);
  renderRecordList(page, records, 1);
}

function buildAccessOrForm(authState, canWrite, projects, defaults = {}) {
  if (!authState.apiAvailable) {
    return `
      <section class="access-note">
        <strong>静态预览</strong>
        <p>当前环境没有连接 Workers API，记录中枢只能在部署环境使用。</p>
      </section>
    `;
  }

  if (!authState.user) {
    return `
      <section class="record-capture-panel">
        <div>
          <div class="ops-kicker">Online Recording</div>
          <h2>登录后开始记录</h2>
          <p>使用 Google 登录 owner 账号后，可以写入私密记录并触发 AI 建议。</p>
        </div>
        <a class="primary-action" href="/api/auth/google/start">Google 登录</a>
      </section>
    `;
  }

  if (!canWrite) {
    return `
      <section class="access-note">
        <strong>只读账号</strong>
        <p>当前账号只能浏览公开内容，不能写入记录。</p>
      </section>
    `;
  }

  return buildUnifiedRecordForm({
    id: 'records-center',
    title: '记一笔经营数据',
    subtitle: '选择场景和类型即可。任务类会进入未闭环事项，主题标签最多填 3 个。',
    defaultDomain: defaults.defaultDomain,
    defaultType: defaults.defaultType,
    projects,
    rows: 6
  });
}

function resolveRecordDefaults(params = {}) {
  const quickType = String(params.date || '').trim();
  const defaultType = QUICK_RECORD_TYPES.has(quickType) ? quickType : 'note';
  const lastDomain = localStorage.getItem('summary-dashboard:last-domain') || 'life';
  return {
    defaultType,
    defaultDomain: LIFE_ONLY_QUICK_TYPES.has(defaultType) ? 'life' : lastDomain
  };
}

function bindFilters(page, records) {
  page.querySelector('#records-domain-filter')?.addEventListener('change', () => renderRecordList(page, records, 1));
  page.querySelector('#records-type-filter')?.addEventListener('change', () => renderRecordList(page, records, 1));
}

function renderRecordList(page, records, pageNumber = 1) {
  const list = page.querySelector('#records-list');
  if (!list) return;

  const domain = page.querySelector('#records-domain-filter')?.value || '';
  const type = page.querySelector('#records-type-filter')?.value || '';
  const filtered = records.filter(record => (!domain || record.domain === domain) && (!type || record.type === type));
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(Math.max(pageNumber, 1), totalPages);
  const pageRecords = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  list.innerHTML = `
    ${buildOnlineRecordList(pageRecords, '没有符合条件的记录。')}
    ${filtered.length > PAGE_SIZE ? buildPagination(current, totalPages) : ''}
  `;

  list.querySelectorAll('[data-records-page]').forEach(button => {
    button.addEventListener('click', () => {
      renderRecordList(page, records, Number(button.dataset.recordsPage));
    });
  });
}

function buildPagination(current, totalPages) {
  return `
    <div class="record-pagination">
      <button type="button" data-records-page="${current - 1}" ${current <= 1 ? 'disabled' : ''}>上一页</button>
      <span>${current} / ${totalPages}</span>
      <button type="button" data-records-page="${current + 1}" ${current >= totalPages ? 'disabled' : ''}>下一页</button>
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
