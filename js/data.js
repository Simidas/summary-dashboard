/* ========================================
   Data Loading & Caching
   ======================================== */

// TODO(Phase 2): Preload adjacent data for smoother navigation
// TODO(Phase 4): Migrate to Cloudflare Workers API for dynamic queries

// In-memory cache
const cache = {
  daily: {},
  weekly: {},
  monthly: {},
  yearly: {},
  domains: {},
  projects: {},
  followups: {},
  content: {},
  diary: {},
  insights: {}
};

// Track if we've scanned the directory (for static hosting without server)
let _availableDates = null;
let _availableWeeks = null;
let _availableMonths = null;
let _availableYears = null;

async function loadJson(path, cacheBucket, cacheKey) {
  if (cacheBucket && cacheBucket[cacheKey]) {
    return cacheBucket[cacheKey];
  }

  try {
    const response = await fetch(path);
    if (!response.ok) return null;
    const data = await response.json();
    if (cacheBucket) cacheBucket[cacheKey] = data;
    return data;
  } catch (e) {
    console.warn(`Failed to load ${path}:`, e);
    return null;
  }
}

/**
 * Scan directory for available JSON files (via fetch attempt)
 * Since we're on static hosting, we'll try to get the list from the server
 * Fallback: scan using a known pattern
 * @returns {Promise<string[]>}
 */
async function scanAvailableDailyDates() {
  if (_availableDates) return _availableDates;

  try {
    const response = await fetch('data/records/daily/manifest.json');
    if (response.ok) {
      const manifest = await response.json();
      _availableDates = manifest.dates || [];
      return _availableDates;
    }
  } catch (e) {
    // manifest doesn't exist, fall through to date probing
  }
  
  // Fallback: try to fetch known manual records (last 30 days).
  const dates = [];
  const today = new Date();
  const allChecks = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    allChecks.push({ dateStr, promise: fetch(`data/records/daily/${dateStr}.json`) });
  }

  // Batch in groups of 6 to avoid browser connection limit
  const BATCH_SIZE = 6;
  for (let i = 0; i < allChecks.length; i += BATCH_SIZE) {
    const batch = allChecks.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(({ dateStr, promise }) =>
        Promise.race([
          promise.then(r => r.ok ? dateStr : null).catch(() => null),
          new Promise(resolve => setTimeout(() => resolve(null), 3000))
        ])
      )
    );
    dates.push(...results.filter(Boolean));
  }

  _availableDates = dates.sort().reverse();
  return _availableDates;
}

/**
 * Scan available weekly summaries
 * @returns {Promise<string[]>}
 */
async function scanAvailableWeeks() {
  if (_availableWeeks) return _availableWeeks;
  
  try {
    const response = await fetch('data/summaries/weekly/manifest.json');
    if (response.ok) {
      const manifest = await response.json();
      _availableWeeks = manifest.weeks || [];
      return _availableWeeks;
    }
  } catch (e) {}
  
  // Fallback: try W01-W53 for recent years — batched parallel with timeout
  const weeks = [];
  const years = [2026];
  years.forEach(year => {
    for (let w = 1; w <= 53; w++) {
      const weekStr = `${year}-W${String(w).padStart(2, '0')}`;
      weeks.push(weekStr);
    }
  });
  
  // Filter to only existing ones — batched parallel with timeout
  const BATCH_SIZE = 6;
  const existingWeeks = [];
  for (let i = 0; i < weeks.length; i += BATCH_SIZE) {
    const batch = weeks.slice(i, i + BATCH_SIZE);
    const checks = batch.map(week =>
      Promise.race([
        fetch(`data/summaries/weekly/${week}.json`).then(r => r.ok ? week : null).catch(() => null),
        new Promise(resolve => setTimeout(() => resolve(null), 3000))
      ])
    );
    const results = await Promise.all(checks);
    existingWeeks.push(...results.filter(Boolean));
  }
  _availableWeeks = existingWeeks;
  return _availableWeeks;
}

/**
 * Scan available monthly summaries
 * @returns {Promise<string[]>}
 */
