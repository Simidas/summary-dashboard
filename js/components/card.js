/* ========================================
   Card Component
   ======================================== */

import { createTags } from './tag.js';
import { formatDate, getWeekday } from '../utils/date.js';

/**
 * Section icons map
 */
const SECTION_ICONS = {
  achievements: '✅',
  discussions: '💬',
  followUps: '📋',
  learnings: '💡'
};

/**
 * Create a daily summary card
 * @param {Object} data - summary data
 * @param {boolean} expanded - is card expanded by default
 * @returns {HTMLElement}
 */
export function createSummaryCard(data, expanded = false) {
  const card = document.createElement('article');
  card.className = 'card' + (expanded ? ' expanded' : '');
  card.dataset.date = data.date;

  const previewText = getDailyPreview(data);

  // Header with date, weekday, and tags
  const header = document.createElement('div');
  header.className = 'card-header';

  const dateDiv = document.createElement('div');
  dateDiv.className = 'card-date';
  dateDiv.innerHTML = `
    <span>📅</span>
    <span>${formatDate(data.date)}</span>
    <span class="card-weekday">${getWeekday(data.date)}</span>
  `;

  const tagsContainer = document.createElement('div');
  tagsContainer.className = 'card-tags';
  const tags = getDailyTags(data);
  if (tags.length > 0) {
    tagsContainer.appendChild(createTags(tags.slice(0, 3)));
  }

  header.appendChild(dateDiv);
  header.appendChild(tagsContainer);

  // Preview text
  const preview = document.createElement('p');
  preview.className = 'card-preview';
  preview.textContent = previewText;

  // Expand icon
  const expandIcon = document.createElement('span');
  expandIcon.className = 'card-expand-icon';
  expandIcon.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 6L8 10L12 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

  // Card body (expandable content)
  const body = document.createElement('div');
  body.className = 'card-body';
  body.innerHTML = buildCardBodyHTML(data);

  // Click to toggle — but not when clicking tags
  card.addEventListener('click', (e) => {
    if (e.target.closest('.tag')) return;
    card.classList.toggle('expanded');
  });

  card.appendChild(header);
  card.appendChild(preview);
  card.appendChild(expandIcon);
  card.appendChild(body);

  return card;
}

/**
 * Build card body HTML from data
 * @param {Object} data
 * @returns {string}
 */
function buildCardBodyHTML(data) {
  if (Array.isArray(data.records)) {
    return buildCompositeDailyBodyHTML(data);
  }

  let html = '';

  // Achievements
  if (data.achievements && data.achievements.length > 0) {
    html += `
      <div class="card-section">
        <div class="card-section-title">${SECTION_ICONS.achievements} 今日成就</div>
        <div class="card-section-content">
          <ul>
            ${data.achievements.map(a => `<li>${escapeHtml(a)}</li>`).join('')}
          </ul>
        </div>
      </div>
    `;
  }

  // Discussions
  if (data.discussions && data.discussions.length > 0) {
    html += `
      <div class="card-section">
        <div class="card-section-title">${SECTION_ICONS.discussions} 讨论</div>
        <div class="card-section-content">
          <ul>
            ${data.discussions.map(d => `<li>${escapeHtml(d)}</li>`).join('')}
          </ul>
        </div>
      </div>
    `;
  }

  // Follow-ups
  if (data.followUps && data.followUps.length > 0) {
    html += `
      <div class="card-section">
        <div class="card-section-title">${SECTION_ICONS.followUps} 待跟进</div>
        <div class="card-section-content">
          <ul>
            ${data.followUps.map(f => `<li>${escapeHtml(f)}</li>`).join('')}
          </ul>
        </div>
      </div>
    `;
  }

  // Learnings
  if (data.learnings && data.learnings.length > 0) {
    html += `
      <div class="card-section">
        <div class="card-section-title">${SECTION_ICONS.learnings} 学到的</div>
        <div class="card-section-content">
          <ul>
            ${data.learnings.map(l => `<li>${escapeHtml(l)}</li>`).join('')}
          </ul>
        </div>
      </div>
    `;
  }

  // Meta info
  html += `
    <div class="card-section" style="margin-top: var(--space-3); padding-top: var(--space-2); border-top: 1px dashed var(--border);">
      <div style="display: flex; gap: var(--space-3); font-size: 0.8125rem; color: var(--text-secondary);">
        ${data.exercise ? `<span>🏃 ${escapeHtml(data.exercise)}</span>` : ''}
        ${data.mood ? `<span class="mood">${data.mood}</span>` : ''}
      </div>
    </div>
  `;

  return html;
}

