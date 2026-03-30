/* ========================================
   Card Component
   ======================================== */

import { createTags } from './tag.js';
import { formatDate, getWeekday } from '../utils/date.js';

/**
 * Section icons map
 */
const SECTION_ICONS = {
  achievements: '✅',
  discussions: '💬',
  followUps: '📋',
  learnings: '💡'
};

/**
 * Create a daily summary card
 * @param {Object} data - summary data
 * @param {boolean} expanded - is card expanded by default
 * @returns {HTMLElement}
 */
export function createSummaryCard(data, expanded = false) {
  const card = document.createElement('article');
  card.className = 'card' + (expanded ? ' expanded' : '');
  card.dataset.date = data.date;

  // Build preview text from achievements
  const previewText = data.achievements && data.achievements.length > 0
    ? data.achievements[0]
    : '';

  // Header with date, weekday, and tags
  const header = document.createElement('div');
  header.className = 'card-header';

  const dateDiv = document.createElement('div');
  dateDiv.className = 'card-date';
  dateDiv.innerHTML = `
    <span>📅</span>
    <span>${formatDate(data.date)}</span>
    <span class="card-weekday">${getWeekday(data.date)}</span>
  `;

  const tagsContainer = document.createElement('div');
  tagsContainer.className = 'card-tags';
  if (data.tags && data.tags.length > 0) {
    tagsContainer.appendChild(createTags(data.tags.slice(0, 3)));
  }

  header.appendChild(dateDiv);
  header.appendChild(tagsContainer);

  // Preview text
  const preview = document.createElement('p');
  preview.className = 'card-preview';
  preview.textContent = previewText;

  // Expand icon
  const expandIcon = document.createElement('span');
  expandIcon.className = 'card-expand-icon';
  expandIcon.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 6L8 10L12 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

  // Card body (expandable content)
  const body = document.createElement('div');
  body.className = 'card-body';
  body.innerHTML = buildCardBodyHTML(data);

  // Click to toggle
  card.addEventListener('click', () => {
    card.classList.toggle('expanded');
  });

  card.appendChild(header);
  card.appendChild(preview);
  card.appendChild(expandIcon);
  card.appendChild(body);

  return card;
}

/**
 * Build card body HTML from data
 * @param {Object} data
 * @returns {string}
 */
function buildCardBodyHTML(data) {
  let html = '';

  // Achievements
  if (data.achievements && data.achievements.length > 0) {
    html += `
      <div class="card-section">
        <div class="card-section-title">${SECTION_ICONS.achievements} 今日成就</div>
        <div class="card-section-content">
          <ul>
            ${data.achievements.map(a => `<li>${escapeHtml(a)}</li>`).join('')}
          </ul>
        </div>
      </div>
    `;
  }

  // Discussions
  if (data.discussions && data.discussions.length > 0) {
    html += `
      <div class="card-section">
        <div class="card-section-title">${SECTION_ICONS.discussions} 讨论</div>
        <div class="card-section-content">
          <ul>
            ${data.discussions.map(d => `<li>${escapeHtml(d)}</li>`).join('')}
          </ul>
        </div>
      </div>
    `;
  }

  // Follow-ups
  if (data.followUps && data.followUps.length > 0) {
    html += `
      <div class="card-section">
        <div class="card-section-title">${SECTION_ICONS.followUps} 待跟进</div>
        <div class="card-section-content">
          <ul>
            ${data.followUps.map(f => `<li>${escapeHtml(f)}</li>`).join('')}
          </ul>
        </div>
      </div>
    `;
  }

  // Learnings
  if (data.learnings && data.learnings.length > 0) {
    html += `
      <div class="card-section">
        <div class="card-section-title">${SECTION_ICONS.learnings} 学到的</div>
        <div class="card-section-content">
          <ul>
            ${data.learnings.map(l => `<li>${escapeHtml(l)}</li>`).join('')}
          </ul>
        </div>
      </div>
    `;
  }

  // Meta info
  html += `
    <div class="card-section" style="margin-top: var(--space-3); padding-top: var(--space-2); border-top: 1px dashed var(--border);">
      <div style="display: flex; gap: var(--space-3); font-size: 0.8125rem; color: var(--text-secondary);">
        ${data.exercise ? `<span>🏃 ${escapeHtml(data.exercise)}</span>` : ''}
        ${data.mood ? `<span class="mood">${data.mood}</span>` : ''}
      </div>
    </div>
  `;

  return html;
}

/**
 * Escape HTML to prevent XSS
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
 * Create skeleton card for loading state
 * @returns {HTMLElement}
 */
export function createSkeletonCard() {
  const card = document.createElement('div');
  card.className = 'skeleton-card skeleton';
  return card;
}

/**
 * Create aggregation card (for weekly/monthly/yearly views)
 * @param {Object} data
 * @returns {HTMLElement}
 */
export function createAggregationCard(data) {
  const card = document.createElement('article');
  card.className = 'aggregation-card';

  const title = data.title || data.monthName || data.year || '';
  const stats = data.stats || {};

  card.innerHTML = `
    <div class="aggregation-card-header">
      <div class="aggregation-card-title">${escapeHtml(title)}</div>
    </div>
    <div class="aggregation-card-stats">
      ${stats.achievements ? `<span class="aggregation-card-stat">✅ ${stats.achievements}</span>` : ''}
      ${stats.discussions ? `<span class="aggregation-card-stat">💬 ${stats.discussions}</span>` : ''}
      ${stats.projects ? `<span class="aggregation-card-stat">📁 ${stats.projects}</span>` : ''}
    </div>
    <div class="aggregation-card-tags">
      ${(data.topTags || []).slice(0, 3).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}
    </div>
  `;

  return card;
}
