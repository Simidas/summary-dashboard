#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const mode = process.argv.includes('--local') ? 'local' : 'remote';
const root = process.cwd();
const backupDir = path.join(root, 'backups');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const output = path.join(backupDir, `summary-dashboard-${mode}-${timestamp}.sql`);
const wrangler = path.join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');

fs.mkdirSync(backupDir, { recursive: true });
const result = spawnSync(process.execPath, [wrangler,
  'd1', 'export', 'summary-dashboard', `--${mode}`, '--output', output
], { cwd: root, stdio: 'inherit' });

if (result.error) {
  console.error(`Unable to run Wrangler: ${result.error.message}`);
  process.exit(1);
}
if (result.status !== 0) {
  if (fs.existsSync(output)) fs.rmSync(output);
  process.exit(result.status || 1);
}

console.log(`D1 backup written to ${path.relative(root, output)}`);