function buildCompositeDailyBodyHTML(data) {
  let html = '';
  const review = data.dailyReview || {};

  if (
    review.mostImportantThing ||
    review.reflection ||
    review.tomorrowFirstStep ||
    review.mood ||
    review.energy ||
    review.wins?.length ||
    review.blockers?.length
  ) {
    html += `
      <div class="card-section">
        <div class="card-section-title">🧭 今日复盘</div>
        <div class="card-section-content">
          ${review.mostImportantThing ? `<p><strong>最重要的事：</strong>${escapeHtml(review.mostImportantThing)}</p>` : ''}
          ${buildInlineListHTML('今日收获', review.wins || [])}
          ${buildInlineListHTML('卡点', review.blockers || [])}
          ${review.reflection ? `<p><strong>反思：</strong>${escapeHtml(review.reflection)}</p>` : ''}
          ${review.tomorrowFirstStep ? `<p><strong>明天第一步：</strong>${escapeHtml(review.tomorrowFirstStep)}</p>` : ''}
          ${review.mood || review.energy ? `<p><strong>状态：</strong>${escapeHtml([review.mood, review.energy ? `能量 ${review.energy}/5` : ''].filter(Boolean).join(' · '))}</p>` : ''}
        </div>
      </div>
    `;
  }

  if (data.records && data.records.length > 0) {
    html += `
      <div class="card-section">
        <div class="card-section-title">📝 场景记录</div>
        <div class="record-list">
          ${data.records.map(record => buildRecordHTML(record)).join('')}
        </div>
      </div>
    `;
  }

  return html || `
    <div class="card-section">
      <div class="card-section-content">这一天还没有填写记录。</div>
    </div>
  `;
}

function buildRecordHTML(record) {
  const body = record.summary || record.raw || record.content || '';
  const nextActions = record.nextActions || [];
  const blockers = record.blockers || [];
  const contentSeeds = record.contentSeeds || [];
  const suggestions = record.aiAnalysis?.suggestions || record.ai?.suggestions || [];
  const aiSuggestion = record.aiSuggestion;

  return `
    <article class="record-item">
      <div class="record-meta">
        <span>${escapeHtml(getDomainLabel(record.domain))}</span>
        <span>${escapeHtml(getTypeLabel(record.type))}</span>
      </div>
      ${body ? `<p class="record-body">${escapeHtml(body)}</p>` : ''}
      ${buildInlineListHTML('卡点', blockers)}
      ${buildInlineListHTML('下一步', nextActions)}
      ${buildInlineListHTML('内容素材', contentSeeds)}
      ${buildInlineListHTML('AI 建议', suggestions)}
      ${aiSuggestion?.nextSmallStep ? buildInlineListHTML('AI 下一步', [aiSuggestion.nextSmallStep]) : ''}
      ${aiSuggestion?.encouragement ? buildInlineListHTML('AI 鼓励', [aiSuggestion.encouragement]) : ''}
    </article>
  `;
}

function buildInlineListHTML(label, items = []) {
  if (!items.length) return '';

  return `
    <div class="record-inline-list">
      <strong>${escapeHtml(label)}：</strong>
      <span>${items.map(item => escapeHtml(item)).join('；')}</span>
    </div>
  `;
}

function getDailyPreview(data) {
  if (data.dailyReview?.mostImportantThing) return data.dailyReview.mostImportantThing;
  if (data.dailyReview?.reflection) return data.dailyReview.reflection;

  const firstRecord = Array.isArray(data.records) ? data.records[0] : null;
  if (firstRecord) {
    return firstRecord.summary || firstRecord.raw || firstRecord.content || '';
  }

  return data.achievements && data.achievements.length > 0
    ? data.achievements[0]
    : '';
}

function getDailyTags(data) {
  if (Array.isArray(data.records)) {
    const tags = new Set();
    if (data.dailyReview) tags.add('每日综合记录');
    data.records.forEach(record => {
      if (record.domain) tags.add(getDomainLabel(record.domain));
      (record.tags || []).forEach(tag => tags.add(tag));
    });
    return Array.from(tags);
  }

  return data.tags || [];
}

