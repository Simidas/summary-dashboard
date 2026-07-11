/* ========================================
   Yearly View
   ======================================== */

import { getAvailableYears, loadYearlySummary } from '../data.js?v=20260711a';
import { getAnalysisSnapshot, getContentItems, getDailyReviews, getFollowups, getPeriodReviews, getProjects, getRecords } from '../api.js?v=20260711a';
import { getAuthState, isApiEnabled } from '../auth.js?v=20260711a';
import { buildYearlySummaries } from '../aggregations.js?v=20260711a';
import { createYearHeroCard } from '../components/card.js?v=20260711a';
import { createGiscusToggle } from '../components/giscus.js?v=20260711a';
import { bindPeriodReviewForms, buildPeriodReviewPanel } from '../components/period-review.js?v=20260711a';
import { createPeriodInsightPanel } from '../components/period-insight.js?v=20260711a';
import { bindAnalysisPanel, buildAnalysisPanel } from '../components/analysis-panel.js?v=20260711a';

const YEAR_HISTORY_PAGE_SIZE = 4;

let yearCards = [];

/**
 * Render yearly view
 * @param {HTMLElement} container
 * @param {Object} params
 */
export async function renderYearlyView(container, params = {}) {
  container.innerHTML = '';

  // Loading skeleton
  const page = document.createElement('div');
  page.className = 'page operations-page';
  page.innerHTML = `
    <div class="view-header animate-fade-in-up">
      <h1 class="view-title">Yearly</h1>
      <p class="view-subtitle">按年聚合的复盘数据</p>
    </div>
    <div class="year-hero skeleton" style="height: 200px; margin-bottom: var(--space-4);"></div>
    <div class="aggregation-grid">
      ${Array(2).fill('<div class="skeleton" style="height: 140px;"></div>').join('')}
    </div>
  `;
  container.appendChild(page);

  // Load data
  const authState = getAuthState();
  const useOwnerApi = isApiEnabled() && authState.user?.role === 'owner';
  let yearsData = [];
  let periodReviews = [];

  if (useOwnerApi) {
    const [recordsData, reviewsData, followupsData, projectsData, contentData, periodReviewsData] = await Promise.all([
      getRecords({ limit: 500 }).catch(() => null),
      getDailyReviews({ limit: 500 }).catch(() => null),
      getFollowups({ status: 'all', limit: 200 }).catch(() => null),
      getProjects({ includeClosed: true }).catch(() => null),
      getContentItems({ limit: 100 }).catch(() => null),
      getPeriodReviews({ type: 'yearly', limit: 50 }).catch(() => null)
    ]);
    const yearlySummaries = buildYearlySummaries({
      records: recordsData?.records || [],
      dailyReviews: reviewsData?.reviews || [],
      followups: followupsData?.followups || [],
      projects: projectsData?.projects || [],
      contentItems: contentData?.items || []
    }).map(data => ({ year: String(data.year), data }));
    periodReviews = periodReviewsData?.reviews || [];
    yearsData = mergeYearSummariesWithReviews(yearlySummaries, periodReviews);
  } else {
    const availableYears = await getAvailableYears();
    const sortedYears = [...availableYears].sort().reverse();
    yearsData = (await Promise.all(sortedYears.map(async year => {
      const data = await loadYearlySummary(year);
      return data ? { year, data } : null;
    }))).filter(Boolean);
  }

  const reviewYear = yearsData[0]?.year || String(new Date().getFullYear());
  const reviewMap = createReviewMap(periodReviews);
  const periodAnalysisData = useOwnerApi
    ? await getAnalysisSnapshot('yearly', reviewYear).catch(() => null)
    : null;
  
  if (yearsData.length === 0) {
    const reviewPanel = await buildPeriodReviewPanel('yearly', reviewYear, '年');
    page.innerHTML = `
      <div class="view-header animate-fade-in-up">
        <h1 class="view-title">Yearly</h1>
        <p class="view-subtitle">按年聚合的复盘数据</p>
      </div>
      ${buildPeriodAnalysisPanel(useOwnerApi, 'yearly', reviewYear, periodAnalysisData?.analysis)}
      ${reviewPanel}
      <div class="empty-state">
        <div class="empty-state-icon">□</div>
        <p class="empty-state-text">年数据正在整理中...</p>
      </div>
    `;
    bindPeriodReviewForms(page);
    bindAnalysisPanel(page);
    return;
  }

  // Remove skeleton
  const oldHero = page.querySelector('.year-hero');
  const oldGrid = page.querySelector('.aggregation-grid');
  if (oldHero) oldHero.remove();
  if (oldGrid) oldGrid.remove();

  // Build header
  const header = page.querySelector('.view-header');
  if (yearsData[0]?.data?.insight) {
    page.appendChild(createPeriodInsightPanel(yearsData[0].data.insight, '年度经营洞察'));
  }

  if (useOwnerApi) {
    page.insertAdjacentHTML('beforeend', buildPeriodAnalysisPanel(true, 'yearly', reviewYear, periodAnalysisData?.analysis));
  }

  const reviewPanel = await buildPeriodReviewPanel('yearly', reviewYear, '年');
  if (reviewPanel) page.insertAdjacentHTML('beforeend', reviewPanel);

  const historyHeading = document.createElement('div');
  historyHeading.className = 'section-heading period-history-heading';
  historyHeading.innerHTML = `
    <h2 class="section-title">年度复盘与趋势</h2>
    <span class="panel-date">年度数据 + 已保存复盘 · 共 ${yearsData.length} 年</span>
  `;
  page.appendChild(historyHeading);

  const historyList = document.createElement('div');
  historyList.id = 'yearly-history-list';
  renderYearlyHistoryPage(historyList, yearsData, reviewMap, useOwnerApi);
  historyList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-year-history-page]');
    if (!button) return;
    renderYearlyHistoryPage(historyList, yearsData, reviewMap, useOwnerApi, Number(button.dataset.yearHistoryPage || 1));
  });
  page.appendChild(historyList);

  // Giscus section
  page.appendChild(createGiscusSection('yearly-overview'));

  container.innerHTML = '';
  container.appendChild(page);
  bindPeriodReviewForms(page);
  bindAnalysisPanel(page);
}

