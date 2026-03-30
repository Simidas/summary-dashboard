#!/usr/bin/env node
/**
 * Aggregate Daily Summaries into Weekly/Monthly/Yearly JSON files
 * 
 * Usage: node scripts/aggregate.js
 * 
 * Scans data/summaries/daily/ for all JSON files, then generates:
 * - data/summaries/weekly/YYYY-WXX.json
 * - data/summaries/monthly/YYYY-MM.json
 * - data/summaries/yearly/YYYY.json
 */

const fs = require('fs');
const path = require('path');

// Directories
const ROOT_DIR = path.join(__dirname, '..');
const DAILY_DIR = path.join(ROOT_DIR, 'data', 'summaries', 'daily');
const WEEKLY_DIR = path.join(ROOT_DIR, 'data', 'summaries', 'weekly');
const MONTHLY_DIR = path.join(ROOT_DIR, 'data', 'summaries', 'monthly');
const YEARLY_DIR = path.join(ROOT_DIR, 'data', 'summaries', 'yearly');

// Ensure directories exist
[WEEKLY_DIR, MONTHLY_DIR, YEARLY_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

/**
 * Get ISO week number
 * @param {Date} date
 * @returns {number}
 */
function getISOWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

/**
 * Get month name in Chinese
 * @param {number} month - 0-indexed
 * @returns {string}
 */
function getMonthName(month) {
  const names = ['一月', '二月', '三月', '四月', '五月', '六月',
                 '七月', '八月', '九月', '十月', '十一月', '十二月'];
  return names[month];
}

/**
 * Parse date string to Date object
 * @param {string} dateStr - YYYY-MM-DD
 * @returns {Date}
 */
function parseDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Format date as YYYY-MM-DD
 * @param {Date} date
 * @returns {string}
 */
function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Get week string YYYY-WXX
 * @param {string} dateStr
 * @returns {string}
 */
function getWeekString(dateStr) {
  const date = parseDate(dateStr);
  const year = date.getFullYear();
  const week = getISOWeek(date);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/**
 * Get month string YYYY-MM
 * @param {string} dateStr
 * @returns {string}
 */
function getMonthString(dateStr) {
  return dateStr.substring(0, 7);
}

/**
 * Get year string YYYY
 * @param {string} dateStr
 * @returns {string}
 */
function getYearString(dateStr) {
  return dateStr.substring(0, 4);
}

/**
 * Get date range for a week
 * @param {string} yearWeekStr - YYYY-WXX
 * @returns {string}
 */
function getWeekDateRange(yearWeekStr) {
  const [year, weekStr] = yearWeekStr.split('-W');
  const yearNum = parseInt(year, 10);
  const weekNum = parseInt(weekStr, 10);
  
  // Find first day of year
  const firstDayOfYear = new Date(yearNum, 0, 1);
  // Get to the Monday of that week
  const dayOfWeek = firstDayOfYear.getDay() || 7;
  const daysToMonday = dayOfWeek - 1;
  const firstMonday = new Date(firstDayOfYear);
  firstMonday.setDate(firstDayOfYear.getDate() - daysToMonday);
  
  // Add (weekNum - 1) weeks
  const weekStart = new Date(firstMonday);
  weekStart.setDate(firstMonday.getDate() + (weekNum - 1) * 7);
  
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  
  return `${formatDate(weekStart)} ~ ${formatDate(weekEnd)}`;
}

/**
 * Count array item frequencies
 * @param {string[]} arr
 * @returns {Map<string, number>}
 */
function countFrequencies(arr) {
  const freq = new Map();
  arr.forEach(item => {
    freq.set(item, (freq.get(item) || 0) + 1);
  });
  return freq;
}

/**
 * Get top N items by frequency
 * @param {Map<string, number>} freqMap
 * @param {number} n
 * @returns {string[]}
 */
function getTopN(freqMap, n = 5) {
  return Array.from(freqMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([item]) => item);
}

/**
 * Load all daily summaries
 * @returns {Object[]}
 */
function loadDailySummaries() {
  if (!fs.existsSync(DAILY_DIR)) {
    console.log(`Daily directory not found: ${DAILY_DIR}`);
    return [];
  }
  
  const files = fs.readdirSync(DAILY_DIR).filter(f => f.endsWith('.json'));
  const summaries = [];
  
  files.forEach(file => {
    const filePath = path.join(DAILY_DIR, file);
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(content);
      summaries.push(data);
    } catch (e) {
      console.warn(`Failed to load ${file}: ${e.message}`);
    }
  });
  
  // Sort by date
  summaries.sort((a, b) => a.date.localeCompare(b.date));
  return summaries;
}

/**
 * Aggregate into weekly summaries
 * @param {Object[]} dailySummaries
 */
function aggregateWeekly(dailySummaries) {
  const byWeek = new Map();
  
  dailySummaries.forEach(day => {
    const weekStr = getWeekString(day.date);
    if (!byWeek.has(weekStr)) {
      byWeek.set(weekStr, []);
    }
    byWeek.get(weekStr).push(day);
  });
  
  byWeek.forEach((days, weekStr) => {
    const dates = days.map(d => d.date).sort();
    const dateRange = getWeekDateRange(weekStr);
    
    // Aggregate stats
    let totalAchievements = 0;
    let totalDiscussions = 0;
    let totalFollowUps = 0;
    const allProjects = [];
    const allTags = [];
    let contentPublished = 0;
    
    days.forEach(d => {
      totalAchievements += (d.achievements || []).length;
      totalDiscussions += (d.discussions || []).length;
      totalFollowUps += (d.followUps || []).length;
      allProjects.push(...(d.projects || []));
      allTags.push(...(d.tags || []));
      if (d.contentCreated) contentPublished++;
    });
    
    const projectFreq = countFrequencies(allProjects);
    const tagFreq = countFrequencies(allTags);
    
    const weekData = {
      year: parseInt(weekStr.substring(0, 4), 10),
      week: weekStr.split('-')[1],
      dateRange,
      days: days.length,
      totalAchievements,
      totalDiscussions,
      totalFollowUps,
      topProjects: getTopN(projectFreq, 3),
      topTags: getTopN(tagFreq, 5),
      contentPublished,
      dailyRecords: dates
    };
    
    const outputPath = path.join(WEEKLY_DIR, `${weekStr}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(weekData, null, 2), 'utf-8');
    console.log(`Generated: ${outputPath}`);
  });
}

/**
 * Aggregate into monthly summaries
 * @param {Object[]} dailySummaries
 */
function aggregateMonthly(dailySummaries) {
  const byMonth = new Map();
  
  dailySummaries.forEach(day => {
    const monthStr = getMonthString(day.date);
    if (!byMonth.has(monthStr)) {
      byMonth.set(monthStr, []);
    }
    byMonth.get(monthStr).push(day);
  });
  
  byMonth.forEach((days, monthStr) => {
    const [yearStr, monthNum] = monthStr.split('-');
    const monthName = getMonthName(parseInt(monthNum, 10) - 1);
    
    // Get unique weeks
    const weeks = [...new Set(days.map(d => getWeekString(d.date)))].sort();
    
    // Aggregate stats
    let totalAchievements = 0;
    let totalDiscussions = 0;
    const allProjects = [];
    const allTags = [];
    let contentPublished = 0;
    
    days.forEach(d => {
      totalAchievements += (d.achievements || []).length;
      totalDiscussions += (d.discussions || []).length;
      allProjects.push(...(d.projects || []));
      allTags.push(...(d.tags || []));
      if (d.contentCreated) contentPublished++;
    });
    
    const projectFreq = countFrequencies(allProjects);
    const tagFreq = countFrequencies(allTags);
    
    const monthData = {
      year: parseInt(yearStr, 10),
      month: monthNum,
      monthName,
      totalAchievements,
      totalDiscussions,
      weeks: weeks.map(w => w.split('-')[1]), // Just WXX
      topProjects: getTopN(projectFreq, 3),
      topTags: getTopN(tagFreq, 5),
      contentPublished
    };
    
    const outputPath = path.join(MONTHLY_DIR, `${monthStr}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(monthData, null, 2), 'utf-8');
    console.log(`Generated: ${outputPath}`);
  });
}

/**
 * Aggregate into yearly summaries
 * @param {Object[]} dailySummaries
 */
function aggregateYearly(dailySummaries) {
  const byYear = new Map();
  
  dailySummaries.forEach(day => {
    const yearStr = getYearString(day.date);
    if (!byYear.has(yearStr)) {
      byYear.set(yearStr, []);
    }
    byYear.get(yearStr).push(day);
  });
  
  byYear.forEach((days, yearStr) => {
    // Get unique months
    const months = [...new Set(days.map(d => getMonthString(d.date)))].sort();
    
    // Aggregate stats
    let totalAchievements = 0;
    const allProjects = new Set();
    let totalContentPublished = 0;
    const allTags = [];
    
    days.forEach(d => {
      totalAchievements += (d.achievements || []).length;
      (d.projects || []).forEach(p => allProjects.add(p));
      allTags.push(...(d.tags || []));
      if (d.contentCreated) totalContentPublished++;
    });
    
    const tagFreq = countFrequencies(allTags);
    
    const yearData = {
      year: parseInt(yearStr, 10),
      totalAchievements,
      totalProjects: allProjects.size,
      totalContentPublished,
      topTags: getTopN(tagFreq, 5),
      months
    };
    
    const outputPath = path.join(YEARLY_DIR, `${yearStr}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(yearData, null, 2), 'utf-8');
    console.log(`Generated: ${outputPath}`);
  });
}

/**
 * Main function
 */
function main() {
  console.log('=== Summary Dashboard Aggregation ===');
  console.log(`Daily dir: ${DAILY_DIR}`);
  console.log('');
  
  const summaries = loadDailySummaries();
  console.log(`Loaded ${summaries.length} daily summaries`);
  
  if (summaries.length === 0) {
    console.log('No summaries found. Skipping aggregation.');
    return;
  }
  
  const dateRange = `${summaries[0].date} to ${summaries[summaries.length - 1].date}`;
  console.log(`Date range: ${dateRange}`);
  console.log('');
  
  console.log('Generating weekly summaries...');
  aggregateWeekly(summaries);
  console.log('');
  
  console.log('Generating monthly summaries...');
  aggregateMonthly(summaries);
  console.log('');
  
  console.log('Generating yearly summaries...');
  aggregateYearly(summaries);
  console.log('');

  // Generate manifest files for efficient JS scanning
  const weekFiles = fs.readdirSync(WEEKLY_DIR).filter(f => f.endsWith('.json')).map(f => f.replace('.json', '')).sort();
  const monthFiles = fs.readdirSync(MONTHLY_DIR).filter(f => f.endsWith('.json')).map(f => f.replace('.json', '')).sort();
  const yearFiles = fs.readdirSync(YEARLY_DIR).filter(f => f.endsWith('.json')).map(f => f.replace('.json', '')).sort();

  fs.writeFileSync(path.join(WEEKLY_DIR, 'manifest.json'), JSON.stringify({ weeks: weekFiles }), 'utf-8');
  fs.writeFileSync(path.join(MONTHLY_DIR, 'manifest.json'), JSON.stringify({ months: monthFiles }), 'utf-8');
  fs.writeFileSync(path.join(YEARLY_DIR, 'manifest.json'), JSON.stringify({ years: yearFiles }), 'utf-8');
  console.log('Generated manifest files for all aggregation levels');
  console.log('');

  console.log('=== Aggregation Complete ===');
}

main();
