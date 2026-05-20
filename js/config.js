/* ========================================
   Global Configuration
   ======================================== */

/**
 * Giscus configuration — single source of truth
 * All views should import from here instead of hardcoding
 */
export const GISCUS_CONFIG = {
  repo: 'Simidas/summary-dashboard',
  repoId: 'R_kgDOR0YGCw',
  category: 'General',
  categoryId: 'DIC_kwDOR0YGC84C5mS9',
  mapping: 'pathname',
  strict: '0',
  reactionsEnabled: '1',
  emitMetadata: '0',
  inputPosition: 'top',
  theme: 'preferred_color_scheme',
  lang: 'zh-CN',
  loading: 'lazy',
  anonymous: 'true'
};

/**
 * Site metadata
 */
export const SITE = {
  name: '复盘',
  description: '个人 AI 复盘展示站 — 每天种下一行记录，到了年底回头看，是一片金色的收成。',
  url: 'https://summary.zhuwd.com',
  github: 'https://github.com/Simidas/summary-dashboard'
};

/**
 * View display names
 */
export const VIEW_NAMES = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly'
};
