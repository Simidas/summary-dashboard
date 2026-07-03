/* ========================================
   Monthly View
   ======================================== */

import { getAvailableMonths, loadMonthlySummary } from '../data.js?v=20260703g';
import { getAnalysisSnapshot, getContentItems, getDailyReviews, getFollowups, getPeriodReviews, getRecords } from '../api.js?v=20260703g';
import { getAuthState, isApiEnabled } from '../auth.js?v=20260703g';
import { buildMonthlySummaries } from '../aggregations.js?v=20260703g';
import { createMonthCard } from '../components/card.js?v=20260703g';
import { createGiscusToggle } from '../components/giscus.js?v=20260703g';
import { bindPeriodReviewForms, buildPeriodReviewPanel } from '../components/period-review.js?v=20260703g';
import { createPeriodInsightPanel } from '../components/period-insight.js?v=20260703g';
import { bindAnalysisPanel, buildAnalysisPanel } from '../components/analysis-panel.js?v=20260703g';

const MONTH_DISPLAY_COUNT = 12;
const MONTH_HISTORY_PAGE_SIZE = 6;
const MONTH_NAMES = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];

let monthCards = [];

/**
 * Render monthly view
 * @param {HTMLElement} container
 * @param {Object} params
 */
export async function renderMonthlyView(container, params = {}) {
  container.innerHTML = '';

  // Loading skeleton
  const page = document.createElement('div');
  page.className = 'page operations-page';
  page.innerHTML = `
    <div class="view-header animate-fade-in-up">
      <h1 class="view-title">Monthly</h1>
      <p class="view-subtitle">按月聚合的复盘数据</p>
    </div>
    <div class="monthly-chart" style="margin-bottom: var(--space-6);">
      <div class="chart-placeholder" style="height: 120px; display: flex; align-items: flex-end; gap: 8px; padding: var(--space-3); background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md);">
        ${Array(6).fill('<div class="skeleton" style="flex: 1; height: 60%;"></div>').join('')}
      </div>
    </div>
    <div class="aggregation-grid">
      ${Array(4).fill('<div class="skeleton" style="height: 140px;"></div>').join('')}
    </div>
  `;
  container.appendChild(page);

  // Load data
  const authState = getAuthState();
  const useOwnerApi = isApiEnabled() && authState.user?.role === 'owner';
  let monthlyDataList = [];
  let monthlyChartList = [];
  let periodReviews = [];

  if (useOwnerApi) {
    const [recordsData, reviewsData, followupsData, contentData, periodReviewsData] = await Promise.all([
      getRecords({ limit: 500 }).catch(() => null),
      getDailyReviews({ limit: 500 }).catch(() => null),
      getFollowups({ status: 'all', limit: 200 }).catch(() => null),
      getContentItems({ limit: 100 }).catch(() => null),
      getPeriodReviews({ type: 'monthly', limit: 50 }).catch(() => null)
    ]);
    const monthlySummaries = buildMonthlySummaries({
      records: recordsData?.records || [],
      dailyReviews: reviewsData?.reviews || [],
      followups: followupsData?.followups || [],
      contentItems: contentData?.items || []
    });
    periodReviews = periodReviewsData?.reviews || [];
    monthlyChartList = monthlySummaries.slice(0, MONTH_DISPLAY_COUNT);
    monthlyDataList = mergeMonthlySummariesWithReviews(monthlySummaries, periodReviews);
  } else {
    const availableMonths = await getAvailableMonths();
    const recentMonths = availableMonths.slice(-MONTH_DISPLAY_COUNT).reverse();
    monthlyDataList = (await Promise.all(recentMonths.map(month => loadMonthlySummary(month))))
      .filter(Boolean);
    monthlyChartList = monthlyDataList;
  }

  const reviewMonth = monthlyDataList[0]?.key || new Date().toISOString().slice(0, 7);
  const reviewMap = createReviewMap(periodReviews);
  const periodAnalysisData = useOwnerApi
    ? await getAnalysisSnapshot('monthly', reviewMonth).catch(() => null)
    : null;
  
  if (monthlyDataList.length === 0) {
    const reviewPanel = await buildPeriodReviewPanel('monthly', reviewMonth, '月');
    page.innerHTML = `
      <div class="view-header animate-fade-in-up">
        <h1 class="view-title">Monthly</h1>
        <p class="view-subtitle">按月聚合的复盘数据</p>
      </div>
      ${buildPeriodAnalysisPanel(useOwnerApi, 'monthly', reviewMonth, periodAnalysisData?.analysis)}
      ${reviewPanel}
      <div class="empty-state">
        <div class="empty-state-icon">□</div>
        <p class="empty-state-text">月数据正在整理中...</p>
      </div>
    `;
    bindPeriodReviewForms(page);
    bindAnalysisPanel(page);
    return;
  }

  // Collect data for chart
  const chartData = monthlyChartList.map(data => ({
    month: data.key || `${data.year}-${data.month}`,
    monthName: data.monthName,
    totalAchievements: data.totalAchievements || 0
  }));

  // Find max for scaling
  const maxAchievements = Math.max(...chartData.map(d => d.totalAchievements), 1);

  // Remove skeleton
  const oldGrid = page.querySelector('.aggregation-grid');
  const oldChart = page.querySelector('.monthly-chart');
  if (oldGrid) oldGrid.remove();
  if (oldChart) oldChart.remove();

  // Build header
  const header = page.querySelector('.view-header');

  // Create chart section
  const chartSection = document.createElement('div');
  chartSection.className = 'monthly-chart-section animate-fade-in-up';
  chartSection.innerHTML = `
    <h2 class="section-title">📊 月度成就趋势</h2>
    <div class="monthly-bar-chart" style="display: flex; align-items: flex-end; gap: 12px; height: 140px; padding: var(--space-3); background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); margin-top: var(--space-3);">
      ${chartData.map(d => {
        const height = Math.max((d.totalAchievements / maxAchievements) * 100, 5);
        return `
          <div class="bar-container" style="flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px;">
            <div class="bar" style="width: 100%; height: ${height}%; background: var(--accent); border-radius: var(--radius-sm) var(--radius-sm) 0 0; min-height: 4px;" title="${d.totalAchievements} 个成就"></div>
            <div class="bar-label" style="font-size: 0.6875rem; color: var(--text-secondary);">${d.monthName.replace('月', '')}</div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  if (monthlyDataList[0]?.insight) {
    page.appendChild(createPeriodInsightPanel(monthlyDataList[0].insight, '本月经营洞察'));
  }

  if (useOwnerApi) {
    page.insertAdjacentHTML('beforeend', buildPeriodAnalysisPanel(true, 'monthly', reviewMonth, periodAnalysisData?.analysis));
  }

  const reviewPanel = await buildPeriodReviewPanel('monthly', reviewMonth, '月');
  if (reviewPanel) page.insertAdjacentHTML('beforeend', reviewPanel);

  page.appendChild(chartSection);

  const historyHeading = document.createElement('div');
  historyHeading.className = 'section-heading period-history-heading';
  historyHeading.innerHTML = `
    <h2 class="section-title">月度复盘与趋势</h2>
    <span class="panel-date">最近数据 + 已保存复盘 · ${monthlyDataList.length} 个月</span>
  `;
  page.appendChild(historyHeading);

  const historyList = document.createElement('div');
  historyList.id = 'monthly-history-list';
  renderMonthlyHistoryPage(historyList, monthlyDataList, reviewMap, useOwnerApi);
  historyList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-month-history-page]');
    if (!button) return;
    renderMonthlyHistoryPage(historyList, monthlyDataList, reviewMap, useOwnerApi, Number(button.dataset.monthHistoryPage || 1));
  });
  page.appendChild(historyList);
  
  // Giscus section
  page.appendChild(createGiscusSection('monthly-overview'));

  container.innerHTML = '';
  container.appendChild(page);
  bindPeriodReviewForms(page);
  bindAnalysisPanel(page);
}