function getDomainLabel(domain) {
  const labels = {
    work: '主业',
    side_business: '副业',
    life: '生活',
    content: '内容'
  };
  return labels[domain] || domain || '未分类';
}

function getTypeLabel(type) {
  const labels = {
    emotion: '情绪',
    task: '任务',
    note: '笔记',
    review: '复盘',
    idea: '灵感',
    diary: '日记',
    health: '健康',
    followup: '行动'
  };
  return labels[type] || type || '记录';
}

/**
 * Escape HTML to prevent XSS
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Create skeleton card for loading state
 * @returns {HTMLElement}
 */
export function createSkeletonCard() {
  const card = document.createElement('div');
  card.className = 'skeleton-card skeleton';
  return card;
}

/**
 * Create aggregation card (for weekly/monthly/yearly views)
 * @param {Object} data
 * @returns {HTMLElement}
 */
export function createAggregationCard(data) {
  const card = document.createElement('article');
  card.className = 'aggregation-card';

  const title = data.title || data.monthName || data.year || '';
  const stats = data.stats || {};

  card.innerHTML = `
    <div class="aggregation-card-header">
      <div class="aggregation-card-title">${escapeHtml(title)}</div>
    </div>
    <div class="aggregation-card-stats">
      ${stats.achievements ? `<span class="aggregation-card-stat">✅ ${stats.achievements}</span>` : ''}
      ${stats.discussions ? `<span class="aggregation-card-stat">💬 ${stats.discussions}</span>` : ''}
      ${stats.projects ? `<span class="aggregation-card-stat">📁 ${stats.projects}</span>` : ''}
    </div>
    <div class="aggregation-card-tags">
      ${(data.topTags || []).slice(0, 3).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}
    </div>
  `;

  return card;
}

/**
 * Create a weekly aggregation card
 * @param {Object} data
 * @returns {HTMLElement}
 */
export function createWeekCard(data, options = {}) {
  const card = createAggregationCard({
    title: `${data.year || ''} ${data.week || ''}`.trim(),
    stats: {
      achievements: data.totalAchievements || 0,
      discussions: data.totalDiscussions || 0,
      projects: (data.topProjects || []).length
    },
    topTags: data.topTags || []
  });

  card.classList.add('week-card');
  card.dataset.week = `${data.year || ''}-${data.week || ''}`;
  card.dataset.periodKey = data.key || '';

  const header = card.querySelector('.aggregation-card-header');
  if (header && data.dateRange) {
    const range = document.createElement('div');
    range.className = 'week-card-range';
    range.textContent = data.dateRange;
    header.appendChild(range);
  }

  const details = document.createElement('div');
  details.className = 'week-card-details';
  details.innerHTML = `
    <div class="week-card-days">${data.reviewDays || data.days || 0}/7 天复盘 · ${data.closureRate || 0}% 闭环 · ${data.overdueFollowups || 0} 个超时</div>
    <div class="week-card-content">${data.contentPublished || 0} 篇内容发布 · 能量 ${data.averageEnergy == null ? '--' : data.averageEnergy}</div>
    ${buildProjectListHTML(data.topProjects)}
  `;
  card.appendChild(details);
  appendPeriodReviewDigest(card, {
    type: options.periodType,
    label: options.periodLabel,
    periodKey: data.key,
    review: options.review
  });

  return card;
}

/**
 * Create a monthly aggregation card
 * @param {Object} data
 * @returns {HTMLElement}
 */
export function createMonthCard(data, options = {}) {
  const card = createAggregationCard({
    title: data.monthName || `${data.year}-${data.month}`,
    stats: {
      achievements: data.totalAchievements || 0,
      discussions: data.totalDiscussions || 0,
      projects: (data.topProjects || []).length
    },
    topTags: data.topTags || []
  });

  card.classList.add('month-card');
  card.dataset.month = `${data.year || ''}-${data.month || ''}`;
  card.dataset.periodKey = data.key || `${data.year || ''}-${data.month || ''}`;

  const header = card.querySelector('.aggregation-card-header');
  if (header && data.year) {
    const year = document.createElement('div');
    year.className = 'month-card-year';
    year.textContent = data.year;
    header.appendChild(year);
  }

  const details = document.createElement('div');
  details.className = 'month-card-details';
  details.innerHTML = `
    <div>${data.reviewDays || 0} 天复盘 · ${data.closureRate || 0}% 闭环 · ${data.overdueFollowups || 0} 个超时</div>
    <div>${(data.weeks || []).length} 个周 · ${data.contentPublished || 0} 篇内容发布 · 能量 ${data.averageEnergy == null ? '--' : data.averageEnergy}</div>
    ${buildProjectListHTML(data.topProjects)}
  `;
  card.appendChild(details);
  appendPeriodReviewDigest(card, {
    type: options.periodType,
    label: options.periodLabel,
    periodKey: data.key || `${data.year || ''}-${data.month || ''}`,
    review: options.review
  });

  return card;
}

