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
 * - data/summaries/domains/*.json
 * - data/summaries/projects/*.json
 * - data/summaries/followups/*.json
 * - data/summaries/content/seeds.json
 * - data/summaries/insights/weekly/*.json
 */

const fs = require('fs');
const path = require('path');

// Directories
const ROOT_DIR = path.join(__dirname, '..');
const DAILY_DIR = path.join(ROOT_DIR, 'data', 'records', 'daily');
const WEEKLY_DIR = path.join(ROOT_DIR, 'data', 'summaries', 'weekly');
const MONTHLY_DIR = path.join(ROOT_DIR, 'data', 'summaries', 'monthly');
const YEARLY_DIR = path.join(ROOT_DIR, 'data', 'summaries', 'yearly');
const DOMAINS_DIR = path.join(ROOT_DIR, 'data', 'summaries', 'domains');
const PROJECTS_DIR = path.join(ROOT_DIR, 'data', 'summaries', 'projects');
const FOLLOWUPS_DIR = path.join(ROOT_DIR, 'data', 'summaries', 'followups');
const CONTENT_DIR = path.join(ROOT_DIR, 'data', 'summaries', 'content');
const WEEKLY_INSIGHTS_DIR = path.join(ROOT_DIR, 'data', 'summaries', 'insights', 'weekly');

// Ensure directories exist
[WEEKLY_DIR, MONTHLY_DIR, YEARLY_DIR, DOMAINS_DIR, PROJECTS_DIR, FOLLOWUPS_DIR, CONTENT_DIR, WEEKLY_INSIGHTS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

const DOMAIN_CONFIGS = [
  {
    id: 'work',
    label: '主业',
    description: '公寓租赁行业系统后端开发、业务理解和技术沉淀。'
  },
  {
    id: 'side_business',
    label: '副业',
    description: '网站产品出海、产品实验、增长验证和商业化。'
  },
  {
    id: 'life',
    label: '生活和自我',
    description: '家庭关系、陪伴质量、情绪能量和自我照顾。'
  },
  {
    id: 'content',
    label: '内容产出',
    description: '从真实经历中沉淀公众号选题、素材和草稿。'
  }
];

const DOMAIN_LABELS = Object.fromEntries(DOMAIN_CONFIGS.map(domain => [domain.id, domain.label]));

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
  if (record.domain === 'life') return [];
  return Array.isArray(record.projects) ? record.projects : [];
}

function getRecordTags(record) {
  return Array.isArray(record.tags) ? record.tags : [];
}

function countRecordStats(records) {
  return records.reduce((stats, record) => {
    if (isAchievementRecord(record)) stats.achievements++;
    if (['note', 'idea', 'review', 'emotion', 'diary'].includes(record.type)) stats.discussions++;
    if (record.type === 'followup') stats.followUps++;
    if (record.type !== 'followup') {
      stats.followUps += (record.nextActions || []).length;
    }
    stats.contentSeeds += (record.contentSeeds || []).length;
    if (record.domain === 'content' || (record.tags || []).includes('内容选题')) stats.contentSeeds++;
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

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

function cleanJsonDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  fs.readdirSync(dir)
    .filter(file => file.endsWith('.json'))
    .forEach(file => fs.unlinkSync(path.join(dir, file)));
}

function unique(items) {
  return Array.from(new Set(items.filter(Boolean)));
}

function compactDate(dateStr) {
  return dateStr.replaceAll('-', '');
}

function getRecordText(record) {
  return record.summary || record.raw || record.content || record.reflection || '';
}

function flattenDailyRecords(dailyRecords) {
  return dailyRecords.flatMap(day => getRecords(day).map((record, index) => ({
    ...record,
    date: day.date,
    recordIndex: index + 1,
    dailyReview: day.dailyReview || {}
  })));
}

function normalizeAction(action) {
  if (!action) return null;
  if (typeof action === 'string') {
    return { text: action, status: 'open', closedAt: null };
  }
  if (typeof action === 'object' && action.text) {
    return {
      text: action.text,
      status: action.status || 'open',
      closedAt: action.closedAt || null
    };
  }
  return null;
}

function getDaysBetween(fromDate, toDate) {
  const from = parseDate(fromDate);
  const to = parseDate(toDate);
  return Math.max(0, Math.round((to - from) / 86400000));
}

function slugifyProject(name) {
  const ascii = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (ascii) return ascii;

  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash) + name.charCodeAt(i);
    hash |= 0;
  }
  return `project-${Math.abs(hash).toString(36)}`;
}

