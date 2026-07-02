#!/usr/bin/env node
/**
 * Create a manual daily record template.
 *
 * Usage:
 *   node scripts/new-daily-record.js
 *   node scripts/new-daily-record.js 2026-06-24
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const DAILY_DIR = path.join(ROOT_DIR, 'data', 'records', 'daily');
const MANIFEST_PATH = path.join(DAILY_DIR, 'manifest.json');

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function normalizeDateArg(value) {
  if (!value) return formatDate(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('Date must use YYYY-MM-DD format.');
  }
  return value;
}

function createTemplate(dateStr) {
  const compactDate = dateStr.replaceAll('-', '');
  const createdAt = `${dateStr}T09:00:00+08:00`;

  return {
    date: dateStr,
    source: 'manual',
    records: [
      {
        id: `record-${compactDate}-001`,
        createdAt,
        domain: 'work',
        type: 'note',
        raw: '',
        summary: '',
        projects: [],
        tags: [],
        blockers: [],
        decisions: [],
        nextActions: [],
        contentSeeds: [],
        visibility: 'private',
        aiAnalysis: {
          analysis: '',
          suggestions: []
        }
      }
    ],
    dailyReview: {
      mostImportantThing: '',
      reflection: '',
      tomorrowFirstStep: '',
      contentCreated: false,
      mood: ''
    }
  };
}

function readManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) return { dates: [] };

  try {
    return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
  } catch (e) {
    return { dates: [] };
  }
}

function writeManifest(dateStr) {
  const manifest = readManifest();
  const dates = new Set(Array.isArray(manifest.dates) ? manifest.dates : []);
  dates.add(dateStr);

  const nextManifest = {
    dates: Array.from(dates).sort().reverse()
  };

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(nextManifest, null, 2), 'utf-8');
}

function main() {
  const dateStr = normalizeDateArg(process.argv[2]);
  const outputPath = path.join(DAILY_DIR, `${dateStr}.json`);

  fs.mkdirSync(DAILY_DIR, { recursive: true });

  if (fs.existsSync(outputPath)) {
    console.log(`Daily record already exists: ${outputPath}`);
    return;
  }

  fs.writeFileSync(outputPath, JSON.stringify(createTemplate(dateStr), null, 2), 'utf-8');
  writeManifest(dateStr);
  console.log(`Created manual daily record: ${outputPath}`);
}

main();
