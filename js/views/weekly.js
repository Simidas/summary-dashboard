/* ========================================
   Weekly View
   ======================================== */

import { getAvailableWeeks, loadWeeklySummary, loadDailySummaries } from '../data.js';
import { createTags } from '../components/tag.js';

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
  page.className = 'page';
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
  const availableWeeks = await getAvailableWeeks();
  const recentWeeks = availableWeeks.slice(-WEEK_DISPLAY_COUNT).reverse();
  
  if (recentWeeks.length === 0) {
    page.innerHTML = `
      <div class="page">
        <div class="view-header animate-fade-in-up">
          <h1 class="view-title">Weekly</h1>
          <p class="view-subtitle">按周聚合的复盘数据</p>
        </div>
        <div class="empty-state">
          <div class="empty-state-icon">📅</div>
          <p class="empty-state-text">周数据正在整理中...</p>
        </div>
      </div>
    `;
    return;
  }

  // Remove skeleton
  const skeleton = page.querySelector('.aggregation-grid');
  if (skeleton) skeleton.remove();

  // Build header
  const header = page.querySelector('.view-header');

  // Create grid
  const grid = document.createElement('div');
  grid.className = 'aggregation-grid';

  weekCards = [];

  for (let i = 0; i < recentWeeks.length; i++) {
    const weekStr = recentWeeks[i];
    const weekData = await loadWeeklySummary(weekStr);
    
    if (!weekData) continue;

    const card = createWeekCard(weekData, i === 0);
    card.classList.add('animate-fade-in-up');
    card.style.animationDelay = `${i * 80}ms`;
    
    grid.appendChild(card);
    weekCards.push({ card, weekData, weekStr });
  }

  page.appendChild(grid);
  
  // Giscus section
  page.appendChild(createGiscusDiv('weekly-overview'));

  container.innerHTML = '';
  container.appendChild(page);
}

/**
 * Create a week card
 * @param {Object} data
 * @param {boolean} expanded
 * @returns {HTMLElement}
 */
function createWeekCard(data, expanded = false) {
  const card = document.createElement('article');
  card.className = 'aggregation-card week-card' + (expanded ? ' expanded' : '');
  
  const weekDisplay = `W${data.week}`;
  
  card.innerHTML = `
    <div class="aggregation-card-header">
      <div class="aggregation-card-title">${weekDisplay}</div>
      <div class="week-card-range">${data.dateRange}</div>
    </div>
    <div class="aggregation-card-stats">
      <span class="aggregation-card-stat">✅ ${data.totalAchievements || 0}</span>
      <span class="aggregation-card-stat">💬 ${data.totalDiscussions || 0}</span>
      <span class="aggregation-card-stat">📋 ${data.totalFollowUps || 0}</span>
    </div>
    <div class="aggregation-card-tags">
      ${(data.topTags || []).slice(0, 3).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}
    </div>
    <div class="week-card-details" style="display: ${expanded ? 'block' : 'none'}; margin-top: var(--space-3); padding-top: var(--space-3); border-top: 1px dashed var(--border);">
      ${data.dailyRecords ? `<div class="week-card-days">本周 ${data.days} 天有记录</div>` : ''}
      ${data.contentPublished ? `<div class="week-card-content">📝 发布内容 ${data.contentPublished} 篇</div>` : ''}
      <div class="week-card-daily-list" style="margin-top: var(--space-2); font-size: 0.875rem; color: var(--text-secondary);">
        ${(data.dailyRecords || []).map(d => `<span style="margin-right: var(--space-2);">📄 ${d}</span>`).join('')}
      </div>
    </div>
    <button class="week-card-expand" style="margin-top: var(--space-2); font-size: 0.8125rem; color: var(--accent); background: none; border: none; cursor: pointer; padding: 0;">
      ${expanded ? '收起' : '展开详情'}
    </button>
  `;

  // Toggle expand on click
  const expandBtn = card.querySelector('.week-card-expand');
  const details = card.querySelector('.week-card-details');
  
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
      <h3 class="giscus-title">来聊聊 Weekly 视图</h3>
    </div>
    <div class="giscus-container" id="giscus-weekly"></div>
  `;

  // Lazy load giscus
  const container = section.querySelector('#giscus-weekly');
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
