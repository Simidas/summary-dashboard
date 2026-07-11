/* ========================================
   Weekly View
   ======================================== */

import { getAvailableWeeks, loadWeeklyInsight, loadWeeklySummary } from '../data.js?v=20260711a';
import { getAnalysisSnapshot, getClosureMetrics, getContentItems, getDailyReviews, getFollowups, getPeriodReviews, getRecords } from '../api.js?v=20260711a';
import { getAuthState, isApiEnabled } from '../auth.js?v=20260711a';
import { buildWeeklyInsight, buildWeeklySummaries } from '../aggregations.js?v=20260711a';
import { createWeekCard } from '../components/card.js?v=20260711a';
import { createGiscusToggle } from '../components/giscus.js?v=20260711a';
import { bindPeriodReviewForms, buildPeriodReviewPanel } from '../components/period-review.js?v=20260711a';
import { createPeriodInsightPanel } from '../components/period-insight.js?v=20260711a';
import { bindAnalysisPanel, buildAnalysisPanel } from '../components/analysis-panel.js?v=20260711a';

const WEEK_DISPLAY_COUNT = 8;
const WEEK_HISTORY_PAGE_SIZE = 6;

let weekCards = [];

/**
 * Render weekly view
 * @param {HTMLElement} container
 * @param {Object} params
 */
export async function renderWeeklyView(container, params = {}) {
  container.innerHTML = '';

  // Loading skeleton
  const page = document.createElement('div');
  page.className = 'page operations-page';
  page.innerHTML = `
    <div class="view-header animate-fade-in-up">
      <h1 class="view-title">Weekly</h1>
      <p class="view-subtitle">按周聚合的复盘数据</p>
    </div>
    <div class="aggregation-grid">
      ${Array(4).fill('<div class="skeleton" style="height: 140px;"></div>').join('')}
    </div>
  `;
  container.appendChild(page);

  // Load data
  const authState = getAuthState();
  const useOwnerApi = isApiEnabled() && authState.user?.role === 'owner';
  let recentWeekSummaries = [];
  let latestInsight = null;
  let periodReviews = [];

  if (useOwnerApi) {
    const [recordsData, reviewsData, followupsData, contentData, periodReviewsData] = await Promise.all([
      getRecords({ limit: 500 }).catch(() => null),
      getDailyReviews({ limit: 500 }).catch(() => null),
      getFollowups({ status: 'all', limit: 200 }).catch(() => null),
      getContentItems({ limit: 100 }).catch(() => null),
      getPeriodReviews({ type: 'weekly', limit: 50 }).catch(() => null)
    ]);
    const records = recordsData?.records || [];
    const dailyReviews = reviewsData?.reviews || [];
    const followups = followupsData?.followups || [];
    const weeklySummaries = buildWeeklySummaries({
      records,
      dailyReviews,
      followups,
      contentItems: contentData?.items || []
    });
    periodReviews = periodReviewsData?.reviews || [];
    recentWeekSummaries = mergeWeeklySummariesWithReviews(weeklySummaries, periodReviews);
    latestInsight = buildWeeklyInsight(weeklySummaries[0], records, dailyReviews, followups);
  } else {
    const availableWeeks = await getAvailableWeeks();
    const recentWeeks = availableWeeks.slice(-WEEK_DISPLAY_COUNT).reverse();
    recentWeekSummaries = (await Promise.all(recentWeeks.map(week => loadWeeklySummary(week))))
      .filter(Boolean);
    latestInsight = await loadWeeklyInsight(recentWeeks[0]);
  }

  const reviewWeek = recentWeekSummaries[0]?.key || getCurrentWeekKey();
  const reviewMap = createReviewMap(periodReviews);
  const [periodAnalysisData, closureMetricsData] = useOwnerApi
    ? await Promise.all([
      getAnalysisSnapshot('weekly', reviewWeek).catch(() => null),
      getClosureMetrics('weekly', reviewWeek).catch(() => null)
    ])
    : [null, null];

  if (recentWeekSummaries.length === 0) {
    const reviewPanel = await buildPeriodReviewPanel('weekly', reviewWeek, '周');
    page.innerHTML = `
      <div class="view-header animate-fade-in-up">
        <h1 class="view-title">Weekly</h1>
        <p class="view-subtitle">按周聚合的复盘数据</p>
      </div>
      ${buildClosureMetricsPanel(closureMetricsData?.metrics)}
      ${buildPeriodAnalysisPanel(useOwnerApi, 'weekly', reviewWeek, periodAnalysisData?.analysis)}
      ${reviewPanel}
      <div class="empty-state">
        <div class="empty-state-icon">□</div>
        <p class="empty-state-text">周数据正在整理中...</p>
      </div>
    `;
    bindPeriodReviewForms(page);
    bindAnalysisPanel(page);
    return;
  }

  // Remove skeleton
  const skeleton = page.querySelector('.aggregation-grid');
  if (skeleton) skeleton.remove();

  if (latestInsight) {
    page.appendChild(createPeriodInsightPanel(latestInsight, '本周经营洞察'));
  }

  if (closureMetricsData?.metrics) {
    page.insertAdjacentHTML('beforeend', buildClosureMetricsPanel(closureMetricsData.metrics));
  }

  if (useOwnerApi) {
    page.insertAdjacentHTML('beforeend', buildPeriodAnalysisPanel(true, 'weekly', reviewWeek, periodAnalysisData?.analysis));
  }

  const reviewPanel = await buildPeriodReviewPanel('weekly', reviewWeek, '周');
  if (reviewPanel) page.insertAdjacentHTML('beforeend', reviewPanel);

  const historyHeading = document.createElement('div');
  historyHeading.className = 'section-heading period-history-heading';
  historyHeading.innerHTML = `
    <h2 class="section-title">周度复盘与趋势</h2>
    <span class="panel-date">最近数据 + 已保存复盘 · ${recentWeekSummaries.length} 周</span>
  `;
  page.appendChild(historyHeading);

  const historyList = document.createElement('div');
  historyList.id = 'weekly-history-list';
  renderWeeklyHistoryPage(historyList, recentWeekSummaries, reviewMap, useOwnerApi);
  historyList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-week-history-page]');
    if (!button) return;
    renderWeeklyHistoryPage(historyList, recentWeekSummaries, reviewMap, useOwnerApi, Number(button.dataset.weekHistoryPage || 1));
  });
  page.appendChild(historyList);

  // Giscus section
  page.appendChild(createGiscusSection('weekly-overview'));

  container.innerHTML = '';
  container.appendChild(page);
  bindPeriodReviewForms(page);
  bindAnalysisPanel(page);
}

