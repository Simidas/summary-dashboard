#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dailyDir = path.join(root, 'data/records/daily');
const ownerId = readArg('--owner-id') || 'owner-import';
const source = readArg('--source') || 'json-import';
const files = fs.existsSync(dailyDir)
  ? fs.readdirSync(dailyDir).filter(name => /^\d{4}-\d{2}-\d{2}\.json$/.test(name)).sort()
  : [];

const statements = [];
statements.push('BEGIN TRANSACTION;');
statements.push(`
INSERT OR IGNORE INTO users (
  id, google_sub, email, email_verified, name, avatar_url, role, created_at, updated_at, last_login_at
) VALUES (
  ${sql(ownerId)}, ${sql(`import:${ownerId}`)}, ${sql('import-owner@example.local')}, 1,
  ${sql('Imported Owner')}, NULL, 'owner', ${sql(nowIso())}, ${sql(nowIso())}, ${sql(nowIso())}
);
`.trim());

for (const file of files) {
  const daily = JSON.parse(fs.readFileSync(path.join(dailyDir, file), 'utf8'));
  for (const record of daily.records || []) {
    const createdAt = record.createdAt || `${daily.date}T00:00:00+08:00`;
    const id = record.id || `record-${daily.date}-${Math.random().toString(36).slice(2, 8)}`;
    statements.push(`
INSERT OR IGNORE INTO records (
  id, owner_id, date, created_at, updated_at, domain, type, raw_content, summary,
  visibility, mood, energy, projects_json, tags_json, next_actions_json, source, legacy_id
) VALUES (
  ${sql(id)},
  ${sql(ownerId)},
  ${sql(daily.date || record.date || file.replace('.json', ''))},
  ${sql(createdAt)},
  ${sql(record.updatedAt || createdAt)},
  ${sql(record.domain || null)},
  ${sql(record.type || 'thought')},
  ${sql(record.raw || record.content || record.summary || '')},
  ${sql(record.summary || null)},
  ${sql(record.visibility || 'private')},
  ${sql(record.mood || null)},
  ${record.energy == null ? 'NULL' : Number(record.energy)},
  ${sql(JSON.stringify(record.projects || []))},
  ${sql(JSON.stringify(record.tags || []))},
  ${sql(JSON.stringify(record.nextActions || []))},
  ${sql(source)},
  ${sql(id)}
);
`.trim());
  }

  if (daily.dailyReview) {
    const reviewId = `daily-review-${daily.date}`;
    statements.push(`
INSERT OR IGNORE INTO daily_reviews (
  id, owner_id, date, most_important_thing, wins_json, blockers_json, reflection,
  tomorrow_first_step, mood, energy, created_at, updated_at
) VALUES (
  ${sql(reviewId)},
  ${sql(ownerId)},
  ${sql(daily.date)},
  ${sql(daily.dailyReview.mostImportantThing || null)},
  ${sql(JSON.stringify(daily.dailyReview.wins || []))},
  ${sql(JSON.stringify(daily.dailyReview.blockers || []))},
  ${sql(daily.dailyReview.reflection || null)},
  ${sql(daily.dailyReview.tomorrowFirstStep || null)},
  ${sql(daily.dailyReview.mood || null)},
  ${daily.dailyReview.energy == null ? 'NULL' : Number(daily.dailyReview.energy)},
  ${sql(nowIso())},
  ${sql(nowIso())}
);
`.trim());
  }
}

statements.push('COMMIT;');
process.stdout.write(`${statements.join('\n\n')}\n`);

function readArg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] || null;
}

function sql(value) {
  if (value == null) return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function nowIso() {
  return new Date().toISOString();
}