async function scanAvailableMonths() {
  if (_availableMonths) return _availableMonths;
  
  try {
    const response = await fetch('data/summaries/monthly/manifest.json');
    if (response.ok) {
      const manifest = await response.json();
      _availableMonths = manifest.months || [];
      return _availableMonths;
    }
  } catch (e) {}
  
  // Fallback: try 2026-01 to 2026-12 — batched parallel with timeout
  const months = [];
  for (let m = 1; m <= 12; m++) {
    const monthStr = `2026-${String(m).padStart(2, '0')}`;
    months.push(monthStr);
  }
  
  const BATCH_SIZE = 6;
  const existingMonths = [];
  for (let i = 0; i < months.length; i += BATCH_SIZE) {
    const batch = months.slice(i, i + BATCH_SIZE);
    const checks = batch.map(month =>
      Promise.race([
        fetch(`data/summaries/monthly/${month}.json`).then(r => r.ok ? month : null).catch(() => null),
        new Promise(resolve => setTimeout(() => resolve(null), 3000))
      ])
    );
    const results = await Promise.all(checks);
    existingMonths.push(...results.filter(Boolean));
  }
  _availableMonths = existingMonths;
  return _availableMonths;
}

/**
 * Scan available yearly summaries
 * @returns {Promise<string[]>}
 */
async function scanAvailableYears() {
  if (_availableYears) return _availableYears;
  
  try {
    const response = await fetch('data/summaries/yearly/manifest.json');
    if (response.ok) {
      const manifest = await response.json();
      _availableYears = manifest.years || [];
      return _availableYears;
    }
  } catch (e) {}
  
  // Fallback: try 2026 — batched parallel with timeout
  const years = ['2026'];
  const BATCH_SIZE = 6;
  const existingYears = [];
  for (let i = 0; i < years.length; i += BATCH_SIZE) {
    const batch = years.slice(i, i + BATCH_SIZE);
    const checks = batch.map(year =>
      Promise.race([
        fetch(`data/summaries/yearly/${year}.json`).then(r => r.ok ? year : null).catch(() => null),
        new Promise(resolve => setTimeout(() => resolve(null), 3000))
      ])
    );
    const results = await Promise.all(checks);
    existingYears.push(...results.filter(Boolean));
  }
  _availableYears = existingYears;
  return _availableYears;
}

/**
 * Load daily record JSON
 * @param {string} dateStr - YYYY-MM-DD
 * @returns {Promise<Object|null>}
 */
export async function loadDailySummary(dateStr) {
  if (cache.daily[dateStr]) {
    return cache.daily[dateStr];
  }

  try {
    const response = await fetch(`data/records/daily/${dateStr}.json`);
    if (!response.ok) return null;
    const data = await response.json();
    cache.daily[dateStr] = data;
    return data;
  } catch (e) {
    console.warn(`Failed to load daily record for ${dateStr}:`, e);
    return null;
  }
}

/**
 * Load multiple daily records
 * @param {string[]} dateStrs - array of YYYY-MM-DD
 * @returns {Promise<Object[]>}
 */
export async function loadDailySummaries(dateStrs) {
  if (!dateStrs || !Array.isArray(dateStrs)) {
    console.error('loadDailySummaries: dateStrs is not an array', dateStrs);
    return [];
  }
  const results = [];
  for (const dateStr of dateStrs) {
    const data = await loadDailySummary(dateStr);
    if (data) results.push(data);
  }
  return results;
}

/**
 * Get available daily record dates
 * Scans actual JSON files in data/records/daily/
 * @returns {Promise<string[]>}
 */
export async function getAvailableDailyDates() {
  const dates = await scanAvailableDailyDates();
  // Return last 14 days that have data
  if (!Array.isArray(dates)) {
    console.error('getAvailableDailyDates: unexpected return type', dates);
    return [];
  }
  return dates.slice(0, 14);
}

/**
 * Load weekly summary
 * @param {string} weekStr - YYYY-WXX
 * @returns {Promise<Object|null>}
 */
export async function loadWeeklySummary(weekStr) {
  if (cache.weekly[weekStr]) {
    return cache.weekly[weekStr];
  }

  try {
    const response = await fetch(`data/summaries/weekly/${weekStr}.json`);
    if (!response.ok) return null;
    const data = await response.json();
    cache.weekly[weekStr] = data;
    return data;
  } catch (e) {
    return null;
  }
}