function buildClosureMetricsPanel(metrics) {
  if (!metrics) return '';
  const decisions = metrics.decisions || {};
  const followups = metrics.followups || {};
  return `
    <section class="ops-panel closure-metrics-panel">
      <div class="section-heading">
        <h2 class="section-title">本周行动闭环</h2>
        <span class="panel-date">${escapeHtml(metrics.range?.start || '')} — ${escapeHtml(metrics.range?.endExclusive || '')}</span>
      </div>
      <div class="closure-metric-grid">
        ${buildClosureMetric(metrics.actionConversionRate, '记录转行动', `${metrics.recordsWithActions || 0}/${metrics.recordCount || 0} 条记录`)}
        ${buildClosureMetric(followups.closureRate, '行动闭环率', `${followups.closed || 0}/${followups.created || 0} 个行动`)}
        ${buildClosureMetric(decisions.adoptionRate, 'AI 建议采纳', `${(decisions.accepted || 0) + (decisions.modified || 0)} 次采纳`)}
        ${buildClosureMetric(followups.deferredEvents || 0, '延期次数', `${followups.decidedNotDone || 0} 项主动取舍`, false)}
      </div>
      ${metrics.evidence?.length ? `
        <div class="closure-evidence-list">
          ${metrics.evidence.slice(0, 5).map(item => `
            <div><strong>${escapeHtml(item.text)}</strong><span>${escapeHtml(formatOutcome(item))}</span></div>
          `).join('')}
        </div>
      ` : '<div class="empty-inline">本周还没有行动闭环数据。</div>'}
    </section>
  `;
}

function buildClosureMetric(value, label, detail, percent = true) {
  return `<div><strong>${Number(value || 0)}${percent ? '%' : ''}</strong><span>${label}</span><small>${escapeHtml(detail)}</small></div>`;
}

function formatOutcome(item) {
  if (item.outcomeType === 'completed') return '已完成';
  if (item.outcomeType === 'partial') return '部分完成';
  if (item.outcomeType) return '已做出取舍';
  if (item.deferCount) return `已延期 ${item.deferCount} 次`;
  return item.status || '待处理';
}

