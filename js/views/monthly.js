/* ========================================
   Monthly View
   ======================================== */

import { getAvailableMonths, loadMonthlySummary } from '../data.js?v=20260626c';
import { createMonthCard } from '../components/card.js?v=20260626c';
import { createGiscusToggle } from '../components/giscus.js?v=20260626c';
import { bindPeriodReviewForms, buildPeriodReviewPanel } from '../components/period-review.js?v=20260626c';

const MONTH_DISPLAY_COUNT = 12;

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
  page.className = 'page';
  page.innerHTML = `
    <div class="view-header animate-fade-in-up">
      <h1 class="view-title">Monthly</h1>
      <p class="view-subtitle">按月聚合的复盘数据</p>
    </div>
    <div class="monthly-chart" style="margin-bottom: var(--space-6);">
      <div class="chart-placeholder" style="height: 120px; display: flex; align-items: flex-end; gap: 8px; padding: var(--space-3); background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-lg);">
        ${Array(6).fill('<div class="skeleton" style="flex: 1; height: 60%;"></div>').join('')}
      </div>
    </div>
    <div class="aggregation-grid">
      ${Array(4).fill('<div class="skeleton" style="height: 140px;"></div>').join('')}
    </div>
  `;
  container.appendChild(page);

  // Load data
  const availableMonths = await getAvailableMonths();
  const recentMonths = availableMonths.slice(-MONTH_DISPLAY_COUNT).reverse();
  const reviewMonth = recentMonths[0] || new Date().toISOString().slice(0, 7);
  
  if (recentMonths.length === 0) {
    const reviewPanel = await buildPeriodReviewPanel('monthly', reviewMonth, '月');
    page.innerHTML = `
      <div class="view-header animate-fade-in-up">
        <h1 class="view-title">Monthly</h1>
        <p class="view-subtitle">按月聚合的复盘数据</p>
      </div>
      ${reviewPanel}
      <div class="empty-state">
        <div class="empty-state-icon">□</div>
        <p class="empty-state-text">月数据正在整理中...</p>
      </div>
    `;
    bindPeriodReviewForms(page);
    return;
  }

  // Collect data for chart
  const chartData = [];
  const monthlyDataList = [];
  for (const monthStr of recentMonths) {
    const data = await loadMonthlySummary(monthStr);
    if (data) {
      monthlyDataList.push(data);
      chartData.push({
        month: monthStr,
        monthName: data.monthName,
        totalAchievements: data.totalAchievements || 0
      });
    }
  }

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
    <div class="monthly-bar-chart" style="display: flex; align-items: flex-end; gap: 12px; height: 140px; padding: var(--space-3); background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-lg); margin-top: var(--space-3);">
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

  // Create grid
  const grid = document.createElement('div');
  grid.className = 'aggregation-grid';
  grid.style.marginTop = 'var(--space-6)';

  monthCards = [];

  const reviewPanel = await buildPeriodReviewPanel('monthly', reviewMonth, '月');
  if (reviewPanel) page.insertAdjacentHTML('beforeend', reviewPanel);

  for (let i = 0; i < recentMonths.length; i++) {
    const monthStr = recentMonths[i];
    const monthData = await loadMonthlySummary(monthStr);
    
    if (!monthData) continue;

    const card = createMonthCard(monthData, i === 0);
    card.classList.add('animate-fade-in-up');
    card.style.animationDelay = `${i * 60}ms`;
    
    grid.appendChild(card);
    monthCards.push({ card, monthData, monthStr });
  }

  if (monthlyDataList[0]) {
    page.appendChild(createMonthlyInsight(monthlyDataList[0]));
  }
  page.appendChild(chartSection);
  page.appendChild(grid);
  
  // Giscus section
  page.appendChild(createGiscusSection('monthly-overview'));

  container.innerHTML = '';
  container.appendChild(page);
  bindPeriodReviewForms(page);
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

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value == null ? '' : String(value);
  return div.innerHTML;
}
