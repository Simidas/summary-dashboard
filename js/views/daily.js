/* ========================================
   Daily View
   ======================================== */

// TODO(Phase 2): Keyboard navigation should switch date content, not just expand/collapse
// TODO(Phase 3): Add tag click filtering

import { loadDailySummaries, getAvailableDailyDates } from '../data.js?v=20260626p';
import { getDailyReview, getDailyReviews, getRecords, updateDailyReview } from '../api.js?v=20260626p';
import { getAuthState, isApiEnabled } from '../auth.js?v=20260626p';
import { createSummaryCard } from '../components/card.js?v=20260626p';
import { createGiscusToggle } from '../components/giscus.js?v=20260626p';

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
  page.className = 'page operations-page';

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
  const authState = getAuthState();
  const canUseOwnerApi = isApiEnabled() && authState.user?.role === 'owner';
  const [availableDates, onlineRecordsData, dailyReviewsData, dailyReviewData] = await Promise.all([
    getAvailableDailyDates(),
    canUseOwnerApi ? getRecords({ limit: 100 }).catch(() => null) : Promise.resolve(null),
    canUseOwnerApi ? getDailyReviews({ limit: 45 }).catch(() => null) : Promise.resolve(null),
    canUseOwnerApi ? getDailyReview('today').catch(() => null) : Promise.resolve(null)
  ]);
  const legacySummaries = await loadDailySummaries(availableDates);
  const onlineRecords = onlineRecordsData?.records || [];
  const dailyReviews = dailyReviewsData?.reviews || [];
  const dailyReview = dailyReviewData?.review || null;
  const heroReview = selectHeroDailyReview(dailyReview, dailyReviews);
  const onlineSummaries = buildOnlineDailySummaries(dailyReviews, onlineRecords);
  const usingOnlineSummaries = onlineSummaries.length > 0;
  summaries = usingOnlineSummaries ? onlineSummaries : legacySummaries;

  if (summaries.length === 0) {
    skeleton.remove();
    appendDailyReviewEditor(page, authState, dailyReview);
    if (!page.querySelector('#daily-review-form')) {
      page.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">□</div>
          <p class="empty-state-text">今日的记录还在整理中。</p>
        </div>
      `;
    }
    bindDailyReviewForm(page);
    return;
  }

  // Remove skeleton now that real data is ready
  skeleton.remove();

  appendDailyReviewEditor(page, authState, dailyReview);

  if (summaries.length === 0) return;

  // Build main content
  renderHero(page, heroReview);

  // Timeline section
  renderTimeline(page, summaries, usingOnlineSummaries ? '最近每日综合记录' : '历史归档记录');

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

  bindDailyReviewForm(page);
}

function selectHeroDailyReview(todayReview, reviews = []) {
  const today = getShanghaiDate();
  const yesterday = getShanghaiDate(-1);
  const candidates = [
    todayReview,
    ...reviews
  ].filter(Boolean);

  return candidates.find(review => review.date === today && hasDailyReviewContent(review))
    || candidates.find(review => review.date === yesterday && hasDailyReviewContent(review))
    || null;
}

function hasDailyReviewContent(review) {
  return Boolean(
    review?.mostImportantThing
    || review?.reflection
    || review?.tomorrowFirstStep
    || review?.mood
    || review?.energy
    || review?.wins?.length
    || review?.blockers?.length
  );
}

function buildOnlineDailySummaries(reviews = [], records = []) {
  const byDate = new Map();

  reviews.forEach(review => {
    if (!review?.date) return;
    const entry = getOrCreateDailyEntry(byDate, review.date);
    entry.dailyReview = review;
    entry.mood = review.mood || entry.mood;
    entry.energy = review.energy || entry.energy;
    entry.updatedAt = review.updatedAt || entry.updatedAt;
  });

  records.forEach(record => {
    const date = record.date || String(record.createdAt || '').slice(0, 10);
    if (!date) return;
    const entry = getOrCreateDailyEntry(byDate, date);
    entry.records.push(record);
    entry.mood = entry.mood || record.mood;
    entry.energy = entry.energy || record.energy;
    entry.updatedAt = maxIso(entry.updatedAt, record.updatedAt || record.createdAt);
  });

  return Array.from(byDate.values())
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, TIMELINE_DAYS);
}

function getOrCreateDailyEntry(map, date) {
  if (!map.has(date)) {
    map.set(date, {
      date,
      source: 'd1',
      records: [],
      dailyReview: null,
      tags: ['每日综合记录']
    });
  }

  return map.get(date);
}

function maxIso(left, right) {
  if (!left) return right || '';
  if (!right) return left;
  return left > right ? left : right;
}

function appendDailyReviewEditor(page, authState, review) {
  const wrapper = document.createElement('div');
  wrapper.className = 'operations-page';
  wrapper.innerHTML = buildDailyReviewEditor(authState, review);
  if (wrapper.innerHTML.trim()) page.appendChild(wrapper);
}

function buildDailyReviewEditor(authState, review) {
  if (!authState.apiAvailable || authState.user?.role !== 'owner') return '';

  return `
    <section class="settings-panel">
      <div class="section-heading">
        <h2 class="section-title">每日综合记录</h2>
        <span class="panel-date">${review?.updatedAt ? `上次更新 ${escapeHtml(formatShortTime(review.updatedAt))}` : ''}</span>
      </div>
      <form id="daily-review-form" class="dashboard-settings-form">
        <label>
          <span>今天最重要的事</span>
          <input name="mostImportantThing" value="${escapeAttr(review?.mostImportantThing || '')}" placeholder="今天真正推进了什么？">
        </label>
        <div class="record-form-grid">
          <label>
            <span>心情</span>
            <input name="mood" value="${escapeAttr(review?.mood || '')}" placeholder="例如：平静、焦虑、松了一口气">
          </label>
          <label>
            <span>能量</span>
            <input name="energy" type="number" min="1" max="5" value="${escapeAttr(review?.energy || '')}" placeholder="1-5">
          </label>
        </div>
        <label>
          <span>今日收获</span>
          <textarea name="wins" rows="3" placeholder="一行一条">${escapeHtml(joinLines(review?.wins))}</textarea>
        </label>
        <label>
          <span>卡点</span>
          <textarea name="blockers" rows="3" placeholder="一行一条">${escapeHtml(joinLines(review?.blockers))}</textarea>
        </label>
        <label>
          <span>复盘</span>
          <textarea name="reflection" rows="4" placeholder="今天最值得看见的情绪、原因和提醒">${escapeHtml(review?.reflection || '')}</textarea>
        </label>
        <label>
          <span>明天第一步</span>
          <input name="tomorrowFirstStep" value="${escapeAttr(review?.tomorrowFirstStep || '')}" placeholder="小到能直接开始的一步">
        </label>
        <div class="record-form-footer">
          <span class="form-status" id="daily-review-status"></span>
          <button class="primary-action" type="submit">保存每日复盘</button>
        </div>
      </form>
    </section>
  `;
}

function bindDailyReviewForm(page) {
  const form = page.querySelector('#daily-review-form');
  if (!form) return;

  const status = page.querySelector('#daily-review-status');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    status.textContent = '保存中...';

    try {
      await updateDailyReview('today', {
        mostImportantThing: form.elements.mostImportantThing.value,
        wins: splitLines(form.elements.wins.value),
        blockers: splitLines(form.elements.blockers.value),
        reflection: form.elements.reflection.value,
        tomorrowFirstStep: form.elements.tomorrowFirstStep.value,
        mood: form.elements.mood.value,
        energy: form.elements.energy.value
      });
      status.textContent = '已保存，正在更新列表...';
      const main = document.getElementById('main-content');
      if (main) await renderDailyView(main);
    } catch (error) {
      status.textContent = error.message || '保存失败';
    } finally {
      button.disabled = false;
    }
  });
}

/**
 * Render hero section with today's or yesterday's saved daily review
 * @param {HTMLElement} page
 * @param {Object|null} review
 */
function renderHero(page, review) {
  const hero = document.createElement('section');
  hero.className = 'hero animate-fade-in-up';
  hero.style.animationDelay = '0ms';

  const today = getShanghaiDate();
  const isToday = review?.date === today;
  const dateText = review?.date || today;
  const summaryText = review
    ? getDailyReviewHeroSummary(review)
    : '今天还没有保存每日复盘。写下今天最重要的事，头部就会展示这里。';
  const tags = review ? getDailyReviewHeroTags(review, isToday) : ['每日综合记录'];
  const moodHtml = review?.mood
    ? `<span class="mood" style="margin-left: 8px;">${escapeHtml(review.mood)}</span>`
    : '';

  hero.innerHTML = `
    <div class="hero-date">
      <span>📅</span>
      <span>${escapeHtml(dateText)}</span>
      <span>${review ? (isToday ? '· 今天' : '· 昨天') : '· 未保存'}</span>
      ${moodHtml}
    </div>
    <h1 class="hero-title">
      ${review ? (isToday ? '今日复盘' : '昨日复盘') : '等待每日复盘'}
    </h1>
    <p class="hero-summary">
      ${escapeHtml(summaryText)}
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

function getDailyReviewHeroSummary(review) {
  if (review.mostImportantThing) return review.mostImportantThing;
  if (review.reflection) return review.reflection;
  if (review.wins?.length) return `今日收获：${review.wins.slice(0, 2).join('；')}`;
  if (review.blockers?.length) return `卡点：${review.blockers.slice(0, 2).join('；')}`;
  if (review.tomorrowFirstStep) return `下一步：${review.tomorrowFirstStep}`;
  return '这天已经保存每日复盘。';
}

function getDailyReviewHeroTags(review, isToday) {
  return [
    '每日综合记录',
    isToday ? '今天' : '昨天',
    review.energy ? `能量 ${review.energy}/5` : '',
    review.tomorrowFirstStep ? '有下一步' : ''
  ].filter(Boolean);
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/"/g, '&quot;');
}

function splitLines(value) {
  return String(value || '')
    .split('\n')
    .map(item => item.trim())
    .filter(Boolean);
}

function joinLines(items = []) {
  return Array.isArray(items) ? items.join('\n') : '';
}

function formatShortTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function getShanghaiDate(offsetDays = 0) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const date = new Date(Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day) + offsetDays
  ));
  return date.toISOString().slice(0, 10);
}

/**
 * Render timeline of cards
 * @param {HTMLElement} page
 * @param {Object[]} summaries
 */
function renderTimeline(page, summaries, titleText = '最近记录') {
  // Remove old timeline if exists
  const oldTimeline = page.querySelector('.timeline-section');
  if (oldTimeline) oldTimeline.remove();

  const section = document.createElement('section');
  section.className = 'timeline-section';

  const title = document.createElement('h2');
  title.className = 'section-title';
  title.textContent = `📜 ${titleText}`;
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
