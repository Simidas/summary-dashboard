/* ========================================
   Main Application Entry
   ======================================== */

// TODO(Phase 3): Implement search with Ctrl+K / '/' shortcut
// TODO(Phase 3): Implement tag cloud and tag filtering
// TODO(Phase 3): Implement responsive sidebar navigation for desktop (>1024px)
// TODO(Phase 4): Add Cloudflare Workers API for server-side search

import router from './router.js';
import { renderDailyView } from './views/daily.js?v=20260521';
import { renderWeeklyView } from './views/weekly.js?v=20260521';
import { renderMonthlyView } from './views/monthly.js?v=20260521';
import { renderYearlyView } from './views/yearly.js?v=20260521';
import { createGiscusToggle } from './components/giscus.js';

// DOM Elements
let app, mainContent, navLinks, header, mobileMenu;

/**
 * Initialize the application
 */
function init() {
  app = document.getElementById('app');
  mainContent = document.getElementById('main-content');
  header = document.querySelector('.site-header');
  mobileMenu = document.querySelector('.mobile-menu');

  // Setup navigation
  setupNav();
  setupMobileNav();
  setupHeaderScroll();

  // Setup routes
  setupRoutes();

  // Initial route
  router.handleRoute();
}

/**
 * Setup navigation link handlers
 */
function setupNav() {
  navLinks = document.querySelectorAll('.nav-link');

  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const route = link.dataset.route;
      router.navigate(route);

      // Update active state
      updateActiveNav(route);

      // Close mobile menu
      if (mobileMenu) mobileMenu.classList.remove('open');
    });
  });
}

/**
 * Update active navigation state
 * @param {string} route
 */
function updateActiveNav(route) {
  navLinks.forEach(link => {
    const isActive = link.dataset.route === route;
    link.classList.toggle('active', isActive);
  });
}

/**
 * Setup mobile navigation toggle
 */
function setupMobileNav() {
  const toggle = document.querySelector('.nav-toggle');
  if (toggle && mobileMenu) {
    toggle.addEventListener('click', () => {
      mobileMenu.classList.toggle('open');
    });
  }

  // Close on link click
  mobileMenu?.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
      mobileMenu.classList.remove('open');
    });
  });
}

/**
 * Setup header scroll effect
 */
function setupHeaderScroll() {
  let lastScroll = 0;

  window.addEventListener('scroll', () => {
    const currentScroll = window.scrollY;

    if (currentScroll > 10) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }

    lastScroll = currentScroll;
  }, { passive: true });
}

/**
 * Setup all routes
 */
function setupRoutes() {
  // Daily view
  router.on('daily', async (params) => {
    updateActiveNav('daily');
    window.scrollTo(0, 0);
    await renderDailyView(mainContent, params);
  });

  // Weekly view
  router.on('weekly', async (params) => {
    updateActiveNav('weekly');
    window.scrollTo(0, 0);
    await renderWeeklyView(mainContent, params);
  });

  // Monthly view
  router.on('monthly', async (params) => {
    updateActiveNav('monthly');
    window.scrollTo(0, 0);
    await renderMonthlyView(mainContent, params);
  });

  // Yearly view
  router.on('yearly', async (params) => {
    updateActiveNav('yearly');
    window.scrollTo(0, 0);
    await renderYearlyView(mainContent, params);
  });
}

/**
 * Render skeleton view for upcoming features
 * @param {HTMLElement} container
 * @param {Object} config
 */
function renderSkeletonView(container, config) {
  container.innerHTML = `
    <div class="page">
      <div class="view-header animate-fade-in-up">
        <h1 class="view-title">${config.title}</h1>
      </div>
      <div class="coming-soon animate-fade-in-up" style="animation-delay: 100ms;">
        <div class="coming-soon-icon">${config.icon}</div>
        <h2 class="coming-soon-title">Coming Soon</h2>
        <p class="coming-soon-desc">${config.desc}</p>
      </div>
      <div class="giscus-section" style="margin-top: var(--space-8);">
        <div class="giscus-header">
          <h3 class="giscus-title">来聊聊</h3>
        </div>
        <div class="giscus-container" id="giscus-skeleton"></div>
      </div>
    </div>
  `;

  // Lazy load giscus for skeleton views using shared component
  const giscusHeader = container.querySelector('.giscus-header');
  if (giscusHeader) {
    const toggle = createGiscusToggle('giscus-skeleton', '展开评论区');
    toggle.style.marginTop = 'var(--space-2)';
    giscusHeader.appendChild(toggle);
  }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', init);

// Export for debugging
window.app = { router };
