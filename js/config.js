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
  mapping: 'url',
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
  description: '个人经营复盘系统 — 用每日综合记录驱动主业、副业、生活和内容产出。',
  url: 'https://summary.zhuwd.com',
  github: 'https://github.com/Simidas/summary-dashboard'
};

/**
 * View display names
 */
export const VIEW_NAMES = {
  home: 'Home',
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
  records: 'Records',
  projects: 'Projects',
  diary: 'Diary',
  content: 'Content'
};
