/**
 * Generate manifest files for all summary types
 * Run: node scripts/generate-manifest.js
 * 
 * After adding new daily JSON files, run this to auto-update manifests
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..', 'data', 'summaries');

function scanDir(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json') && f !== 'manifest.json')
    .map(f => f.replace('.json', ''))
    .sort()
    .reverse();
}

function writeManifest(type, items) {
  const manifestPath = path.join(ROOT_DIR, type, 'manifest.json');
  const key = type === 'daily' ? 'dates' 
    : type === 'weekly' ? 'weeks'
    : type === 'monthly' ? 'months'
    : 'years';
  
  fs.writeFileSync(manifestPath, JSON.stringify({ [key]: items, updated: new Date().toISOString() }, null, 2));
  console.log(`✅ ${type}/manifest.json updated with ${items.length} entries`);
}

// Generate all manifests
console.log('📋 Regenerating manifests...\n');
writeManifest('daily', scanDir(path.join(ROOT_DIR, 'daily')));
writeManifest('weekly', scanDir(path.join(ROOT_DIR, 'weekly')));
writeManifest('monthly', scanDir(path.join(ROOT_DIR, 'monthly')));
writeManifest('yearly', scanDir(path.join(ROOT_DIR, 'yearly')));

console.log('\n✨ Done!');