/**
 * Create a yearly hero card
 * @param {Object} data
 * @returns {HTMLElement}
 */
export function createYearHeroCard(data, options = {}) {
  const card = document.createElement('article');
  card.className = 'year-hero-card';
  card.dataset.year = data.year;
  card.dataset.periodKey = String(data.year || '');

  card.innerHTML = `
    <div class="year-hero-header">
      <h2 class="year-hero-title">${escapeHtml(String(data.year || ''))}</h2>
      <div class="year-hero-subtitle">${(data.months || []).length} 个月度复盘</div>
    </div>
    <div class="year-hero-stats">
      ${buildYearStatHTML(data.reviewDays || 0, '复盘天数')}
      ${buildYearStatHTML(data.totalAchievements || 0, '成就')}
      ${buildYearStatHTML(data.totalProjects || 0, '项目')}
      ${buildYearStatHTML(`${data.closureRate || 0}%`, '闭环率')}
      ${buildYearStatHTML(data.totalContentPublished || 0, '内容')}
    </div>
    <p class="year-hero-summary">${escapeHtml(data.insight?.headline || '')}</p>
    ${buildPeriodReviewDigestHTML({
      type: options.periodType,
      label: options.periodLabel,
      periodKey: String(data.year || ''),
      review: options.review
    })}
    <div class="year-hero-tags">
      <div class="year-hero-tags-label">年度高频标签</div>
      <div class="year-hero-tags-list">
        ${(data.topTags || []).map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}
      </div>
    </div>
  `;

  return card;
}

function appendPeriodReviewDigest(card, options) {
  const html = buildPeriodReviewDigestHTML(options);
  if (!html) return;
  card.insertAdjacentHTML('beforeend', html);
}

function buildPeriodReviewDigestHTML({ type, label, periodKey, review } = {}) {
  if (!type || !periodKey) return '';

  const status = review?.status || 'missing';
  const statusText = status === 'confirmed' ? '已确认' : status === 'draft' ? '草稿' : '未复盘';
  const theme = review?.theme || '这一周期还没有确认复盘';
  const summary = review?.summary || '补一段判断，让这组数据变成下一步行动。';
  const updated = review?.updatedAt ? formatShortTime(review.updatedAt) : '';

  return `
    <div class="period-review-digest ${review ? 'has-review' : ''}" data-period-review-card data-period-type="${escapeAttr(type)}" data-period-key="${escapeAttr(periodKey)}">
      <div class="period-review-digest-topline">
        <span class="period-review-digest-status ${escapeAttr(status)}" data-period-review-card-status>${escapeHtml(statusText)}</span>
        <span data-period-review-card-updated>${escapeHtml(updated)}</span>
      </div>
      <h3 data-period-review-card-theme>${escapeHtml(theme)}</h3>
      <p data-period-review-card-summary>${escapeHtml(summary)}</p>
      <button class="filter-tab period-review-card-action" type="button" data-period-review-edit="${escapeAttr(periodKey)}" data-period-type="${escapeAttr(type)}" data-period-label="${escapeAttr(label || '')}">查看/编辑复盘</button>
    </div>
  `;
}

function buildProjectListHTML(projects = []) {
  if (!projects.length) return '';

  return `
    <div class="aggregation-card-tags">
      ${projects.slice(0, 4).map(project => `<span class="tag">${escapeHtml(project)}</span>`).join('')}
    </div>
  `;
}

function buildYearStatHTML(value, label) {
  return `
    <div class="year-stat">
      <div class="year-stat-value">${escapeHtml(String(value))}</div>
      <div class="year-stat-label">${escapeHtml(label)}</div>
    </div>
  `;
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

function escapeAttr(value) {
  return escapeHtml(value).replace(/"/g, '&quot;');
}
