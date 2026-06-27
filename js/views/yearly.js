/* ========================================
   Yearly View
   ======================================== */

import { getAvailableYears, loadYearlySummary } from '../data.js?v=20260626p';
import { getContentItems, getDailyReviews, getProjects, getRecords } from '../api.js?v=20260626p';
import { getAuthState, isApiEnabled } from '../auth.js?v=20260626p';
import { buildYearlySummaries } from '../aggregations.js?v=20260626p';
import { createYearHeroCard } from '../components/card.js?v=20260626p';
import { createGiscusToggle } from '../components/giscus.js?v=20260626p';
import { bindPeriodReviewForms, buildPeriodReviewPanel } from '../components/period-review.js?v=20260626p';

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

  if (useOwnerApi) {
    const [recordsData, reviewsData, projectsData, contentData] = await Promise.all([
      getRecords({ limit: 500 }).catch(() => null),
      getDailyReviews({ limit: 500 }).catch(() => null),
      getProjects().catch(() => null),
      getContentItems({ limit: 100 }).catch(() => null)
    ]);
    yearsData = buildYearlySummaries({
      records: recordsData?.records || [],
      dailyReviews: reviewsData?.reviews || [],
      projects: projectsData?.projects || [],
      contentItems: contentData?.items || []
    }).map(data => ({ year: String(data.year), data }));
  } else {
    const availableYears = await getAvailableYears();
    const sortedYears = [...availableYears].sort().reverse();
    yearsData = (await Promise.all(sortedYears.map(async year => {
      const data = await loadYearlySummary(year);
      return data ? { year, data } : null;
    }))).filter(Boolean);
  }

  const reviewYear = yearsData[0]?.year || String(new Date().getFullYear());
  
  if (yearsData.length === 0) {
    const reviewPanel = await buildPeriodReviewPanel('yearly', reviewYear, '年');
    page.innerHTML = `
      <div class="view-header animate-fade-in-up">
        <h1 class="view-title">Yearly</h1>
        <p class="view-subtitle">按年聚合的复盘数据</p>
      </div>
      ${reviewPanel}
      <div class="empty-state">
        <div class="empty-state-icon">□</div>
        <p class="empty-state-text">年数据正在整理中...</p>
      </div>
    `;
    bindPeriodReviewForms(page);
    return;
  }

  // Remove skeleton
  const oldHero = page.querySelector('.year-hero');
  const oldGrid = page.querySelector('.aggregation-grid');
  if (oldHero) oldHero.remove();
  if (oldGrid) oldGrid.remove();

  // Build header
  const header = page.querySelector('.view-header');
  const reviewPanel = await buildPeriodReviewPanel('yearly', reviewYear, '年');
  if (reviewPanel) page.insertAdjacentHTML('beforeend', reviewPanel);

  // Create year hero cards
  yearsData.forEach(({ year, data }, index) => {
    const heroCard = createYearHeroCard(data);
    heroCard.classList.add('animate-fade-in-up');
    heroCard.style.animationDelay = `${index * 100}ms`;
    page.appendChild(heroCard);
  });

  // Giscus section
  page.appendChild(createGiscusSection('yearly-overview'));

  container.innerHTML = '';
  container.appendChild(page);
  bindPeriodReviewForms(page);
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