function renderMonthlyHistoryPage(container, monthlyDataList, reviewMap, useOwnerApi, pageNumber = 1) {
  const total = monthlyDataList.length;
  const totalPages = Math.max(1, Math.ceil(total / MONTH_HISTORY_PAGE_SIZE));
  const currentPage = Math.min(Math.max(Number(pageNumber) || 1, 1), totalPages);
  const start = (currentPage - 1) * MONTH_HISTORY_PAGE_SIZE;
  const pageMonths = monthlyDataList.slice(start, start + MONTH_HISTORY_PAGE_SIZE);
  const grid = document.createElement('div');
  grid.className = 'aggregation-grid';
  grid.style.marginTop = 'var(--space-4)';

  monthCards = [];
  pageMonths.forEach((monthData, index) => {
    const monthKey = monthData.key || `${monthData.year}-${monthData.month}`;
    const card = createMonthCard(monthData, useOwnerApi ? {
      periodType: 'monthly',
      periodLabel: '月',
      review: reviewMap.get(monthKey)
    } : {});
    card.classList.add('animate-fade-in-up');
    card.style.animationDelay = `${index * 60}ms`;
    grid.appendChild(card);
    monthCards.push({ card, monthData, monthStr: monthKey });
  });

  container.innerHTML = `
    ${total ? `<div class="panel-date period-history-count">共 ${total} 个月 · 第 ${currentPage}/${totalPages} 页</div>` : ''}
  `;
  container.appendChild(grid);
  if (total > MONTH_HISTORY_PAGE_SIZE) {
    container.insertAdjacentHTML('beforeend', buildMonthlyHistoryPagination(currentPage, totalPages));
  }
}

