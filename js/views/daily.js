/* ========================================
   Daily View
   ======================================== */

// TODO(Phase 2): Keyboard navigation should switch date content, not just expand/collapse
// TODO(Phase 3): Add tag click filtering

import { loadDailySummaries, getAvailableDailyDates } from '../data.js?v=20260624';
import { createSummaryCard, createSkeletonCard } from '../components/card.js?v=20260624';
import { createGiscusToggle } from '../components/giscus.js?v=20260624';

const TIMELINE_DAYS = 14;

let currentIndex = 0;
let summaries = [];
let timelineCards = [];
let _keyboardNavBound = false;

/**
 * Render daily view
 * @param {HTMLElement} container
 * @param {Object} params - route params
 */
export async function renderDailyView(container, params = {}) {
  // Reset state for fresh render
  timelineCards = [];
  currentIndex = 0;

  container.innerHTML = '';

  // Create page structure
  const page = document.createElement('div');
  page.className = 'page';

  // Loading state
  const skeleton = document.createElement('div');
  skeleton.innerHTML = `
    <div class="hero">
      <div class="skeleton" style="height: 24px; width: 120px; margin-bottom: 16px;"></div>
      <div class="skeleton" style="height: 40px; width: 80%; margin-bottom: 12px;"></div>
      <div class="skeleton" style="height: 20px; width: 60%;"></div>
    </div>
    <div class="timeline">
      ${Array(3).fill('<div class="skeleton-card skeleton"></div>').join('')}
    </div>
  `;
  page.appendChild(skeleton);
  container.appendChild(page);

  // Load data
  const availableDates = await getAvailableDailyDates();
  summaries = await loadDailySummaries(availableDates);

  if (summaries.length === 0) {
    page.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🌙</div>
        <p class="empty-state-text">今日的记录还在整理中，明早见 🌙</p>
      </div>
    `;
    return;
  }

  // Remove skeleton now that real data is ready
  skeleton.remove();

  // Build main content
  renderHero(page, summaries[0]);

  // Timeline section
  renderTimeline(page, summaries);

  // Giscus section
  const giscusSection = document.createElement('div');
  giscusSection.className = 'giscus-section';
  giscusSection.innerHTML = `
    <div class="giscus-header">
      <h3 class="giscus-title">来聊聊这篇复盘吧</h3>
    </div>
    <div class="giscus-container" id="giscus-daily"></div>
  `;
  const giscusToggle = createGiscusToggle('giscus-daily', '展开评论区');
  giscusSection.querySelector('.giscus-header').appendChild(giscusToggle);
  page.appendChild(giscusSection);

  // Keyboard navigation — bind once only
  if (!_keyboardNavBound) {
    setupKeyboardNav();
    _keyboardNavBound = true;
  }
}

/**
 * Render hero section with latest summary
 * @param {HTMLElement} page
 * @param {Object} latest
 */
function renderHero(page, latest) {
  const hero = document.createElement('section');
  hero.className = 'hero animate-fade-in-up';
  hero.style.animationDelay = '0ms';

  const today = new Date().toISOString().split('T')[0];
  const isToday = latest.date === today;
  const summaryText = getHeroSummary(latest);
  const tags = getHeroTags(latest);
  const moodHtml = latest.mood
    ? `<span class="mood" style="margin-left: 8px;">${escapeHtml(latest.mood)}</span>`
    : '';

  hero.innerHTML = `
    <div class="hero-date">
      <span>📅</span>
      <span>${escapeHtml(latest.date)}</span>
      <span>${isToday ? '· 今天' : ''}</span>
      ${moodHtml}
    </div>
    <h1 class="hero-title">
      ${isToday ? '今日复盘' : '昨日复盘'}
    </h1>
    <p class="hero-summary">
      ${escapeHtml(summaryText)}...
    </p>
    <div class="hero-meta">
      ${tags.slice(0, 4).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}
    </div>
  `;

  // Insert at top - use existingHero's parent to replace (handles nested skeleton hero)
  const existingHero = page.querySelector('.hero');
  if (existingHero) {
    existingHero.parentNode.replaceChild(hero, existingHero);
  } else {
    page.insertBefore(hero, page.firstChild);
  }
}

function getHeroSummary(data) {
  if (data.dailyReview?.mostImportantThing) return data.dailyReview.mostImportantThing;
  if (data.dailyReview?.reflection) return data.dailyReview.reflection;

  const firstRecord = Array.isArray(data.records) ? data.records[0] : null;
  if (firstRecord) {
    return firstRecord.summary || firstRecord.raw || firstRecord.content || '';
  }

  return (data.achievements || []).slice(0, 2).join('；');
}

function getHeroTags(data) {
  if (Array.isArray(data.records)) {
    const tags = new Set();
    data.records.forEach(record => {
      if (record.domain) tags.add(getDomainLabel(record.domain));
      (record.tags || []).forEach(tag => tags.add(tag));
    });
    return Array.from(tags);
  }

  return data.tags || [];
}

function getDomainLabel(domain) {
  const labels = {
    work: '主业',
    side_business: '副业',
    life: '生活',
    content: '内容'
  };
  return labels[domain] || domain || '未分类';
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Render timeline of cards
 * @param {HTMLElement} page
 * @param {Object[]} summaries
 */
function renderTimeline(page, summaries) {
  // Remove old timeline if exists
  const oldTimeline = page.querySelector('.timeline-section');
  if (oldTimeline) oldTimeline.remove();

  const section = document.createElement('section');
  section.className = 'timeline-section';

  const title = document.createElement('h2');
  title.className = 'section-title';
  title.textContent = '📜 最近记录';
  section.appendChild(title);

  const timeline = document.createElement('div');
  timeline.className = 'timeline';

  // Create cards with staggered animation
  summaries.forEach((data, index) => {
    const card = createSummaryCard(data, index === 0);
    card.classList.add('timeline-item');

    // Stagger animation
    setTimeout(() => {
      card.classList.add('visible');
    }, 100 + index * 80);

    timeline.appendChild(card);
    timelineCards.push(card);
  });

  section.appendChild(timeline);

  // Keyboard hint
  const hint = document.createElement('div');
  hint.className = 'keyboard-hint';
  hint.innerHTML = `
    <span class="key">←</span>
    <span class="key">→</span>
    <span>键盘切换日期</span>
  `;
  section.appendChild(hint);

  page.appendChild(section);

  // Setup intersection observer for scroll animations
  setupScrollAnimations();
}

/**
 * Setup keyboard navigation
 */
function setupKeyboardNav() {
  document.addEventListener('keydown', (e) => {
    // Only in daily view
    if (window.location.hash.slice(1) !== 'daily') return;

    if (e.key === 'ArrowLeft') {
      navigateCard(-1);
    } else if (e.key === 'ArrowRight') {
      navigateCard(1);
    }
  });
}

/**
 * Navigate to adjacent card
 * @param {number} direction - -1 for left, 1 for right
 */
function navigateCard(direction) {
  const newIndex = Math.max(0, Math.min(summaries.length - 1, currentIndex + direction));
  if (newIndex === currentIndex) return;

  currentIndex = newIndex;

  // Collapse all, expand target
  timelineCards.forEach((card, i) => {
    if (i === currentIndex) {
      card.classList.add('expanded');
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      card.classList.remove('expanded');
    }
  });
}

let _scrollObserver = null;

/**
 * Setup intersection observer for scroll animations
 */
function setupScrollAnimations() {
  // Disconnect existing observer to prevent duplicates
  if (_scrollObserver) {
    _scrollObserver.disconnect();
  }

  _scrollObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
        }
      });
    },
    { threshold: 0.1 }
  );

  document.querySelectorAll('.timeline-item').forEach(el => {
    _scrollObserver.observe(el);
  });
}

/**
 * Set current index (for external control)
 * @param {number} index
 */
export function setCurrentIndex(index) {
  currentIndex = index;
  if (timelineCards[currentIndex]) {
    timelineCards.forEach((card, i) => {
      card.classList.toggle('expanded', i === currentIndex);
    });
  }
}
