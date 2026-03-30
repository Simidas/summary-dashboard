/* ========================================
   Data Loading & Caching
   ======================================== */

// In-memory cache
const cache = {
  daily: {},
  weekly: {},
  monthly: {},
  yearly: {}
};

/**
 * Load daily summary JSON
 * @param {string} dateStr - YYYY-MM-DD
 * @returns {Promise<Object|null>}
 */
export async function loadDailySummary(dateStr) {
  if (cache.daily[dateStr]) {
    return cache.daily[dateStr];
  }

  try {
    const response = await fetch(`data/summaries/daily/${dateStr}.json`);
    if (!response.ok) return null;
    const data = await response.json();
    cache.daily[dateStr] = data;
    return data;
  } catch (e) {
    console.warn(`Failed to load daily summary for ${dateStr}:`, e);
    return null;
  }
}

/**
 * Load multiple daily summaries
 * @param {string[]} dateStrs - array of YYYY-MM-DD
 * @returns {Promise<Object[]>}
 */
export async function loadDailySummaries(dateStrs) {
  const results = [];
  for (const dateStr of dateStrs) {
    const data = await loadDailySummary(dateStr);
    if (data) results.push(data);
  }
  return results;
}

/**
 * Get available daily summary files
 * Note: For MVP, we hardcode the demo dates
 * In production, this would scan the directory
 * @returns {string[]}
 */
export function getAvailableDailyDates() {
  // Demo data: last 3 days including today
  const dates = [];
  const today = new Date();
  for (let i = 0; i < 3; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
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
 * Clear all cache
 */
export function clearCache() {
  cache.daily = {};
  cache.weekly = {};
  cache.monthly = {};
  cache.yearly = {};
}
