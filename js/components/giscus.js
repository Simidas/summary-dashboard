/* ========================================
   Giscus Comment Section Component
   ======================================== */

import { GISCUS_CONFIG } from '../config.js';

/**
 * Create a Giscus toggle button with lazy-loaded comments
 * @param {string} containerId - unique container ID
 * @param {string} title - section title
 * @returns {HTMLElement} - the toggle button element
 */
export function createGiscusToggle(containerId, title = '展开评论区') {
  const toggle = document.createElement('button');
  toggle.className = 'giscus-toggle';
  toggle.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2 5.5C2 4.11929 3.11929 3 4.5 3H11.5C12.8807 3 14 4.11929 14 5.5V8.5C14 9.88071 12.8807 11 11.5 11H7L4 13V11H4.5C3.11929 11 2 9.88071 2 8.5V5.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    <span>${title}</span>
  `;

  toggle.addEventListener('click', () => {
    const container = document.getElementById(containerId);
    if (!container) return;

    // First click: inject giscus script
    if (!container.dataset.loaded) {
      const script = document.createElement('script');
      script.src = 'https://giscus.app/client.js';
      script.setAttribute('data-repo', GISCUS_CONFIG.repo);
      script.setAttribute('data-repo-id', GISCUS_CONFIG.repoId);
      script.setAttribute('data-category', GISCUS_CONFIG.category);
      script.setAttribute('data-category-id', GISCUS_CONFIG.categoryId);
      script.setAttribute('data-mapping', GISCUS_CONFIG.mapping);
      script.setAttribute('data-strict', GISCUS_CONFIG.strict);
      script.setAttribute('data-reactions-enabled', GISCUS_CONFIG.reactionsEnabled);
      script.setAttribute('data-emit-metadata', GISCUS_CONFIG.emitMetadata);
      script.setAttribute('data-input-position', GISCUS_CONFIG.inputPosition);
      script.setAttribute('data-theme', GISCUS_CONFIG.theme);
      script.setAttribute('data-lang', GISCUS_CONFIG.lang);
      script.setAttribute('data-loading', GISCUS_CONFIG.loading);
      script.setAttribute('data-anonymous', GISCUS_CONFIG.anonymous);
      script.crossOrigin = 'anonymous';
      script.async = true;
      container.appendChild(script);
      container.dataset.loaded = 'true';
      container.classList.add('open');
      toggle.querySelector('span').textContent = '收起评论区';
      return;
    }

    // Subsequent clicks: toggle visibility only
    const isOpen = container.classList.toggle('open');
    toggle.querySelector('span').textContent = isOpen ? '收起评论区' : '展开评论区';
  });

  return toggle;
}
