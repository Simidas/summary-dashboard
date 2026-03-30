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

// Track if we've scanned the directory (for static hosting without server)
let _availableDates = null;
let _availableWeeks = null;
let _availableMonths = null;
let _availableYears = null;

/**
 * Scan directory for available JSON files (via fetch attempt)
 * Since we're on static hosting, we'll try to get the list from the server
 * Fallback: scan using a known pattern
 * @returns {Promise<string[]>}
 */
async function scanAvailableDailyDates() {
  if (_availableDates) return _availableDates;
  
  // For static sites, we need to know the available dates upfront
  // Try to load a manifest file if it exists
  try {
    const response = await fetch('data/summaries/daily/manifest.json');
    if (response.ok) {
      const manifest = await response.json();
      _availableDates = manifest.dates || [];
      return _availableDates;
    }
  } catch (e) {
    // manifest doesn't exist, fall through
  }
  
  // Fallback: try to fetch known dates (last 30 days)
  const dates = [];
  const today = new Date();
  for (let i = 0; i < 30; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    try {
      const response = await fetch(`data/summaries/daily/${dateStr}.json`);
      if (response.ok) {
        dates.push(dateStr);
      }
    } catch (e) {
      // Date doesn't exist
    }
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
  
  // Fallback: try W01-W52 for recent years
  const weeks = [];
  const years = [2026];
  years.forEach(year => {
    for (let w = 1; w <= 53; w++) {
      const weekStr = `${year}-W${String(w).padStart(2, '0')}`;
      weeks.push(weekStr);
    }
  });
  
  // Filter to only existing ones
  const existing = [];
  for (const week of weeks) {
    try {
      const response = await fetch(`data/summaries/weekly/${week}.json`);
      if (response.ok) existing.push(week);
    } catch (e) {}
  }
  _availableWeeks = existing;
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
  
  // Fallback: try 2026-01 to 2026-12
  const months = [];
  for (let m = 1; m <= 12; m++) {
    const monthStr = `2026-${String(m).padStart(2, '0')}`;
    months.push(monthStr);
  }
  
  const existing = [];
  for (const month of months) {
    try {
      const response = await fetch(`data/summaries/monthly/${month}.json`);
      if (response.ok) existing.push(month);
    } catch (e) {}
  }
  _availableMonths = existing;
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
  
  // Fallback: try 2026
  const years = ['2026'];
  const existing = [];
  for (const year of years) {
    try {
      const response = await fetch(`data/summaries/yearly/${year}.json`);
      if (response.ok) existing.push(year);
    } catch (e) {}
  }
  _availableYears = existing;
  return _availableYears;
}

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
 * Get available daily summary dates
 * Scans actual JSON files in data/summaries/daily/
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

/**
 * Clear all cache
 */
export function clearCache() {
  cache.daily = {};
  cache.weekly = {};
  cache.monthly = {};
  cache.yearly = {};
}