/**
 * Load multiple weekly summaries
 * @param {string[]} weekStrs
 * @returns {Promise<Object[]>}
 */
export async function loadWeeklySummaries(weekStrs) {
  const results = [];
  for (const weekStr of weekStrs) {
    const data = await loadWeeklySummary(weekStr);
    if (data) results.push(data);
  }
  return results;
}

/**
 * Get available weekly summary dates
 * @returns {Promise<string[]>}
 */
export async function getAvailableWeeks() {
  return scanAvailableWeeks();
}

/**
 * Load monthly summary
 * @param {string} monthStr - YYYY-MM
 * @returns {Promise<Object|null>}
 */
export async function loadMonthlySummary(monthStr) {
  if (cache.monthly[monthStr]) {
    return cache.monthly[monthStr];
  }

  try {
    const response = await fetch(`data/summaries/monthly/${monthStr}.json`);
    if (!response.ok) return null;
    const data = await response.json();
    cache.monthly[monthStr] = data;
    return data;
  } catch (e) {
    return null;
  }
}

/**
 * Load multiple monthly summaries
 * @param {string[]} monthStrs
 * @returns {Promise<Object[]>}
 */
export async function loadMonthlySummaries(monthStrs) {
  const results = [];
  for (const monthStr of monthStrs) {
    const data = await loadMonthlySummary(monthStr);
    if (data) results.push(data);
  }
  return results;
}

/**
 * Get available monthly summary dates
 * @returns {Promise<string[]>}
 */
export async function getAvailableMonths() {
  return scanAvailableMonths();
}

/**
 * Load yearly summary
 * @param {string} yearStr - YYYY
 * @returns {Promise<Object|null>}
 */
export async function loadYearlySummary(yearStr) {
  if (cache.yearly[yearStr]) {
    return cache.yearly[yearStr];
  }

  try {
    const response = await fetch(`data/summaries/yearly/${yearStr}.json`);
    if (!response.ok) return null;
    const data = await response.json();
    cache.yearly[yearStr] = data;
    return data;
  } catch (e) {
    return null;
  }
}

/**
 * Get available yearly summaries
 * @returns {Promise<string[]>}
 */
export async function getAvailableYears() {
  return scanAvailableYears();
}

export async function loadDomainOverview() {
  return loadJson('data/summaries/domains/overview.json', cache.domains, 'overview');
}

export async function loadDomainSummary(domain) {
  return loadJson(`data/summaries/domains/${domain}.json`, cache.domains, domain);
}

export async function loadProjectsManifest() {
  return loadJson('data/summaries/projects/manifest.json', cache.projects, 'manifest');
}

export async function loadProjectSummary(slug) {
  return loadJson(`data/summaries/projects/${slug}.json`, cache.projects, slug);
}

export async function loadOpenFollowups() {
  return loadJson('data/summaries/followups/open.json', cache.followups, 'open');
}

export async function loadContentSeeds() {
  return loadJson('data/summaries/content/seeds.json', cache.content, 'seeds');
}

export async function loadWeeklyInsight(weekStr) {
  return loadJson(`data/summaries/insights/weekly/${weekStr}.json`, cache.insights, weekStr);
}

export async function loadDiaryManifest() {
  return loadJson('data/records/diary/manifest.json', cache.diary, 'manifest');
}

export async function loadDiaryEntry(id) {
  return loadJson(`data/records/diary/${id}.json`, cache.diary, id);
}

export async function loadDiaryEntries() {
  const manifest = await loadDiaryManifest();
  const entries = manifest?.entries || [];
  const loaded = [];

  for (const id of entries) {
    const entry = await loadDiaryEntry(id);
    if (entry) loaded.push(entry);
  }

  return loaded;
}

/**
 * Clear all cache
 */
export function clearCache() {
  cache.daily = {};
  cache.weekly = {};
  cache.monthly = {};
  cache.yearly = {};
  cache.domains = {};
  cache.projects = {};
  cache.followups = {};
  cache.content = {};
  cache.diary = {};
  cache.insights = {};
}