function buildMonthlyHistoryPagination(currentPage, totalPages) {
  return `
    <div class="record-pagination" aria-label="月度历史分页">
      <button type="button" data-month-history-page="${currentPage - 1}" ${currentPage <= 1 ? 'disabled' : ''}>上一页</button>
      <span>${currentPage} / ${totalPages}</span>
      <button type="button" data-month-history-page="${currentPage + 1}" ${currentPage >= totalPages ? 'disabled' : ''}>下一页</button>
    </div>
  `;
}

/**
 * Create giscus section for monthly view
 * @param {string} topic
 * @returns {HTMLElement}
 */
function createGiscusSection(topic) {
  const section = document.createElement('div');
  section.className = 'giscus-section';
  section.innerHTML = `
    <div class="giscus-header">
      <h3 class="giscus-title">来聊聊 Monthly 视图</h3>
    </div>
    <div class="giscus-container" id="giscus-monthly"></div>
  `;

  const toggle = createGiscusToggle('giscus-monthly', '展开评论区');
  section.querySelector('.giscus-header').appendChild(toggle);
  return section;
}

function createMonthlyInsight(monthData) {
  const section = document.createElement('section');
  section.className = 'ops-panel monthly-insight animate-fade-in-up';
  section.innerHTML = `
    <div class="section-heading">
      <h2 class="section-title">${escapeHtml(monthData.monthName)}策略复盘</h2>
      <span class="panel-date">${escapeHtml(`${monthData.year}-${monthData.month}`)}</span>
    </div>
    <p class="panel-lead">${escapeHtml(monthData.modeSummary || '')}</p>
    <div class="insight-grid">
      ${buildInsightColumn('场景投入', (monthData.domainDistribution || []).map(item => `${item.label}: ${item.count}`))}
      ${buildInsightColumn('重复问题', monthData.repeatedBlockers || [])}
      ${buildInsightColumn('下月策略', monthData.nextMonthStrategy || [])}
    </div>
  `;
  return section;
}

function buildInsightColumn(title, items = []) {
  const list = items.length ? items : ['暂无记录'];
  return `
    <div class="insight-column">
      <h3>${escapeHtml(title)}</h3>
      <ul class="plain-list">
        ${list.slice(0, 5).map(item => `<li>${escapeHtml(item)}</li>`).join('')}
      </ul>
    </div>
  `;
}

function mergeMonthlySummariesWithReviews(summaries = [], reviews = []) {
  const rows = new Map();
  summaries.forEach(summary => rows.set(summary.key, summary));
  reviews.forEach(review => {
    if (!rows.has(review.periodKey)) rows.set(review.periodKey, createMonthlyReviewPlaceholder(review));
  });
  return Array.from(rows.values()).sort((left, right) => String(right.key).localeCompare(String(left.key)));
}

function createMonthlyReviewPlaceholder(review) {
  const [yearText, monthText] = String(review.periodKey || '').split('-');
  const month = Number(monthText);
  return {
    key: review.periodKey,
    year: Number(yearText) || '',
    month: monthText || '',
    monthName: MONTH_NAMES[month - 1] || review.periodKey,
    reviewDays: 0,
    closureRate: 0,
    overdueFollowups: 0,
    weeks: [],
    contentPublished: 0,
    averageEnergy: null,
    totalAchievements: 0,
    totalDiscussions: 0,
    topProjects: [],
    topTags: []
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
    title: 'AI 月度趋势分析',
    generateLabel: '生成/刷新月分析',
    emptyText: '基于这个月的记录、每日复盘、待办和内容素材，生成主线、趋势、长期未闭环和下月策略。'
  });
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value == null ? '' : String(value);
  return div.innerHTML;
}
