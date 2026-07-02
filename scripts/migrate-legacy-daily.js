#!/usr/bin/env node
/**
 * Migrate legacy Hermes daily summaries to the unified manual record format.
 *
 * Input:
 *   data/legacy/hermes-daily/YYYY-MM-DD.json
 *
 * Output:
 *   data/records/daily/YYYY-MM-DD.json
 *   data/records/daily/manifest.json
 *
 * Existing daily records are skipped by default. Use --force to overwrite.
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const LEGACY_DIR = path.join(ROOT_DIR, 'data', 'legacy', 'hermes-daily');
const RECORDS_DIR = path.join(ROOT_DIR, 'data', 'records', 'daily');
const MANIFEST_PATH = path.join(RECORDS_DIR, 'manifest.json');
const FORCE = process.argv.includes('--force');

const DOMAIN_KEYWORDS = {
  life: ['老婆', '家庭', '运动', '跑步', '晨跑', '俯卧撑', 'ADHD', '生活', '关系'],
  content: ['内容创作', '公众号', '文章', '草稿', '发布', 'SEO'],
  side_business: [
    'PDF Q&A',
    '背景去除',
    'PayPal',
    'OpenClaw',
    'summary-dashboard',
    '复盘项目',
    'AI产品',
    'AI项目',
    'AI自动化'
  ]
};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

function scanRecordDates() {
  if (!fs.existsSync(RECORDS_DIR)) return [];

  return fs.readdirSync(RECORDS_DIR)
    .filter(file => file.endsWith('.json') && file !== 'manifest.json')
    .map(file => file.replace('.json', ''))
    .sort()
    .reverse();
}

function compactDate(dateStr) {
  return dateStr.replaceAll('-', '');
}

function includesAny(text, keywords) {
  return keywords.some(keyword => text.includes(keyword));
}

function inferDomain(text, projects = [], tags = []) {
  if (includesAny(text, DOMAIN_KEYWORDS.life)) return 'life';
  if (includesAny(text, DOMAIN_KEYWORDS.content)) return 'content';
  if (includesAny(text, DOMAIN_KEYWORDS.side_business)) return 'side_business';

  const haystack = [...projects, ...tags].join(' ');
  if (includesAny(haystack, DOMAIN_KEYWORDS.content)) return 'content';
  if (includesAny(haystack, DOMAIN_KEYWORDS.side_business)) return 'side_business';
  if (includesAny(haystack, DOMAIN_KEYWORDS.life)) return 'life';

  return 'work';
}

function createRecord({ legacy, index, type, raw, extra = {} }) {
  const projects = legacy.projects || [];
  const tags = legacy.tags || [];
  const domain = extra.domain || inferDomain(raw, projects, tags);
  const id = `record-${compactDate(legacy.date)}-${String(index).padStart(3, '0')}`;

  return {
    id,
    createdAt: `${legacy.date}T21:00:00+08:00`,
    domain,
    type,
    raw,
    summary: '',
    projects,
    tags,
    blockers: [],
    decisions: [],
    nextActions: type === 'followup' ? [raw] : [],
    contentSeeds: [],
    visibility: 'public',
    aiAnalysis: {
      analysis: '',
      suggestions: []
    },
    source: 'hermes'
  };
}

function migrateDaily(legacy) {
  const records = [];
  let index = 1;

  (legacy.achievements || []).forEach(raw => {
    records.push(createRecord({ legacy, index: index++, type: 'review', raw }));
  });

  (legacy.discussions || []).forEach(raw => {
    records.push(createRecord({ legacy, index: index++, type: 'note', raw }));
  });

  (legacy.followUps || []).forEach(raw => {
    records.push(createRecord({ legacy, index: index++, type: 'task', raw }));
  });

  (legacy.learnings || []).forEach(raw => {
    records.push(createRecord({ legacy, index: index++, type: 'review', raw }));
  });

  if (legacy.exercise && legacy.exercise !== '无') {
    records.push(createRecord({
      legacy,
      index: index++,
      type: 'health',
      raw: legacy.exercise,
      extra: { domain: 'life' }
    }));
  }

  return {
    date: legacy.date,
    source: 'hermes-migrated',
    records,
    dailyReview: {
      mostImportantThing: (legacy.achievements || [])[0] || '',
      reflection: (legacy.learnings || [])[0] || '',
      tomorrowFirstStep: (legacy.followUps || [])[0] || '',
      contentCreated: Boolean(legacy.contentCreated),
      mood: legacy.mood || ''
    }
  };
}

function main() {
  if (!fs.existsSync(LEGACY_DIR)) {
    console.log(`Legacy daily directory not found: ${LEGACY_DIR}`);
    return;
  }

  fs.mkdirSync(RECORDS_DIR, { recursive: true });

  const files = fs.readdirSync(LEGACY_DIR)
    .filter(file => file.endsWith('.json') && file !== 'manifest.json')
    .sort();

  files.forEach(file => {
    const legacyPath = path.join(LEGACY_DIR, file);
    const legacy = readJson(legacyPath);
    const migrated = migrateDaily(legacy);
    const outputPath = path.join(RECORDS_DIR, file);

    if (fs.existsSync(outputPath) && !FORCE) {
      console.log(`Skipped existing record: ${outputPath}`);
      return;
    }

    writeJson(outputPath, migrated);
    console.log(`Migrated ${legacyPath} -> ${outputPath}`);
  });

  writeJson(MANIFEST_PATH, { dates: scanRecordDates() });
  console.log(`Updated manifest: ${MANIFEST_PATH}`);
}

main();
