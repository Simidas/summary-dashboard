let schemaReady = null;

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    google_sub TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    email_verified INTEGER NOT NULL DEFAULT 0,
    name TEXT,
    avatar_url TEXT,
    role TEXT NOT NULL DEFAULT 'visitor',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_login_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token_hash TEXT UNIQUE NOT NULL,
    csrf_token TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_seen_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS records (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    date TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    domain TEXT,
    type TEXT NOT NULL DEFAULT 'thought',
    raw_content TEXT NOT NULL,
    summary TEXT,
    visibility TEXT NOT NULL DEFAULT 'private',
    mood TEXT,
    energy INTEGER,
    projects_json TEXT NOT NULL DEFAULT '[]',
    tags_json TEXT NOT NULL DEFAULT '[]',
    next_actions_json TEXT NOT NULL DEFAULT '[]',
    source TEXT NOT NULL DEFAULT 'web',
    legacy_id TEXT,
    deleted_at TEXT,
    FOREIGN KEY (owner_id) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS ai_suggestions (
    id TEXT PRIMARY KEY,
    record_id TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    summary TEXT,
    validation TEXT,
    emotional_read TEXT,
    possible_need TEXT,
    next_small_step TEXT,
    gentle_reminder TEXT,
    encouragement TEXT,
    suggested_tags_json TEXT NOT NULL DEFAULT '[]',
    suggested_followups_json TEXT NOT NULL DEFAULT '[]',
    raw_response_json TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (record_id) REFERENCES records(id),
    FOREIGN KEY (owner_id) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS daily_reviews (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    date TEXT NOT NULL,
    most_important_thing TEXT,
    wins_json TEXT NOT NULL DEFAULT '[]',
    blockers_json TEXT NOT NULL DEFAULT '[]',
    reflection TEXT,
    tomorrow_first_step TEXT,
    mood TEXT,
    energy INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(owner_id, date),
    FOREIGN KEY (owner_id) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS user_state (
    owner_id TEXT PRIMARY KEY,
    total_records INTEGER NOT NULL DEFAULT 0,
    current_streak_days INTEGER NOT NULL DEFAULT 0,
    longest_streak_days INTEGER NOT NULL DEFAULT 0,
    last_record_date TEXT,
    level INTEGER NOT NULL DEFAULT 1,
    xp INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (owner_id) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    slug TEXT NOT NULL,
    name TEXT NOT NULL,
    summary TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    current_focus TEXT,
    next_action TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    UNIQUE(owner_id, slug),
    FOREIGN KEY (owner_id) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS dashboard_settings (
    owner_id TEXT PRIMARY KEY,
    today_focus TEXT,
    tomorrow_first_step TEXT,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (owner_id) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS content_items (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    title TEXT NOT NULL,
    source_domain TEXT,
    status TEXT NOT NULL DEFAULT 'idea',
    angle TEXT,
    outline_json TEXT NOT NULL DEFAULT '[]',
    tags_json TEXT NOT NULL DEFAULT '[]',
    next_action TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    FOREIGN KEY (owner_id) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS followups (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    text TEXT NOT NULL,
    domain TEXT,
    project TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    source_record_id TEXT,
    due_date TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    closed_at TEXT,
    deleted_at TEXT,
    FOREIGN KEY (owner_id) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS domain_settings (
    owner_id TEXT NOT NULL,
    domain TEXT NOT NULL,
    current_focus TEXT,
    next_action TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY(owner_id, domain),
    FOREIGN KEY (owner_id) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS period_reviews (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    period_type TEXT NOT NULL,
    period_key TEXT NOT NULL,
    theme TEXT,
    summary TEXT,
    wins_json TEXT NOT NULL DEFAULT '[]',
    blockers_json TEXT NOT NULL DEFAULT '[]',
    next_actions_json TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'draft',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(owner_id, period_type, period_key),
    FOREIGN KEY (owner_id) REFERENCES users(id)
  )`,
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_records_legacy_id ON records(legacy_id) WHERE legacy_id IS NOT NULL',
  'CREATE INDEX IF NOT EXISTS idx_records_owner_date ON records(owner_id, date DESC)',
  'CREATE INDEX IF NOT EXISTS idx_records_visibility_date ON records(visibility, date DESC)',
  'CREATE INDEX IF NOT EXISTS idx_records_domain_date ON records(domain, date DESC)',
  'CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash)',
  'CREATE INDEX IF NOT EXISTS idx_ai_suggestions_record ON ai_suggestions(record_id)',
  'CREATE INDEX IF NOT EXISTS idx_projects_owner_status ON projects(owner_id, status, updated_at DESC)',
  'CREATE INDEX IF NOT EXISTS idx_content_items_owner_status ON content_items(owner_id, status, updated_at DESC)',
  'CREATE INDEX IF NOT EXISTS idx_followups_owner_status ON followups(owner_id, status, updated_at DESC)',
  'CREATE INDEX IF NOT EXISTS idx_period_reviews_owner_type ON period_reviews(owner_id, period_type, period_key DESC)'
];

export function ensureRuntimeSchema(env) {
  if (!schemaReady) {
    schemaReady = applySchema(env).catch(error => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}

export function isSchemaError(error) {
  const message = String(error?.message || error || '');
  return /no such table|no such column|has no column|table .* has no column/i.test(message);
}

async function applySchema(env) {
  for (const statement of STATEMENTS) {
    await env.DB.prepare(statement).run();
  }
}