function renderYearlyHistoryPage(container, yearsData, reviewMap, useOwnerApi, pageNumber = 1) {
  const total = yearsData.length;
  const totalPages = Math.max(1, Math.ceil(total / YEAR_HISTORY_PAGE_SIZE));
  const currentPage = Math.min(Math.max(Number(pageNumber) || 1, 1), totalPages);
  const start = (currentPage - 1) * YEAR_HISTORY_PAGE_SIZE;
  const pageYears = yearsData.slice(start, start + YEAR_HISTORY_PAGE_SIZE);

  yearCards = [];
  container.innerHTML = `
    ${total ? `<div class="panel-date period-history-count">共 ${total} 年 · 第 ${currentPage}/${totalPages} 页</div>` : ''}
  `;
  pageYears.forEach(({ year, data }, index) => {
    const heroCard = createYearHeroCard(data, useOwnerApi ? {
      periodType: 'yearly',
      periodLabel: '年',
      review: reviewMap.get(year)
    } : {});
    heroCard.classList.add('animate-fade-in-up');
    heroCard.style.animationDelay = `${index * 100}ms`;
    container.appendChild(heroCard);
    yearCards.push({ card: heroCard, year, data });
  });
  if (total > YEAR_HISTORY_PAGE_SIZE) {
    container.insertAdjacentHTML('beforeend', buildYearlyHistoryPagination(currentPage, totalPages));
  }
}

function buildYearlyHistoryPagination(currentPage, totalPages) {
  return `
    <div class="record-pagination" aria-label="年度历史分页">
      <button type="button" data-year-history-page="${currentPage - 1}" ${currentPage <= 1 ? 'disabled' : ''}>上一页</button>
      <span>${currentPage} / ${totalPages}</span>
      <button type="button" data-year-history-page="${currentPage + 1}" ${currentPage >= totalPages ? 'disabled' : ''}>下一页</button>
    </div>
  `;
}

/**
 * Create giscus section for yearly view
 * @param {string} topic
 * @returns {HTMLElement}
 */
function createGiscusSection(topic) {
  const section = document.createElement('div');
  section.className = 'giscus-section';
  section.innerHTML = `
    <div class="giscus-header">
      <h3 class="giscus-title">来聊聊 Yearly 视图</h3>
    </div>
    <div class="giscus-container" id="giscus-yearly"></div>
  `;

  const toggle = createGiscusToggle('giscus-yearly', '展开评论区');
  section.querySelector('.giscus-header').appendChild(toggle);
  return section;
}

function mergeYearSummariesWithReviews(yearsData = [], reviews = []) {
  const rows = new Map();
  yearsData.forEach(item => rows.set(item.year, item));
  reviews.forEach(review => {
    if (!rows.has(review.periodKey)) rows.set(review.periodKey, createYearReviewPlaceholder(review));
  });
  return Array.from(rows.values()).sort((left, right) => String(right.year).localeCompare(String(left.year)));
}

function createYearReviewPlaceholder(review) {
  const year = Number(review.periodKey);
  return {
    year: review.periodKey,
    data: {
      year,
      reviewDays: 0,
      totalAchievements: 0,
      totalProjects: 0,
      closureRate: 0,
      totalContentPublished: 0,
      months: [],
      topTags: [],
      insight: {
        headline: '这一年还没有统计数据，先查看已保存的年度复盘。'
      }
    }
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
    title: 'AI 年度方向分析',
    generateLabel: '生成/刷新年分析',
    emptyText: '基于这一年的记录、每日复盘、项目、待办和内容素材，生成长期变化、反复模式和下一年方向。'
  });
}
