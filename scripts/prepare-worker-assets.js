#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const root = process.cwd();
const outDir = path.join(root, 'public');

const copyTargets = [
  { from: 'index.html', to: 'index.html' },
  { from: 'css', to: 'css' },
  { from: 'js', to: 'js' },
  { from: 'data/summaries', to: 'data/summaries' },
  { from: 'data/records/daily', to: 'data/records/daily' }
];

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

for (const target of copyTargets) {
  const sourcePath = path.join(root, target.from);
  const targetPath = path.join(outDir, target.to);
  if (!fs.existsSync(sourcePath)) continue;

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.cpSync(sourcePath, targetPath, { recursive: true });
}

injectWorkerFlag(path.join(outDir, 'index.html'));
injectCommitTime(path.join(outDir, 'index.html'));

console.log(`Prepared Worker assets in ${path.relative(root, outDir)}`);

function injectWorkerFlag(indexPath) {
  if (!fs.existsSync(indexPath)) return;
  const marker = '<!-- App Script -->';
  const flag = '  <script>window.__SUMMARY_API_ENABLED__ = true;</script>';
  const html = fs.readFileSync(indexPath, 'utf8');
  if (html.includes('__SUMMARY_API_ENABLED__')) return;
  fs.writeFileSync(indexPath, html.replace(marker, `${flag}\n\n  ${marker}`));
}

function injectCommitTime(indexPath) {
  if (!fs.existsSync(indexPath)) return;

  const commitTime = getLatestCommitTime();
  if (!commitTime) return;

  const html = fs.readFileSync(indexPath, 'utf8');
  fs.writeFileSync(indexPath, html.replaceAll('COMMIT_TIME_PLACEHOLDER', commitTime));
}

function getLatestCommitTime() {
  try {
    return execSync('git log -1 --format=%cI', {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch (error) {
    return '';
  }
}
