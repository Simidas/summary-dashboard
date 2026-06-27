/* ========================================
   Main Application Entry
   ======================================== */

// TODO(Phase 3): Implement search with Ctrl+K / '/' shortcut
// TODO(Phase 3): Implement tag cloud and tag filtering
// TODO(Phase 3): Implement responsive sidebar navigation for desktop (>1024px)
// TODO(Phase 4): Add Cloudflare Workers API for server-side search

import router from './router.js?v=20260626o';
import { initAuth, mountAuthControls } from './auth.js?v=20260626o';

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
  mountAuthControls(document.getElementById('auth-controls'));

  // Setup navigation
  setupNav();
  setupMobileNav();
  setupHeaderScroll();

  // Setup routes
  setupRoutes();

  // Initial route. Auth is optional: static preview should still work.
  initAuth().finally(() => router.handleRoute());
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

async function renderRoute(activeRoute, params, loader, renderName) {
  updateActiveNav(activeRoute);
  window.scrollTo(0, 0);

  try {
    const module = await loader();
    await module[renderName](mainContent, params);
  } catch (error) {
    console.error(`Failed to render route ${activeRoute}:`, error);
    mainContent.innerHTML = `
      <div class="page">
        <div class="empty-state">
          <div class="empty-state-icon">!</div>
          <p class="empty-state-text">页面加载失败，请刷新后重试。</p>
        </div>
      </div>
    `;
  }
}

/**
 * Setup all routes
 */
function setupRoutes() {
  // Home view
  router.on('home', async (params) => {
    await renderRoute('home', params, () => import('./views/home.js?v=20260626o'), 'renderHomeView');
  });

  // Daily view
  router.on('daily', async (params) => {
    await renderRoute('daily', params, () => import('./views/daily.js?v=20260626o'), 'renderDailyView');
  });

  // Weekly view
  router.on('weekly', async (params) => {
    await renderRoute('weekly', params, () => import('./views/weekly.js?v=20260626o'), 'renderWeeklyView');
  });

  // Monthly view
  router.on('monthly', async (params) => {
    await renderRoute('monthly', params, () => import('./views/monthly.js?v=20260626o'), 'renderMonthlyView');
  });

  // Yearly view
  router.on('yearly', async (params) => {
    await renderRoute('yearly', params, () => import('./views/yearly.js?v=20260626o'), 'renderYearlyView');
  });

  router.on('domain', async (params) => {
    await renderRoute('', params, () => import('./views/domain.js?v=20260626o'), 'renderDomainView');
  });

  router.on('projects', async (params) => {
    await renderRoute('projects', params, () => import('./views/projects.js?v=20260626o'), 'renderProjectsView');
  });

  router.on('diary', async (params) => {
    await renderRoute('diary', params, () => import('./views/diary.js?v=20260626o'), 'renderDiaryView');
  });

  router.on('content', async (params) => {
    await renderRoute('content', params, () => import('./views/content.js?v=20260626o'), 'renderContentView');
  });
}

// Initialize on DOM ready. Some browser restore/cache paths can evaluate
// the module after DOMContentLoaded has already fired.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Export for debugging
window.app = { router };
