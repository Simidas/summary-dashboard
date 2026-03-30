/* ========================================
   Monthly View
   ======================================== */

import { getAvailableMonths, loadMonthlySummary } from '../data.js';

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
  
  if (recentMonths.length === 0) {
    page.innerHTML = `
      <div class="page">
        <div class="view-header animate-fade-in-up">
          <h1 class="view-title">Monthly</h1>
          <p class="view-subtitle">按月聚合的复盘数据</p>
        </div>
        <div class="empty-state">
          <div class="empty-state-icon">📆</div>
          <p class="empty-state-text">月数据正在整理中...</p>
        </div>
      </div>
    `;
    return;
  }

  // Collect data for chart
  const chartData = [];
  for (const monthStr of recentMonths) {
    const data = await loadMonthlySummary(monthStr);
    if (data) {
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

  page.appendChild(chartSection);
  page.appendChild(grid);
  
  // Giscus section
  page.appendChild(createGiscusDiv('monthly-overview'));

  container.innerHTML = '';
  container.appendChild(page);
}

/**
 * Create a month card
 * @param {Object} data
 * @param {boolean} expanded
 * @returns {HTMLElement}
 */
function createMonthCard(data, expanded = false) {
  const card = document.createElement('article');
  card.className = 'aggregation-card month-card' + (expanded ? ' expanded' : '');
  
  card.innerHTML = `
    <div class="aggregation-card-header">
      <div class="aggregation-card-title">${data.monthName}</div>
      <div class="month-card-year">${data.year}年</div>
    </div>
    <div class="aggregation-card-stats">
      <span class="aggregation-card-stat">✅ ${data.totalAchievements || 0}</span>
      <span class="aggregation-card-stat">💬 ${data.totalDiscussions || 0}</span>
      ${data.contentPublished ? `<span class="aggregation-card-stat">📝 ${data.contentPublished}</span>` : ''}
    </div>
    <div class="aggregation-card-tags">
      ${(data.topTags || []).slice(0, 3).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}
    </div>
    <div class="month-card-details" style="display: ${expanded ? 'block' : 'none'}; margin-top: var(--space-3); padding-top: var(--space-3); border-top: 1px dashed var(--border);">
      <div style="font-size: 0.875rem; color: var(--text-secondary);">
        <div>📅 本月涉及 ${data.weeks?.length || 0} 周</div>
        ${data.topProjects?.length ? `<div style="margin-top: 4px;">📁 项目：${data.topProjects.join(', ')}</div>` : ''}
      </div>
    </div>
    <button class="month-card-expand" style="margin-top: var(--space-2); font-size: 0.8125rem; color: var(--accent); background: none; border: none; cursor: pointer; padding: 0;">
      ${expanded ? '收起' : '展开详情'}
    </button>
  `;

  // Toggle expand on click
  const expandBtn = card.querySelector('.month-card-expand');
  const details = card.querySelector('.month-card-details');
  
  expandBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isExpanded = details.style.display === 'block';
    details.style.display = isExpanded ? 'none' : 'block';
    expandBtn.textContent = isExpanded ? '展开详情' : '收起';
    card.classList.toggle('expanded', !isExpanded);
  });

  return card;
}

/**
 * Escape HTML
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
 * Create a simple Giscus div placeholder
 * @param {string} topic
 * @returns {HTMLElement}
 */
function createGiscusDiv(topic) {
  const section = document.createElement('div');
  section.className = 'giscus-section';
  section.innerHTML = `
    <div class="giscus-header">
      <h3 class="giscus-title">来聊聊 Monthly 视图</h3>
    </div>
    <div class="giscus-container" id="giscus-monthly"></div>
  `;

  // Lazy load giscus
  const container = section.querySelector('#giscus-monthly');
  const toggle = document.createElement('button');
  toggle.className = 'giscus-toggle';
  toggle.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2 5.5C2 4.11929 3.11929 3 4.5 3H11.5C12.8807 3 14 4.11929 14 5.5V8.5C14 9.88071 12.8807 11 11.5 11H7L4 13V11H4.5C3.11929 11 2 9.88071 2 8.5V5.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    <span>展开评论区</span>
  `;

  toggle.addEventListener('click', () => {
    if (!container.classList.contains('loaded')) {
      const script = document.createElement('script');
      script.src = 'https://giscus.app/client.js';
      script.setAttribute('data-repo', 'Simidas/summary-dashboard');
      script.setAttribute('data-repo-id', 'R_kgDOR0YGCw');
      script.setAttribute('data-category', 'General');
      script.setAttribute('data-category-id', 'DIC_kwDOR0YGC84C5mS9');
      script.setAttribute('data-mapping', 'pathname');
      script.setAttribute('data-strict', '0');
      script.setAttribute('data-reactions-enabled', '1');
      script.setAttribute('data-emit-metadata', '0');
      script.setAttribute('data-input-position', 'top');
      script.setAttribute('data-theme', 'preferred_color_scheme');
      script.setAttribute('data-lang', 'zh-CN');
      script.setAttribute('data-loading', 'lazy');
      script.setAttribute('data-anonymous', 'true');
      script.crossOrigin = 'anonymous';
      script.async = true;
      container.appendChild(script);
      container.classList.add('loaded');
      toggle.querySelector('span').textContent = '收起评论区';
    } else {
      container.classList.toggle('loaded');
      const isLoaded = container.classList.contains('loaded');
      toggle.querySelector('span').textContent = isLoaded ? '收起评论区' : '展开评论区';
    }
  });

  section.insertBefore(toggle, container);
  return section;
}
