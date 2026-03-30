/* ========================================
   Main Application Entry
   ======================================== */

import router from './router.js';
import { renderDailyView } from './views/daily.js';
import { createGiscusSection } from './components/giscus.js';

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

  // Weekly view (skeleton)
  router.on('weekly', (params) => {
    updateActiveNav('weekly');
    window.scrollTo(0, 0);
    renderSkeletonView(mainContent, {
      title: 'Weekly 视图',
      desc: '周聚合功能即将上线，敬请期待...',
      icon: '📅'
    });
  });

  // Monthly view (skeleton)
  router.on('monthly', (params) => {
    updateActiveNav('monthly');
    window.scrollTo(0, 0);
    renderSkeletonView(mainContent, {
      title: 'Monthly 视图',
      desc: '月聚合功能即将上线，敬请期待...',
      icon: '📆'
    });
  });

  // Yearly view (skeleton)
  router.on('yearly', (params) => {
    updateActiveNav('yearly');
    window.scrollTo(0, 0);
    renderSkeletonView(mainContent, {
      title: 'Yearly 视图',
      desc: '年聚合功能即将上线，敬请期待...',
      icon: '🗓️'
    });
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
        <div class="giscus-container" id="giscus-container"></div>
      </div>
    </div>
  `;

  // Lazy load giscus for skeleton views
  const giscusContainer = container.querySelector('#giscus-container');
  if (giscusContainer) {
    const toggle = document.createElement('button');
    toggle.className = 'giscus-toggle';
    toggle.style.marginTop = 'var(--space-2)';
    toggle.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M2 5.5C2 4.11929 3.11929 3 4.5 3H11.5C12.8807 3 14 4.11929 14 5.5V8.5C14 9.88071 12.8807 11 11.5 11H7L4 13V11H4.5C3.11929 11 2 9.88071 2 8.5V5.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span>展开评论区</span>
    `;

    toggle.addEventListener('click', () => {
      if (!giscusContainer.classList.contains('loaded')) {
        const script = document.createElement('script');
        script.src = 'https://giscus.app/client.js';
        script.setAttribute('data-repo', 'Simidas/summary-dashboard');
        script.setAttribute('data-repo-id', 'R_kgDOOnE6Kw');
        script.setAttribute('data-category', 'Daily Summaries');
        script.setAttribute('data-category-id', 'DIC_kwDOOnE6K84CpdX-');
        script.setAttribute('data-mapping', 'pathname');
        script.setAttribute('data-strict', '0');
        script.setAttribute('data-reactions-enabled', '1');
        script.setAttribute('data-emit-metadata', '0');
        script.setAttribute('data-input-position', 'top');
        script.setAttribute('data-theme', 'light');
        script.setAttribute('data-lang', 'zh-CN');
        script.setAttribute('data-anonymous', 'true');
        script.crossOrigin = 'anonymous';
        script.async = true;
        giscusContainer.appendChild(script);
        giscusContainer.classList.add('loaded');
        toggle.querySelector('span').textContent = '收起评论区';
      } else {
        giscusContainer.classList.toggle('loaded');
        const isLoaded = giscusContainer.classList.contains('loaded');
        toggle.querySelector('span').textContent = isLoaded ? '收起评论区' : '展开评论区';
      }
    });

    giscusContainer.parentNode.insertBefore(toggle, giscusContainer);
  }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', init);

// Export for debugging
window.app = { router };
