/* ========================================
   Giscus Comment Section Component
   ======================================== */

class GiscusComponent {
  constructor(container, options = {}) {
    this.container = container;
    this.options = {
      repo: 'Simidas/summary-dashboard',
      repoId: '', // Will be filled when initialized at giscus.app
      category: 'Daily Summaries',
      categoryId: '', // Will be filled when initialized at giscus.app
      mapping: 'pathname',
      strict: '0',
      reactionsEnabled: '1',
      emitMetadata: '0',
      inputPosition: 'top',
      theme: 'light',
      lang: 'zh-CN',
      enableAnonymous: 'true', // Enable anonymous comments
      ...options
    };
    this.loaded = false;
  }

  /**
   * Render the giscus component
   */
  render() {
    if (this.loaded) return;

    const script = document.createElement('script');
    script.src = 'https://giscus.app/client.js';
    script.setAttribute('data-repo', this.options.repo);
    script.setAttribute('data-repo-id', this.options.repoId || 'R_kgDOOnE6Kw');
    script.setAttribute('data-category', this.options.category);
    script.setAttribute('data-category-id', this.options.categoryId || 'DIC_kwDOOnE6K84CpdX-');
    script.setAttribute('data-mapping', this.options.mapping);
    script.setAttribute('data-strict', this.options.strict);
    script.setAttribute('data-reactions-enabled', this.options.reactionsEnabled);
    script.setAttribute('data-emit-metadata', this.options.emitMetadata);
    script.setAttribute('data-input-position', this.options.inputPosition);
    script.setAttribute('data-theme', this.options.theme);
    script.setAttribute('data-lang', this.options.lang);
    script.setAttribute('data-anonymous', this.options.enableAnonymous);
    script.crossOrigin = 'anonymous';
    script.async = true;

    this.container.innerHTML = '';
    this.container.classList.add('loaded');
    this.container.appendChild(script);
    this.loaded = true;
  }

  /**
   * Update theme based on site theme
   * @param {string} theme - light or dark
   */
  updateTheme(theme) {
    this.options.theme = theme;
    if (this.loaded) {
      const iframe = this.container.querySelector('iframe');
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage(
          { giscus: { setConfig: { theme } } },
          'https://giscus.app'
        );
      }
    }
  }
}

/**
 * Create giscus section HTML structure
 * @param {string} title - section title
 * @returns {{ wrapper: HTMLElement, container: HTMLElement, toggle: HTMLElement }}
 */
export function createGiscusSection(title = '来聊聊这篇复盘吧') {
  const wrapper = document.createElement('div');
  wrapper.className = 'giscus-section';

  const header = document.createElement('div');
  header.className = 'giscus-header';

  const giscusTitle = document.createElement('h3');
  giscusTitle.className = 'giscus-title';
  giscusTitle.textContent = title;

  const toggle = document.createElement('button');
  toggle.className = 'giscus-toggle';
  toggle.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2 5.5C2 4.11929 3.11929 3 4.5 3H11.5C12.8807 3 14 4.11929 14 5.5V8.5C14 9.88071 12.8807 11 11.5 11H7L4 13V11H4.5C3.11929 11 2 9.88071 2 8.5V5.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    <span>展开评论区</span>
  `;

  const container = document.createElement('div');
  container.className = 'giscus-container';
  container.id = 'giscus-container';

  header.appendChild(giscusTitle);
  header.appendChild(toggle);
  wrapper.appendChild(header);
  wrapper.appendChild(container);

  // Toggle click handler
  let giscusInstance = null;
  toggle.addEventListener('click', () => {
    if (!container.classList.contains('loaded')) {
      giscusInstance = new GiscusComponent(container);
      giscusInstance.render();
      toggle.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M4 6L8 10L12 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span>收起评论区</span>
      `;
    } else {
      container.classList.toggle('loaded');
      const isLoaded = container.classList.contains('loaded');
      toggle.querySelector('span').textContent = isLoaded ? '收起评论区' : '展开评论区';
    }
  });

  return { wrapper, container, toggle };
}

export { GiscusComponent };
