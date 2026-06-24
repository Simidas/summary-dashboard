#!/usr/bin/env node
/**
 * Aggregate unified daily records into Weekly/Monthly/Yearly JSON files
 * 
 * Usage: node scripts/aggregate.js
 * 
 * Scans data/records/daily/ for all JSON files, then generates:
 * - data/summaries/weekly/YYYY-WXX.json
 * - data/summaries/monthly/YYYY-MM.json
 * - data/summaries/yearly/YYYY.json
 */

const fs = require('fs');
const path = require('path');

// Directories
const ROOT_DIR = path.join(__dirname, '..');
const DAILY_DIR = path.join(ROOT_DIR, 'data', 'records', 'daily');
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
 * Get ISO week year and week number
 * @param {Date} date
 * @returns {{year: number, week: number}}
 */
function getISOWeekInfo(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const isoYear = d.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return { year: isoYear, week };
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
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Get week string YYYY-WXX
 * @param {string} dateStr
 * @returns {string}
 */
function getWeekString(dateStr) {
  const date = parseDate(dateStr);
  const { year, week } = getISOWeekInfo(date);
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
  
  // ISO week 1 is the week containing Jan 4.
  const jan4 = new Date(Date.UTC(yearNum, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const firstMonday = new Date(jan4);
  firstMonday.setUTCDate(jan4.getUTCDate() - jan4Day + 1);
  
  // Add (weekNum - 1) weeks
  const weekStart = new Date(firstMonday);
  weekStart.setUTCDate(firstMonday.getUTCDate() + (weekNum - 1) * 7);
  
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
  
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

function getRecords(day) {
  return Array.isArray(day.records) ? day.records : [];
}

function getRecordProjects(record) {
  return Array.isArray(record.projects) ? record.projects : [];
}

function getRecordTags(record) {
  return Array.isArray(record.tags) ? record.tags : [];
}

function countRecordStats(records) {
  return records.reduce((stats, record) => {
    if (record.type === 'progress') stats.achievements++;
    if (['thought', 'decision', 'reflection'].includes(record.type)) stats.discussions++;
    if (record.type === 'followup') stats.followUps++;
    if (record.type !== 'followup') {
      stats.followUps += (record.nextActions || []).length;
    }
    stats.contentSeeds += (record.contentSeeds || []).length;
    if (record.type === 'content_seed') stats.contentSeeds++;
    return stats;
  }, {
    achievements: 0,
    discussions: 0,
    followUps: 0,
    contentSeeds: 0
  });
}

function collectRecordFields(days) {
  const records = days.flatMap(getRecords);
  const allProjects = [];
  const allTags = [];
  let contentPublished = 0;

  records.forEach(record => {
    allProjects.push(...getRecordProjects(record));
    allTags.push(...getRecordTags(record));
  });

  days.forEach(day => {
    if (day.dailyReview?.contentCreated) contentPublished++;
  });

  return { records, allProjects, allTags, contentPublished };
}

/**
 * Load all unified daily records
 * @returns {Object[]}
 */
function loadDailyRecords() {
  if (!fs.existsSync(DAILY_DIR)) {
    console.log(`Daily records directory not found: ${DAILY_DIR}`);
    return [];
  }
  
  const files = fs.readdirSync(DAILY_DIR).filter(f => f.endsWith('.json') && f !== 'manifest.json');
  const records = [];
  
  files.forEach(file => {
    const filePath = path.join(DAILY_DIR, file);
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(content);
      records.push(data);
    } catch (e) {
      console.warn(`Failed to load ${file}: ${e.message}`);
    }
  });
  
  // Sort by date
  records.sort((a, b) => a.date.localeCompare(b.date));
  return records;
}

/**
 * Aggregate into weekly summaries
 * @param {Object[]} dailyRecords
 */
function aggregateWeekly(dailyRecords) {
  const byWeek = new Map();
  
  dailyRecords.forEach(day => {
    const weekStr = getWeekString(day.date);
    if (!byWeek.has(weekStr)) {
      byWeek.set(weekStr, []);
    }
    byWeek.get(weekStr).push(day);
  });
  
  byWeek.forEach((days, weekStr) => {
    const dates = days.map(d => d.date).sort();
    const dateRange = getWeekDateRange(weekStr);
    
    const { records, allProjects, allTags, contentPublished } = collectRecordFields(days);
    const stats = countRecordStats(records);
    
    const projectFreq = countFrequencies(allProjects);
    const tagFreq = countFrequencies(allTags);
    
    const weekData = {
      year: parseInt(weekStr.substring(0, 4), 10),
      week: weekStr.split('-')[1],
      dateRange,
      days: days.length,
      totalAchievements: stats.achievements,
      totalDiscussions: stats.discussions,
      totalFollowUps: stats.followUps,
      topProjects: getTopN(projectFreq, 3),
      topTags: getTopN(tagFreq, 5),
      contentPublished,
      contentSeeds: stats.contentSeeds,
      dailyRecords: dates
    };
    
    const outputPath = path.join(WEEKLY_DIR, `${weekStr}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(weekData, null, 2), 'utf-8');
    console.log(`Generated: ${outputPath}`);
  });
}

/**
 * Aggregate into monthly summaries
 * @param {Object[]} dailyRecords
 */
function aggregateMonthly(dailyRecords) {
  const byMonth = new Map();
  
  dailyRecords.forEach(day => {
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
    
    const { records, allProjects, allTags, contentPublished } = collectRecordFields(days);
    const stats = countRecordStats(records);
    
    const projectFreq = countFrequencies(allProjects);
    const tagFreq = countFrequencies(allTags);
    
    const monthData = {
      year: parseInt(yearStr, 10),
      month: monthNum,
      monthName,
      totalAchievements: stats.achievements,
      totalDiscussions: stats.discussions,
      weeks: weeks.map(w => w.split('-')[1]), // Just WXX
      topProjects: getTopN(projectFreq, 3),
      topTags: getTopN(tagFreq, 5),
      contentPublished,
      contentSeeds: stats.contentSeeds
    };
    
    const outputPath = path.join(MONTHLY_DIR, `${monthStr}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(monthData, null, 2), 'utf-8');
    console.log(`Generated: ${outputPath}`);
  });
}

/**
 * Aggregate into yearly summaries
 * @param {Object[]} dailyRecords
 */
function aggregateYearly(dailyRecords) {
  const byYear = new Map();
  
  dailyRecords.forEach(day => {
    const yearStr = getYearString(day.date);
    if (!byYear.has(yearStr)) {
      byYear.set(yearStr, []);
    }
    byYear.get(yearStr).push(day);
  });
  
  byYear.forEach((days, yearStr) => {
    // Get unique months
    const months = [...new Set(days.map(d => getMonthString(d.date)))].sort();
    
    const { records, allProjects, allTags, contentPublished } = collectRecordFields(days);
    const stats = countRecordStats(records);
    const projectSet = new Set(allProjects);
    const tagFreq = countFrequencies(allTags);
    
    const yearData = {
      year: parseInt(yearStr, 10),
      totalAchievements: stats.achievements,
      totalProjects: projectSet.size,
      totalContentPublished: contentPublished,
      contentSeeds: stats.contentSeeds,
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
  
  const records = loadDailyRecords();
  console.log(`Loaded ${records.length} daily records`);
  
  if (records.length === 0) {
    console.log('No daily records found. Skipping aggregation.');
    return;
  }
  
  const dateRange = `${records[0].date} to ${records[records.length - 1].date}`;
  console.log(`Date range: ${dateRange}`);
  console.log('');
  
  console.log('Generating weekly summaries...');
  aggregateWeekly(records);
  console.log('');
  
  console.log('Generating monthly summaries...');
  aggregateMonthly(records);
  console.log('');
  
  console.log('Generating yearly summaries...');
  aggregateYearly(records);
  console.log('');

  // Generate manifest files for efficient JS scanning
  const weekFiles = fs.readdirSync(WEEKLY_DIR).filter(f => f.endsWith('.json') && f !== 'manifest.json').map(f => f.replace('.json', '')).sort();
  const monthFiles = fs.readdirSync(MONTHLY_DIR).filter(f => f.endsWith('.json') && f !== 'manifest.json').map(f => f.replace('.json', '')).sort();
  const yearFiles = fs.readdirSync(YEARLY_DIR).filter(f => f.endsWith('.json') && f !== 'manifest.json').map(f => f.replace('.json', '')).sort();

  // Generate daily manifest
  const dailyFiles = fs.readdirSync(DAILY_DIR).filter(f => f.endsWith('.json') && f !== 'manifest.json').map(f => f.replace('.json', '')).sort().reverse();
  fs.writeFileSync(path.join(DAILY_DIR, 'manifest.json'), JSON.stringify({ dates: dailyFiles }, null, 2), 'utf-8');
  console.log('Generated daily manifest:', dailyFiles.length, 'files');

  // Generate weekly/monthly/yearly manifests
  fs.writeFileSync(path.join(WEEKLY_DIR, 'manifest.json'), JSON.stringify({ weeks: weekFiles }, null, 2), 'utf-8');
  fs.writeFileSync(path.join(MONTHLY_DIR, 'manifest.json'), JSON.stringify({ months: monthFiles }, null, 2), 'utf-8');
  fs.writeFileSync(path.join(YEARLY_DIR, 'manifest.json'), JSON.stringify({ years: yearFiles }, null, 2), 'utf-8');
  console.log('Generated manifest files for all aggregation levels');
  console.log('');

  console.log('=== Aggregation Complete ===');
}

main();
