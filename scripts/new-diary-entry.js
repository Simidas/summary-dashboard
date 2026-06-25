#!/usr/bin/env node
/**
 * Create a private diary entry template.
 *
 * Usage:
 *   node scripts/new-diary-entry.js
 *   node scripts/new-diary-entry.js 2026-06-24
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const DIARY_DIR = path.join(ROOT_DIR, 'data', 'records', 'diary');
const MANIFEST_PATH = path.join(DIARY_DIR, 'manifest.json');

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

function readManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) return { entries: [] };

  try {
    return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
  } catch (e) {
    return { entries: [] };
  }
}

function writeManifest(entryId) {
  const manifest = readManifest();
  const entries = new Set(Array.isArray(manifest.entries) ? manifest.entries : []);
  entries.add(entryId);

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify({
    entries: Array.from(entries).sort().reverse()
  }, null, 2), 'utf-8');
}

function createEntry(dateStr, sequence) {
  const compactDate = dateStr.replaceAll('-', '');
  const id = `diary-${compactDate}-${String(sequence).padStart(3, '0')}`;

  return {
    id,
    date: dateStr,
    createdAt: `${dateStr}T21:00:00+08:00`,
    domain: 'life',
    content: '',
    visibility: 'private',
    mood: '',
    energy: null,
    tags: [],
    aiAnalysis: {
      summary: '',
      emotions: [],
      needs: [],
      patterns: [],
      reframe: '',
      suggestions: []
    },
    linkedProjects: [],
    linkedFollowUps: [],
    reviewed: false
  };
}

function main() {
  const dateStr = normalizeDateArg(process.argv[2]);
  fs.mkdirSync(DIARY_DIR, { recursive: true });

  let sequence = 1;
  let entry = createEntry(dateStr, sequence);
  let outputPath = path.join(DIARY_DIR, `${entry.id}.json`);

  while (fs.existsSync(outputPath)) {
    sequence += 1;
    entry = createEntry(dateStr, sequence);
    outputPath = path.join(DIARY_DIR, `${entry.id}.json`);
  }

  fs.writeFileSync(outputPath, JSON.stringify(entry, null, 2), 'utf-8');
  writeManifest(entry.id);
  console.log(`Created diary entry: ${outputPath}`);
}

main();
