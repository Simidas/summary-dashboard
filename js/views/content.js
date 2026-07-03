/* ========================================
   Content View
   ======================================== */

import { createContentItem, getContentItems, updateContentItem } from '../api.js?v=20260703a';
import { getAuthState, isApiEnabled } from '../auth.js?v=20260703a';
import { loadContentSeeds } from '../data.js?v=20260703a';

const STATUSES = ['all', 'idea', 'outline', 'drafting', 'published', 'dropped'];

export async function renderContentView(container) {
  container.innerHTML = `
    <div class="page">
      <div class="skeleton" style="height: 220px;"></div>
    </div>
  `;

  const authState = getAuthState();
  const useOwnerApi = isApiEnabled() && authState.user?.role === 'owner';
  const [data, onlineData] = await Promise.all([
    useOwnerApi ? Promise.resolve(null) : loadContentSeeds(),
    isApiEnabled() && authState.user ? getContentItems({ limit: 100 }).catch(() => null) : Promise.resolve(null)
  ]);
  const seeds = useOwnerApi
    ? mergeContentSeeds(onlineData?.items || [], [])
    : mergeContentSeeds(onlineData?.items || [], data?.seeds || []);
  const stats = countByStatus(seeds);

  const page = document.createElement('div');
  page.className = 'page operations-page';
  page.innerHTML = `
    <div class="view-header animate-fade-in-up">
      <h1 class="view-title">Content</h1>
      <p class="view-subtitle">从真实经历里沉淀公众号选题和文章素材</p>
    </div>

    <section class="metric-grid">
      ${buildMetric(seeds.length, '素材')}
      ${buildMetric(stats.idea || 0, 'idea')}
      ${buildMetric(stats.drafting || 0, 'drafting')}
      ${buildMetric(stats.published || 0, 'published')}
    </section>

    ${buildContentCapturePanel(authState)}

    <section class="ops-panel">
      <div class="filter-tabs" id="content-filter-tabs">
        ${STATUSES.map((status, index) => `
          <button class="filter-tab ${index === 0 ? 'active' : ''}" type="button" data-status="${escapeHtml(status)}">${escapeHtml(status)}</button>
        `).join('')}
      </div>
      <div id="content-seed-list">
        ${buildSeeds(seeds)}
      </div>
    </section>
  `;

  container.innerHTML = '';
  container.appendChild(page);
  bindFilters(page, seeds);
  bindContentCapture(page, seeds);
  bindContentActions(page, seeds);
}

function bindFilters(page, seeds) {
  const tabs = page.querySelectorAll('.filter-tab');
  const list = page.querySelector('#content-seed-list');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const status = tab.dataset.status;
      tabs.forEach(item => item.classList.toggle('active', item === tab));
      list.innerHTML = buildSeeds(getFilteredSeeds(seeds, status));
    });
  });
}

function buildContentCapturePanel(authState) {
  if (!authState.apiAvailable) {
    return `
      <section class="access-note">
        <strong>静态预览</strong>
        <p>当前环境没有连接 Workers API，内容素材仍展示本地 JSON。</p>
      </section>
    `;
  }

  if (!authState.user) {
    return `
      <section class="record-capture-panel">
        <div>
          <div class="ops-kicker">Content Capture</div>
          <h2>登录后新增内容素材</h2>
          <p>把工作、副业、生活里的真实经历先收进素材池。</p>
        </div>
        <a class="primary-action" href="/api/auth/google/start">Google 登录</a>
      </section>
    `;
  }

  if (authState.user.role !== 'owner') return '';

  return `
    <section class="settings-panel">
      <div class="section-heading">
        <h2 class="section-title">新增内容素材</h2>
      </div>
      <form id="content-item-form" class="dashboard-settings-form">
        <label>
          <span>标题</span>
          <input name="title" placeholder="这条经历可以写成什么选题？">
        </label>
        <div class="record-form-grid">
          <label>
            <span>来源场景</span>
            <select name="sourceDomain">
              <option value="work">主业</option>
              <option value="side_business">副业</option>
              <option value="life">生活和自我</option>
              <option value="content">内容产出</option>
            </select>
          </label>
          <label>
            <span>状态</span>
            <select name="status">
              <option value="idea">idea</option>
              <option value="outline">outline</option>
              <option value="drafting">drafting</option>
              <option value="published">published</option>
            </select>
          </label>
        </div>
        <label>
          <span>角度</span>
          <textarea name="angle" rows="3" placeholder="这篇内容打算解决谁的什么问题？"></textarea>
        </label>
        <label>
          <span>下一步</span>
          <input name="nextAction" placeholder="例如：写 5 个小标题">
        </label>
        <label>
          <span>标签</span>
          <input name="tags" placeholder="用逗号分隔">
        </label>
        <div class="record-form-footer">
          <span class="form-status" id="content-item-status"></span>
          <button class="primary-action" type="submit">保存素材</button>
        </div>
      </form>
    </section>
  `;
}