function buildFollowups(dailyRecords) {
  const latestDate = dailyRecords[dailyRecords.length - 1]?.date;
  if (!latestDate) return [];

  const followups = [];
  flattenDailyRecords(dailyRecords).forEach(record => {
    const actions = [];

    if (record.type === 'followup') {
      const recordAction = normalizeAction(getRecordText(record));
      if (recordAction) actions.push(recordAction);
    }

    (record.nextActions || []).forEach(action => {
      const normalized = normalizeAction(action);
      if (normalized && !actions.some(item => item.text === normalized.text)) {
        actions.push(normalized);
      }
    });

    actions.forEach((action, actionIndex) => {
      const project = getRecordProjects(record)[0] || '';
      const createdAt = record.createdAt ? record.createdAt.slice(0, 10) : record.date;
      const ageDays = getDaysBetween(createdAt, latestDate);

      followups.push({
        id: `followup-${compactDate(record.date)}-${record.id || record.recordIndex}-${actionIndex + 1}`,
        text: action.text,
        domain: record.domain || 'work',
        domainLabel: DOMAIN_LABELS[record.domain] || record.domain || '未分类',
        project,
        status: action.status,
        createdAt,
        closedAt: action.closedAt,
        sourceDate: record.date,
        sourceRecordId: record.id || '',
        ageDays,
        overdue: action.status === 'open' && ageDays > 7
      });
    });
  });

  return followups.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

function buildContentSeeds(dailyRecords) {
  const seeds = [];

  flattenDailyRecords(dailyRecords).forEach(record => {
    const explicitSeeds = record.contentSeeds || [];
    explicitSeeds.forEach((seed, seedIndex) => {
      const text = typeof seed === 'string' ? seed : seed.title || seed.text || '';
      if (!text) return;

      seeds.push({
        id: `content-seed-${compactDate(record.date)}-${record.id || record.recordIndex}-${seedIndex + 1}`,
        title: text,
        sourceDomain: record.domain || 'work',
        sourceDomainLabel: DOMAIN_LABELS[record.domain] || record.domain || '未分类',
        sourceRecordId: record.id || '',
        sourceDate: record.date,
        status: typeof seed === 'object' ? seed.status || 'idea' : 'idea',
        angle: typeof seed === 'object' ? seed.angle || getRecordText(record) : getRecordText(record),
        outline: typeof seed === 'object' && Array.isArray(seed.outline) ? seed.outline : [],
        tags: getRecordTags(record),
        nextAction: (record.nextActions || []).map(normalizeAction).filter(Boolean)[0]?.text || ''
      });
    });

    if (record.domain === 'content' || (record.tags || []).includes('内容选题')) {
      const text = getRecordText(record);
      if (!text) return;

      seeds.push({
        id: `content-seed-${compactDate(record.date)}-${record.id || record.recordIndex}`,
        title: text,
        sourceDomain: record.domain || 'content',
        sourceDomainLabel: DOMAIN_LABELS[record.domain] || record.domain || '内容',
        sourceRecordId: record.id || '',
        sourceDate: record.date,
        status: 'idea',
        angle: record.summary || '',
        outline: [],
        tags: getRecordTags(record),
        nextAction: (record.nextActions || []).map(normalizeAction).filter(Boolean)[0]?.text || ''
      });
    }
  });

  return seeds.sort((a, b) => b.sourceDate.localeCompare(a.sourceDate));
}

function summarizeRecords(records) {
  const stats = countRecordStats(records);
  const projects = records.flatMap(getRecordProjects);
  const tags = records.flatMap(getRecordTags);

  return {
    recordCount: records.length,
    progressCount: stats.achievements,
    discussionCount: stats.discussions,
    followupCount: stats.followUps,
    contentSeedCount: stats.contentSeeds,
    topProjects: getTopN(countFrequencies(projects), 5),
    topTags: getTopN(countFrequencies(tags), 6)
  };
}

function buildRecordSnapshot(record) {
  return {
    id: record.id || '',
    date: record.date,
    domain: record.domain || 'work',
    domainLabel: DOMAIN_LABELS[record.domain] || record.domain || '未分类',
    type: record.type || 'record',
    text: getRecordText(record),
    projects: getRecordProjects(record),
    tags: getRecordTags(record),
    blockers: record.blockers || [],
    decisions: record.decisions || [],
    nextActions: (record.nextActions || []).map(normalizeAction).filter(Boolean).map(action => action.text)
  };
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
    const blockers = records.flatMap(record => record.blockers || []);
    const followups = buildFollowups(days);
    const openFollowups = followups.filter(item => item.status === 'open');
    const domainDistribution = DOMAIN_CONFIGS.map(domain => ({
      domain: domain.id,
      label: domain.label,
      count: records.filter(record => record.domain === domain.id).length
    }));
    const fallbackStrategy = days
      .map(day => day.dailyReview?.tomorrowFirstStep)
      .filter(Boolean)
      .slice(-3)
      .reverse();
    
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
      contentSeeds: stats.contentSeeds,
      domainDistribution,
      repeatedBlockers: getTopN(countFrequencies(blockers), 5),
      openFollowUps: openFollowups.slice(0, 6),
      nextMonthStrategy: openFollowups.length > 0
        ? openFollowups.slice(0, 3).map(item => item.text)
        : fallbackStrategy,
      modeSummary: `${monthName}共沉淀 ${records.length} 条记录，主要集中在 ${getTopN(projectFreq, 1)[0] || getTopN(tagFreq, 1)[0] || '四个场景'}。`
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

function generateFollowupSummaries(dailyRecords) {
  cleanJsonDir(FOLLOWUPS_DIR);

  const followups = buildFollowups(dailyRecords);
  const open = followups.filter(item => item.status === 'open');
  const overdue = open.filter(item => item.overdue);

  writeJson(path.join(FOLLOWUPS_DIR, 'all.json'), { followups });
  writeJson(path.join(FOLLOWUPS_DIR, 'open.json'), { followups: open, overdue });
  writeJson(path.join(FOLLOWUPS_DIR, 'manifest.json'), {
    files: ['all', 'open'],
    total: followups.length,
    open: open.length,
    overdue: overdue.length
  });

  console.log(`Generated followups: ${followups.length} items`);
  return followups;
}

function generateContentSummaries(dailyRecords) {
  cleanJsonDir(CONTENT_DIR);

  const seeds = buildContentSeeds(dailyRecords);
  const byStatus = seeds.reduce((grouped, seed) => {
    if (!grouped[seed.status]) grouped[seed.status] = [];
    grouped[seed.status].push(seed);
    return grouped;
  }, {});

  writeJson(path.join(CONTENT_DIR, 'seeds.json'), {
    seeds,
    byStatus,
    stats: {
      total: seeds.length,
      idea: (byStatus.idea || []).length,
      outline: (byStatus.outline || []).length,
      drafting: (byStatus.drafting || []).length,
      published: (byStatus.published || []).length,
      dropped: (byStatus.dropped || []).length
    }
  });
  writeJson(path.join(CONTENT_DIR, 'manifest.json'), {
    files: ['seeds'],
    total: seeds.length
  });

  console.log(`Generated content seeds: ${seeds.length} items`);
  return seeds;
}

function generateDomainSummaries(dailyRecords, followups, contentSeeds) {
  cleanJsonDir(DOMAINS_DIR);

  const flatRecords = flattenDailyRecords(dailyRecords);
  const latestDay = dailyRecords[dailyRecords.length - 1] || {};
  const domains = DOMAIN_CONFIGS.map(domain => {
    const records = flatRecords.filter(record => record.domain === domain.id);
    const recentRecords = records.slice(-8).reverse().map(buildRecordSnapshot);
    const openFollowups = followups.filter(item => item.domain === domain.id && item.status === 'open');
    const domainContentSeeds = contentSeeds.filter(seed => seed.sourceDomain === domain.id);
    const blockers = records.flatMap(record => record.blockers || []);
    const latestRecord = records[records.length - 1];
    const latestActions = records
      .flatMap(record => record.nextActions || [])
      .map(normalizeAction)
      .filter(Boolean)
      .filter(action => action.status === 'open');
    const stats = summarizeRecords(records);

    const summary = {
      ...domain,
      ...stats,
      currentFocus: latestRecord ? getRecordText(latestRecord) : '',
      nextAction: openFollowups[0]?.text || latestActions.at(-1)?.text || '',
      openFollowUps: openFollowups.slice(0, 8),
      overdueFollowUps: openFollowups.filter(item => item.overdue),
      blockers: getTopN(countFrequencies(blockers), 5),
      contentSeeds: domainContentSeeds.slice(0, 8),
      recentRecords,
      latestRecordDate: latestRecord?.date || null
    };

    writeJson(path.join(DOMAINS_DIR, `${domain.id}.json`), summary);
    return summary;
  });

  writeJson(path.join(DOMAINS_DIR, 'overview.json'), {
    generatedAt: new Date().toISOString(),
    latestDate: latestDay.date || null,
    todayFocus: latestDay.dailyReview?.mostImportantThing || '',
    tomorrowFirstStep: latestDay.dailyReview?.tomorrowFirstStep || '',
    domains: domains.map(domain => ({
      id: domain.id,
      label: domain.label,
      description: domain.description,
      recordCount: domain.recordCount,
      progressCount: domain.progressCount,
      followupCount: domain.followupCount,
      contentSeedCount: domain.contentSeedCount,
      currentFocus: domain.currentFocus,
      nextAction: domain.nextAction,
      openFollowUps: domain.openFollowUps.slice(0, 3),
      overdueFollowUps: domain.overdueFollowUps.slice(0, 3),
      blockers: domain.blockers,
      topProjects: domain.topProjects,
      topTags: domain.topTags,
      latestRecordDate: domain.latestRecordDate
    }))
  });
  writeJson(path.join(DOMAINS_DIR, 'manifest.json'), {
    domains: DOMAIN_CONFIGS.map(domain => domain.id)
  });

  console.log(`Generated domain summaries: ${domains.length} domains`);
  return domains;
}

function generateProjectSummaries(dailyRecords, followups) {
  cleanJsonDir(PROJECTS_DIR);

  const projectMap = new Map();
  flattenDailyRecords(dailyRecords).forEach(record => {
    getRecordProjects(record).forEach(project => {
      if (!projectMap.has(project)) {
        projectMap.set(project, {
          name: project,
          slug: slugifyProject(project),
          status: 'active',
          firstSeen: record.date,
          lastUpdated: record.date,
          timeline: [],
          decisions: [],
          blockers: [],
          nextActions: [],
          tags: []
        });
      }

      const item = projectMap.get(project);
      item.firstSeen = item.firstSeen < record.date ? item.firstSeen : record.date;
      item.lastUpdated = item.lastUpdated > record.date ? item.lastUpdated : record.date;
      item.timeline.push({
        date: record.date,
        recordId: record.id || '',
        type: record.type || 'record',
        domain: record.domain || 'work',
        domainLabel: DOMAIN_LABELS[record.domain] || record.domain || '未分类',
        text: getRecordText(record),
        decisions: record.decisions || [],
        blockers: record.blockers || [],
        nextActions: (record.nextActions || []).map(normalizeAction).filter(Boolean).map(action => action.text)
      });
      item.decisions.push(...(record.decisions || []));
      item.blockers.push(...(record.blockers || []));
      item.nextActions.push(...(record.nextActions || []).map(normalizeAction).filter(Boolean).map(action => action.text));
      item.tags.push(...getRecordTags(record));
    });
  });

  const projects = Array.from(projectMap.values()).map(project => {
    const openFollowUps = followups.filter(item => item.project === project.name && item.status === 'open');
    const latest = project.timeline[project.timeline.length - 1];
    const summary = {
      ...project,
      summary: latest?.text || `围绕 ${project.name} 持续推进。`,
      timeline: project.timeline.sort((a, b) => b.date.localeCompare(a.date)),
      decisions: unique(project.decisions).slice(0, 10),
      blockers: unique(project.blockers).slice(0, 10),
      nextActions: unique(project.nextActions).slice(0, 10),
      topTags: getTopN(countFrequencies(project.tags), 6),
      openFollowUps: openFollowUps.slice(0, 8)
    };
    writeJson(path.join(PROJECTS_DIR, `${summary.slug}.json`), summary);
    return summary;
  }).sort((a, b) => b.lastUpdated.localeCompare(a.lastUpdated));

  writeJson(path.join(PROJECTS_DIR, 'manifest.json'), {
    projects: projects.map(project => ({
      name: project.name,
      slug: project.slug,
      status: project.status,
      summary: project.summary,
      firstSeen: project.firstSeen,
      lastUpdated: project.lastUpdated,
      recordCount: project.timeline.length,
      openFollowUps: project.openFollowUps.length,
      topTags: project.topTags
    }))
  });

  console.log(`Generated project summaries: ${projects.length} projects`);
  return projects;
}

function generateWeeklyInsights(dailyRecords, followups) {
  cleanJsonDir(WEEKLY_INSIGHTS_DIR);

  const byWeek = new Map();
  dailyRecords.forEach(day => {
    const weekStr = getWeekString(day.date);
    if (!byWeek.has(weekStr)) byWeek.set(weekStr, []);
    byWeek.get(weekStr).push(day);
  });

  const weeks = [];
  byWeek.forEach((days, weekStr) => {
    const { records, allProjects, allTags } = collectRecordFields(days);
    const projectFreq = countFrequencies(allProjects);
    const tagFreq = countFrequencies(allTags);
    const topProject = getTopN(projectFreq, 1)[0] || '';
    const topTag = getTopN(tagFreq, 1)[0] || '';
    const wins = records
      .filter(isAchievementRecord)
      .map(getRecordText)
      .filter(Boolean)
      .slice(0, 3);
    const blockers = records.flatMap(record => record.blockers || []);
    const decisions = records.flatMap(record => record.decisions || []);
    const weekFollowups = followups.filter(item => days.some(day => day.date === item.sourceDate));
    const openFollowUps = weekFollowups.filter(item => item.status === 'open').map(item => item.text);

    const insight = {
      week: weekStr,
      dateRange: getWeekDateRange(weekStr),
      theme: topProject ? `聚焦 ${topProject}` : (topTag ? `围绕 ${topTag}` : '四场景经营'),
      summary: `本周记录 ${days.length} 天，沉淀 ${records.length} 条场景记录。${topProject ? `主线集中在 ${topProject}。` : ''}`,
      wins,
      blockers: blockers.length ? unique(blockers).slice(0, 5) : ['本周没有显式记录阻塞'],
      patterns: getTopN(tagFreq, 5),
      decisions: unique(decisions).slice(0, 5),
      nextWeekFocus: openFollowUps.slice(0, 5),
      aiLeverage: records
        .flatMap(record => record.aiLeverage?.usedFor || [])
        .filter(Boolean)
        .slice(0, 5),
      openFollowUps: openFollowUps.slice(0, 8)
    };

    writeJson(path.join(WEEKLY_INSIGHTS_DIR, `${weekStr}.json`), insight);
    weeks.push(weekStr);
  });

  writeJson(path.join(WEEKLY_INSIGHTS_DIR, 'manifest.json'), {
    weeks: weeks.sort()
  });
  console.log(`Generated weekly insights: ${weeks.length} weeks`);
}

function isAchievementRecord(record) {
  return ['task', 'review'].includes(record.type)
    || (record.tags || []).some(tag => ['成果', '推进', '交付'].includes(tag));
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

  console.log('Generating follow-up summaries...');
  const followups = generateFollowupSummaries(records);
  console.log('');

  console.log('Generating content seed summaries...');
  const contentSeeds = generateContentSummaries(records);
  console.log('');

  console.log('Generating domain summaries...');
  generateDomainSummaries(records, followups, contentSeeds);
  console.log('');

  console.log('Generating project summaries...');
  generateProjectSummaries(records, followups);
  console.log('');

  console.log('Generating weekly insights...');
  generateWeeklyInsights(records, followups);
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