function renderWeeklyHistoryPage(container, weeklySummaries, reviewMap, useOwnerApi, pageNumber = 1) {
  const total = weeklySummaries.length;
  const totalPages = Math.max(1, Math.ceil(total / WEEK_HISTORY_PAGE_SIZE));
  const currentPage = Math.min(Math.max(Number(pageNumber) || 1, 1), totalPages);
  const start = (currentPage - 1) * WEEK_HISTORY_PAGE_SIZE;
  const pageSummaries = weeklySummaries.slice(start, start + WEEK_HISTORY_PAGE_SIZE);
  const grid = document.createElement('div');
  grid.className = 'aggregation-grid';

  weekCards = [];
  pageSummaries.forEach((weekData, index) => {
    const card = createWeekCard(weekData, useOwnerApi ? {
      periodType: 'weekly',
      periodLabel: '周',
      review: reviewMap.get(weekData.key)
    } : {});
    card.classList.add('animate-fade-in-up');
    card.style.animationDelay = `${index * 80}ms`;
    grid.appendChild(card);
    weekCards.push({ card, weekData, weekStr: weekData.key });
  });

  container.innerHTML = `
    ${total ? `<div class="panel-date period-history-count">共 ${total} 周 · 第 ${currentPage}/${totalPages} 页</div>` : ''}
  `;
  container.appendChild(grid);
  if (total > WEEK_HISTORY_PAGE_SIZE) {
    container.insertAdjacentHTML('beforeend', buildWeeklyHistoryPagination(currentPage, totalPages));
  }
}

function buildWeeklyHistoryPagination(currentPage, totalPages) {
  return `
    <div class="record-pagination" aria-label="周度历史分页">
      <button type="button" data-week-history-page="${currentPage - 1}" ${currentPage <= 1 ? 'disabled' : ''}>上一页</button>
      <span>${currentPage} / ${totalPages}</span>
      <button type="button" data-week-history-page="${currentPage + 1}" ${currentPage >= totalPages ? 'disabled' : ''}>下一页</button>
    </div>
  `;
}

/**
 * Create giscus section for weekly view
 * @param {string} topic
 * @returns {HTMLElement}
 */
function createGiscusSection(topic) {
  const section = document.createElement('div');
  section.className = 'giscus-section';
  section.innerHTML = `
    <div class="giscus-header">
      <h3 class="giscus-title">来聊聊 Weekly 视图</h3>
    </div>
    <div class="giscus-container" id="giscus-weekly"></div>
  `;

  const toggle = createGiscusToggle('giscus-weekly', '展开评论区');
  section.querySelector('.giscus-header').appendChild(toggle);
  return section;
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value == null ? '' : String(value);
  return div.innerHTML;
}

function getCurrentWeekKey() {
  const date = new Date();
  const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((utcDate - yearStart) / 86400000) + 1) / 7);
  return `${utcDate.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function mergeWeeklySummariesWithReviews(summaries = [], reviews = []) {
  const rows = new Map();
  summaries.forEach(summary => rows.set(summary.key, summary));
  reviews.forEach(review => {
    if (!rows.has(review.periodKey)) rows.set(review.periodKey, createWeeklyReviewPlaceholder(review));
  });
  return Array.from(rows.values()).sort((left, right) => String(right.key).localeCompare(String(left.key)));
}

function createWeeklyReviewPlaceholder(review) {
  const [yearText, weekText] = String(review.periodKey || '').split('-');
  return {
    key: review.periodKey,
    year: Number(yearText) || '',
    week: weekText || '',
    dateRange: '',
    days: 0,
    reviewDays: 0,
    closureRate: 0,
    overdueFollowups: 0,
    contentPublished: 0,
    averageEnergy: null,
    totalAchievements: 0,
    totalDiscussions: 0,
    topProjects: [],
    topTags: [],
    dailyRecords: []
  };
}

function createReviewMap(reviews = []) {
  return new Map(reviews.map(review => [review.periodKey, review]));
}

function buildPeriodAnalysisPanel(enabled, scopeType, scopeKey, analysis) {
  if (!enabled) return '';
  return buildAnalysisPanel({
    scopeType,
    scopeKey,
    analysis,
    title: 'AI 周度节奏分析',
    generateLabel: '生成/刷新周分析',
    emptyText: '基于这一周的记录、每日复盘、待办和内容素材，生成节奏、趋势、长期未闭环和下周重点。'
  });
}
