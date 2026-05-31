/* ========================================
   Weekly View
   ======================================== */

import { getAvailableWeeks, loadWeeklySummary } from '../data.js?v=20260521';
import { createWeekCard } from '../components/card.js?v=20260521';
import { createGiscusToggle } from '../components/giscus.js?v=20260521';

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
  page.appendChild(createGiscusSection('weekly-overview'));

  container.innerHTML = '';
  container.appendChild(page);
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
