/**
 * Generate manifest files for daily records and summary types
 * Run: node scripts/generate-manifest.js
 * 
 * After adding new daily record JSON files, run this to auto-update manifests
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DAILY_DIR = path.join(DATA_DIR, 'records', 'daily');
const SUMMARY_DIR = path.join(DATA_DIR, 'summaries');

function scanDir(dir, { newestFirst = false } = {}) {
  if (!fs.existsSync(dir)) return [];
  const items = fs.readdirSync(dir)
    .filter(f => f.endsWith('.json') && f !== 'manifest.json')
    .map(f => f.replace('.json', ''))
    .sort();

  return newestFirst ? items.reverse() : items;
}

function writeManifest(manifestPath, type, items) {
  const key = type === 'daily' ? 'dates'
    : type === 'weekly' ? 'weeks'
    : type === 'monthly' ? 'months'
    : 'years';
  
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify({ [key]: items }, null, 2));
  console.log(`✅ ${type}/manifest.json updated with ${items.length} entries`);
}

// Generate all manifests
console.log('📋 Regenerating manifests...\n');
writeManifest(path.join(DAILY_DIR, 'manifest.json'), 'daily', scanDir(DAILY_DIR, { newestFirst: true }));
writeManifest(path.join(SUMMARY_DIR, 'weekly', 'manifest.json'), 'weekly', scanDir(path.join(SUMMARY_DIR, 'weekly')));
writeManifest(path.join(SUMMARY_DIR, 'monthly', 'manifest.json'), 'monthly', scanDir(path.join(SUMMARY_DIR, 'monthly')));
writeManifest(path.join(SUMMARY_DIR, 'yearly', 'manifest.json'), 'yearly', scanDir(path.join(SUMMARY_DIR, 'yearly')));

console.log('\n✨ Done!');
