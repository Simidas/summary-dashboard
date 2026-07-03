/* ========================================
   Yearly View
   ======================================== */

import { getAvailableYears, loadYearlySummary } from '../data.js?v=20260703c';
import { getAnalysisSnapshot, getContentItems, getDailyReviews, getFollowups, getPeriodReviews, getProjects, getRecords } from '../api.js?v=20260703c';
import { getAuthState, isApiEnabled } from '../auth.js?v=20260703c';
import { buildYearlySummaries } from '../aggregations.js?v=20260703c';
import { createYearHeroCard } from '../components/card.js?v=20260703c';
import { createGiscusToggle } from '../components/giscus.js?v=20260703c';
import { bindPeriodReviewForms, buildPeriodReviewPanel } from '../components/period-review.js?v=20260703c';
import { createPeriodInsightPanel } from '../components/period-insight.js?v=20260703c';
import { bindAnalysisPanel, buildAnalysisPanel } from '../components/analysis-panel.js?v=20260703c';

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

  // Create year hero cards
  yearsData.forEach(({ year, data }, index) => {
    const heroCard = createYearHeroCard(data, useOwnerApi ? {
      periodType: 'yearly',
      periodLabel: '年',
      review: reviewMap.get(year)
    } : {});
    heroCard.classList.add('animate-fade-in-up');
    heroCard.style.animationDelay = `${index * 100}ms`;
    page.appendChild(heroCard);
  });

  // Giscus section
  page.appendChild(createGiscusSection('yearly-overview'));

  container.innerHTML = '';
  container.appendChild(page);
  bindPeriodReviewForms(page);
  bindAnalysisPanel(page);
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
