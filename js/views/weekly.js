/* ========================================
   Weekly View
   ======================================== */

import { getAvailableWeeks, loadWeeklyInsight, loadWeeklySummary } from '../data.js?v=20260626p';
import { getContentItems, getDailyReviews, getFollowups, getRecords } from '../api.js?v=20260626p';
import { getAuthState, isApiEnabled } from '../auth.js?v=20260626p';
import { buildWeeklyInsight, buildWeeklySummaries } from '../aggregations.js?v=20260626p';
import { createWeekCard } from '../components/card.js?v=20260626p';
import { createGiscusToggle } from '../components/giscus.js?v=20260626p';
import { bindPeriodReviewForms, buildPeriodReviewPanel } from '../components/period-review.js?v=20260626p';

const WEEK_DISPLAY_COUNT = 8;

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

  if (useOwnerApi) {
    const [recordsData, reviewsData, followupsData, contentData] = await Promise.all([
      getRecords({ limit: 500 }).catch(() => null),
      getDailyReviews({ limit: 500 }).catch(() => null),
      getFollowups({ status: 'all', limit: 200 }).catch(() => null),
      getContentItems({ limit: 100 }).catch(() => null)
    ]);
    const records = recordsData?.records || [];
    const dailyReviews = reviewsData?.reviews || [];
    const followups = followupsData?.followups || [];
    recentWeekSummaries = buildWeeklySummaries({
      records,
      dailyReviews,
      followups,
      contentItems: contentData?.items || []
    }).slice(0, WEEK_DISPLAY_COUNT);
    latestInsight = buildWeeklyInsight(recentWeekSummaries[0], records, dailyReviews, followups);
  } else {
    const availableWeeks = await getAvailableWeeks();
    const recentWeeks = availableWeeks.slice(-WEEK_DISPLAY_COUNT).reverse();
    recentWeekSummaries = (await Promise.all(recentWeeks.map(week => loadWeeklySummary(week))))
      .filter(Boolean);
    latestInsight = await loadWeeklyInsight(recentWeeks[0]);
  }

  const reviewWeek = recentWeekSummaries[0]?.key || getCurrentWeekKey();
  
  if (recentWeekSummaries.length === 0) {
    const reviewPanel = await buildPeriodReviewPanel('weekly', reviewWeek, '周');
    page.innerHTML = `
      <div class="view-header animate-fade-in-up">
        <h1 class="view-title">Weekly</h1>
        <p class="view-subtitle">按周聚合的复盘数据</p>
      </div>
      ${reviewPanel}
      <div class="empty-state">
        <div class="empty-state-icon">□</div>
        <p class="empty-state-text">周数据正在整理中...</p>
      </div>
    `;
    bindPeriodReviewForms(page);
    return;
  }

  // Remove skeleton
  const skeleton = page.querySelector('.aggregation-grid');
  if (skeleton) skeleton.remove();

  // Create grid
  const grid = document.createElement('div');
  grid.className = 'aggregation-grid';

  weekCards = [];

  const reviewPanel = await buildPeriodReviewPanel('weekly', reviewWeek, '周');
  if (reviewPanel) page.insertAdjacentHTML('beforeend', reviewPanel);

  if (latestInsight) {
    page.appendChild(createInsightPanel(latestInsight));
  }

  for (let i = 0; i < recentWeekSummaries.length; i++) {
    const weekData = recentWeekSummaries[i];
    const card = createWeekCard(weekData, i === 0);
    card.classList.add('animate-fade-in-up');
    card.style.animationDelay = `${i * 80}ms`;
    
    grid.appendChild(card);
    weekCards.push({ card, weekData, weekStr: weekData.key });
  }

  page.appendChild(grid);
  
  // Giscus section
  page.appendChild(createGiscusSection('weekly-overview'));

  container.innerHTML = '';
  container.appendChild(page);
  bindPeriodReviewForms(page);
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

function createInsightPanel(insight) {
  const panel = document.createElement('section');
  panel.className = 'ops-panel weekly-insight animate-fade-in-up';
  panel.innerHTML = `
    <div class="section-heading">
      <h2 class="section-title">${escapeHtml(insight.theme || '本周洞察')}</h2>
      <span class="panel-date">${escapeHtml(insight.dateRange || insight.week || '')}</span>
    </div>
    <p class="panel-lead">${escapeHtml(insight.summary || '')}</p>
    <div class="insight-grid">
      ${buildInsightColumn('胜利', insight.wins)}
      ${buildInsightColumn('卡点', insight.blockers)}
      ${buildInsightColumn('下周聚焦', insight.nextWeekFocus)}
    </div>
  `;
  return panel;
}

function buildInsightColumn(title, items = []) {
  const list = items.length ? items : ['暂无记录'];
  return `
    <div class="insight-column">
      <h3>${escapeHtml(title)}</h3>
      <ul class="plain-list">
        ${list.slice(0, 4).map(item => `<li>${escapeHtml(item)}</li>`).join('')}
      </ul>
    </div>
  `;
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
