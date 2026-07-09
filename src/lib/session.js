const SESSION_COOKIE = 'sd_session';
const OAUTH_STATE_COOKIE = 'sd_oauth_state';
export const SESSION_TTL_SECONDS = 60 * 60 * 48;
const SESSION_REFRESH_INTERVAL_MS = 30 * 60 * 1000;
const sessionCache = new WeakMap();

export function parseCookies(request) {
  const header = request.headers.get('cookie') || '';
  return Object.fromEntries(
    header
      .split(';')
      .map(part => part.trim())
      .filter(Boolean)
      .map(part => {
        const index = part.indexOf('=');
        if (index === -1) return [part, ''];
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      })
  );
}

export function makeOAuthStateCookie(request, state) {
  return makeCookie(request, OAUTH_STATE_COOKIE, state, {
    maxAge: 600,
    httpOnly: true,
    sameSite: 'Lax',
    path: '/'
  });
}

export function clearOAuthStateCookie(request) {
  return makeCookie(request, OAUTH_STATE_COOKIE, '', {
    maxAge: 0,
    httpOnly: true,
    sameSite: 'Lax',
    path: '/'
  });
}

export function readOAuthState(request) {
  return parseCookies(request)[OAUTH_STATE_COOKIE] || null;
}

export async function createSession(env, request, userId) {
  const token = randomToken(32);
  const tokenHash = await hashSessionToken(env, token);
  const csrfToken = randomToken(24);
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000);
  const id = crypto.randomUUID();

  await env.DB.prepare(`
    INSERT INTO sessions (id, user_id, token_hash, csrf_token, expires_at, created_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(id, userId, tokenHash, csrfToken, expires.toISOString(), now.toISOString(), now.toISOString()).run();

  return {
    token,
    cookie: makeCookie(request, SESSION_COOKIE, token, {
      maxAge: SESSION_TTL_SECONDS,
      httpOnly: true,
      sameSite: 'Lax',
      path: '/'
    })
  };
}

export async function getSession(request, env) {
  if (sessionCache.has(request)) return sessionCache.get(request);

  const sessionPromise = loadSession(request, env);
  sessionCache.set(request, sessionPromise);
  return sessionPromise;
}

async function loadSession(request, env) {
  const token = parseCookies(request)[SESSION_COOKIE];
  if (!token) return null;

  const tokenHash = await hashSessionToken(env, token);
  const row = await env.DB.prepare(`
    SELECT
      sessions.id AS session_id,
      sessions.user_id,
      sessions.csrf_token,
      sessions.expires_at,
      sessions.last_seen_at,
      users.email,
      users.name,
      users.avatar_url,
      users.role
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ?
    LIMIT 1
  `).bind(tokenHash).first();

  if (!row) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(row.session_id).run();
    return null;
  }

  const now = new Date();
  const lastSeenAt = new Date(row.last_seen_at || 0).getTime();
  const shouldRefresh = !Number.isFinite(lastSeenAt)
    || now.getTime() - lastSeenAt >= SESSION_REFRESH_INTERVAL_MS;
  const expires = shouldRefresh
    ? new Date(now.getTime() + SESSION_TTL_SECONDS * 1000)
    : new Date(row.expires_at);

  if (shouldRefresh) {
    await env.DB.prepare('UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?')
      .bind(now.toISOString(), expires.toISOString(), row.session_id)
      .run();
  }

  return {
    id: row.session_id,
    csrfToken: row.csrf_token,
    expiresAt: expires.toISOString(),
    shouldRefresh,
    user: {
      id: row.user_id,
      email: row.email,
      name: row.name,
      avatarUrl: row.avatar_url,
      role: row.role
    }
  };
}

export function makeSessionRefreshCookie(request) {
  const token = parseCookies(request)[SESSION_COOKIE];
  if (!token) return null;

  return makeCookie(request, SESSION_COOKIE, token, {
    maxAge: SESSION_TTL_SECONDS,
    httpOnly: true,
    sameSite: 'Lax',
    path: '/'
  });
}

export async function destroySession(request, env) {
  const token = parseCookies(request)[SESSION_COOKIE];
  if (token) {
    const tokenHash = await hashSessionToken(env, token);
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
  }

  return makeCookie(request, SESSION_COOKIE, '', {
    maxAge: 0,
    httpOnly: true,
    sameSite: 'Lax',
    path: '/'
  });
}

export function assertCsrf(request, session, env) {
  const origin = request.headers.get('origin');
  const appOrigin = env.APP_ORIGIN;
  const urlOrigin = new URL(request.url).origin;
  const allowedOrigins = new Set([appOrigin, urlOrigin, 'http://localhost:8787'].filter(Boolean));

  if (origin && !allowedOrigins.has(origin)) {
    return false;
  }

  const token = request.headers.get('x-csrf-token');
  return Boolean(token && session?.csrfToken && token === session.csrfToken);
}

export function randomToken(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

function makeCookie(request, name, value, options = {}) {
  const url = new URL(request.url);
  const secure = options.secure ?? url.protocol === 'https:';
  const parts = [`${name}=${encodeURIComponent(value)}`];

  if (options.maxAge != null) parts.push(`Max-Age=${options.maxAge}`);
  if (options.httpOnly) parts.push('HttpOnly');
  if (secure) parts.push('Secure');
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  if (options.path) parts.push(`Path=${options.path}`);

  return parts.join('; ');
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

function hashSessionToken(env, token) {
  const secret = env.SESSION_SECRET;
  if (!secret) {
    throw new Error('SESSION_SECRET is required');
  }
  return sha256Hex(`${secret}:${token}`);
}

function base64UrlEncode(bytes) {
  let binary = '';
  bytes.forEach(byte => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