function bindContentCapture(page, seeds) {
  const form = page.querySelector('#content-item-form');
  if (!form) return;

  const status = page.querySelector('#content-item-status');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const title = form.elements.title.value.trim();
    if (!title) {
      status.textContent = '先写一个标题。';
      return;
    }

    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    status.textContent = '保存中...';

    try {
      const data = await createContentItem({
        title,
        sourceDomain: form.elements.sourceDomain.value,
        status: form.elements.status.value,
        angle: form.elements.angle.value,
        nextAction: form.elements.nextAction.value,
        tags: splitLinesOrComma(form.elements.tags.value)
      });
      seeds.unshift(prepareContentSeed(data.item));
      form.reset();
      status.textContent = '已保存';
      renderSeedList(page, seeds);
    } catch (error) {
      status.textContent = error.message || '保存失败';
    } finally {
      button.disabled = false;
    }
  });
}

function bindContentActions(page, seeds) {
  const list = page.querySelector('#content-seed-list');
  if (!list) return;

  list.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-content-save]');
    if (!button) return;

    const card = button.closest('[data-content-id]');
    const id = card?.dataset.contentId;
    if (!id) return;

    const item = seeds.find(seed => seed.id === id);
    const status = card.querySelector('[name="status"]')?.value;
    const nextAction = card.querySelector('[name="nextAction"]')?.value;
    button.disabled = true;
    button.textContent = '保存中';

    try {
      const data = await updateContentItem(id, { status, nextAction });
      Object.assign(item, prepareContentSeed(data.item));
      renderSeedList(page, seeds);
    } catch (error) {
      button.textContent = error.message || '失败';
      button.disabled = false;
    }
  });
}

function renderSeedList(page, seeds) {
  const list = page.querySelector('#content-seed-list');
  if (!list) return;
  const status = page.querySelector('.filter-tab.active')?.dataset.status || 'all';
  list.innerHTML = buildSeeds(getFilteredSeeds(seeds, status));
}

function buildMetric(value, label) {
  return `
    <article class="metric-card">
      <strong>${escapeHtml(value)}</strong>
      <span>${escapeHtml(label)}</span>
    </article>
  `;
}

function buildSeeds(seeds) {
  if (!seeds.length) return '<div class="empty-inline">暂无匹配素材。</div>';

  return `
    <div class="seed-grid">
      ${seeds.map(seed => `
        <article class="seed-card" ${seed.source === 'd1' ? `data-content-id="${escapeAttr(seed.id)}"` : ''}>
          <div class="seed-meta">${escapeHtml(seed.sourceDomainLabel)}${seed.sourceDate ? ` · ${escapeHtml(seed.sourceDate)}` : ''} · ${escapeHtml(seed.status)}</div>
          <h3>${escapeHtml(seed.title)}</h3>
          ${seed.angle ? `<p>${escapeHtml(seed.angle)}</p>` : ''}
          ${seed.nextAction ? `<div class="record-line-action">下一步：${escapeHtml(seed.nextAction)}</div>` : ''}
          ${seed.tags?.length ? `
            <div class="pill-list">
              ${seed.tags.slice(0, 4).map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}
            </div>
          ` : ''}
          ${seed.source === 'd1' ? `
            <div class="inline-edit-row">
              <select name="status" aria-label="内容状态">
                ${STATUSES.filter(status => status !== 'all').map(status => `<option value="${status}" ${seed.status === status ? 'selected' : ''}>${status}</option>`).join('')}
              </select>
              <input name="nextAction" value="${escapeAttr(seed.nextAction || '')}" placeholder="下一步">
              <button type="button" data-content-save>保存</button>
            </div>
          ` : ''}
        </article>
      `).join('')}
    </div>
  `;
}

function mergeContentSeeds(onlineItems, staticSeeds) {
  const mappedOnline = onlineItems.map(prepareContentSeed);
  return [...mappedOnline, ...staticSeeds];
}

function prepareContentSeed(item) {
  return {
    ...item,
    sourceDomainLabel: getDomainLabel(item.sourceDomain),
    sourceDate: item.createdAt ? item.createdAt.slice(0, 10) : '',
    source: item.source || 'd1',
    tags: item.tags || []
  };
}

function countByStatus(seeds) {
  return seeds.reduce((stats, seed) => {
    stats[seed.status] = (stats[seed.status] || 0) + 1;
    return stats;
  }, {});
}

function getFilteredSeeds(seeds, status) {
  return status === 'all' ? seeds : seeds.filter(seed => seed.status === status);
}

function splitLinesOrComma(value) {
  return String(value || '')
    .split(/[\n,，]/)
    .map(item => item.trim())
    .filter(Boolean);
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
