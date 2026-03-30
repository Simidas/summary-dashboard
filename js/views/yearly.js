/* ========================================
   Yearly View
   ======================================== */

import { getAvailableYears, loadYearlySummary } from '../data.js';

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
  page.className = 'page';
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
  const availableYears = await getAvailableYears();
  const sortedYears = [...availableYears].sort().reverse();
  
  if (sortedYears.length === 0) {
    page.innerHTML = `
      <div class="page">
        <div class="view-header animate-fade-in-up">
          <h1 class="view-title">Yearly</h1>
          <p class="view-subtitle">按年聚合的复盘数据</p>
        </div>
        <div class="empty-state">
          <div class="empty-state-icon">🗓️</div>
          <p class="empty-state-text">年数据正在整理中...</p>
        </div>
      </div>
    `;
    return;
  }

  // Collect all year data
  const yearsData = [];
  for (const yearStr of sortedYears) {
    const data = await loadYearlySummary(yearStr);
    if (data) {
      yearsData.push({ year: yearStr, data });
    }
  }

  // Remove skeleton
  const oldHero = page.querySelector('.year-hero');
  const oldGrid = page.querySelector('.aggregation-grid');
  if (oldHero) oldHero.remove();
  if (oldGrid) oldGrid.remove();

  // Build header
  const header = page.querySelector('.view-header');

  // Create year hero cards
  yearsData.forEach(({ year, data }, index) => {
    const heroCard = createYearHeroCard(data, index === 0);
    heroCard.classList.add('animate-fade-in-up');
    heroCard.style.animationDelay = `${index * 100}ms`;
    page.appendChild(heroCard);
  });

  // Giscus section
  page.appendChild(createGiscusDiv('yearly-overview'));

  container.innerHTML = '';
  container.appendChild(page);
}

/**
 * Create a year hero card (large card for yearly overview)
 * @param {Object} data
 * @param {boolean} expanded
 * @returns {HTMLElement}
 */
function createYearHeroCard(data, expanded = false) {
  const card = document.createElement('article');
  card.className = 'year-hero-card' + (expanded ? ' expanded' : '');
  
  card.innerHTML = `
    <div class="year-hero-header">
      <div class="year-hero-title">${data.year}年</div>
      <div class="year-hero-subtitle">年度总览</div>
    </div>
    <div class="year-hero-stats">
      <div class="year-stat">
        <div class="year-stat-value">${data.totalAchievements || 0}</div>
        <div class="year-stat-label">成就</div>
      </div>
      <div class="year-stat">
        <div class="year-stat-value">${data.totalProjects || 0}</div>
        <div class="year-stat-label">项目</div>
      </div>
      <div class="year-stat">
        <div class="year-stat-value">${data.totalContentPublished || 0}</div>
        <div class="year-stat-label">内容</div>
      </div>
    </div>
    <div class="year-hero-tags">
      <div class="year-hero-tags-label">热门标签</div>
      <div class="year-hero-tags-list">
        ${(data.topTags || []).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}
      </div>
    </div>
    <div class="year-hero-months" style="display: ${expanded ? 'flex' : 'none'}; flex-wrap: wrap; gap: var(--space-2); margin-top: var(--space-4); padding-top: var(--space-4); border-top: 1px dashed var(--border);">
      <div style="font-size: 0.875rem; color: var(--text-secondary); width: 100%; margin-bottom: var(--space-1);">📅 涉及月份</div>
      ${(data.months || []).map(m => `<span style="font-size: 0.875rem; padding: 4px 8px; background: var(--accent-light); color: var(--accent); border-radius: var(--radius-sm);">${m}</span>`).join('')}
    </div>
    <button class="year-hero-expand" style="margin-top: var(--space-3); font-size: 0.875rem; color: var(--accent); background: none; border: none; cursor: pointer; padding: 0;">
      ${expanded ? '收起' : '展开月份详情'}
    </button>
  `;

  // Toggle expand on click
  const expandBtn = card.querySelector('.year-hero-expand');
  const monthsDiv = card.querySelector('.year-hero-months');
  
  expandBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isExpanded = monthsDiv.style.display === 'flex';
    monthsDiv.style.display = isExpanded ? 'none' : 'flex';
    expandBtn.textContent = isExpanded ? '展开月份详情' : '收起';
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
      <h3 class="giscus-title">来聊聊 Yearly 视图</h3>
    </div>
    <div class="giscus-container" id="giscus-yearly"></div>
  `;

  // Lazy load giscus
  const container = section.querySelector('#giscus-yearly');
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
