import { handleAnalysis } from './routes/analysis.js';
import { handleAuth } from './routes/auth.js';
import { handleContentItems } from './routes/content-items.js';
import { handleClosure } from './routes/closure.js';
import { handleDailyReviews } from './routes/daily-reviews.js';
import { handleDashboard } from './routes/dashboard.js';
import { handleDashboardSettings } from './routes/dashboard-settings.js';
import { handleDomainSettings } from './routes/domain-settings.js';
import { handleFollowups } from './routes/followups.js';
import { handleExports } from './routes/exports.js';
import { handlePeriodReviews } from './routes/period-reviews.js';
import { handleProjects } from './routes/projects.js';
import { handleRecords } from './routes/records.js';
import { fail, ok } from './lib/response.js';
import { getSession, makeSessionRefreshCookie } from './lib/session.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    let response;

    if (request.method === 'OPTIONS') {
      response = new Response(null, { status: 204 });
    } else if (url.pathname.startsWith('/api/')) {
      response = await handleApi(request, env, ctx);
    } else if (env.ASSETS) {
      response = await env.ASSETS.fetch(request);
    } else {
      response = fail(404, 'NOT_FOUND', 'Static assets binding is not configured');
    }

    return withSecurityHeaders(request, response);
  }
};

async function handleApi(request, env, ctx) {
  const path = new URL(request.url).pathname;

  try {
    if (path === '/api/health') {
      return ok({
        service: 'summary-dashboard',
        db: Boolean(env.DB),
        assets: Boolean(env.ASSETS),
        googleOAuth: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
        ai: Boolean(env.MINIMAX_API_KEY || env.OPENAI_API_KEY),
        aiProvider: env.AI_PROVIDER || 'minimax',
        sessionSecretConfigured: Boolean(env.SESSION_SECRET)
      });
    }

    if (!env.DB) {
      return fail(500, 'DB_NOT_CONFIGURED', 'D1 database binding is not configured');
    }

    const response = await dispatchApiRoute(request, env, ctx, path);
    return refreshSessionCookieIfNeeded(request, env, response);
  } catch (error) {
    console.error('API error', error);
    return fail(500, 'INTERNAL_ERROR', '服务暂时不可用');
  }
}

async function refreshSessionCookieIfNeeded(request, env, response) {
  if (!parseHasSessionCookie(request)) return response;
  const session = await getSession(request, env);
  if (!session) return response;
  if (!session.shouldRefresh) return response;

  const cookie = makeSessionRefreshCookie(request);
  if (!cookie) return response;

  const headers = new Headers(response.headers);
  headers.append('set-cookie', cookie);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function withSecurityHeaders(request, response) {
  const headers = new Headers(response.headers);
  headers.set('x-content-type-options', 'nosniff');
  headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=()');
  headers.set(
    'content-security-policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://unpkg.com https://giscus.app; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' https://fonts.gstatic.com; connect-src 'self'; frame-src https://giscus.app; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
  );

  if (new URL(request.url).protocol === 'https:') {
    headers.set('strict-transport-security', 'max-age=31536000; includeSubDomains');
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function parseHasSessionCookie(request) {
  return /(?:^|;\s*)sd_session=/.test(request.headers.get('cookie') || '');
}

function dispatchApiRoute(request, env, ctx, path) {
  if (path.startsWith('/api/auth/')) return handleAuth(request, env, ctx);
  if (path.startsWith('/api/analysis/')) return handleAnalysis(request, env, ctx);
  if (path === '/api/closure-metrics' || path.startsWith('/api/insights') || path.startsWith('/api/daily-focus/') || /\/api\/records\/[^/]+\/decisions$/.test(path)) {
    return handleClosure(request, env, ctx);
  }
  if (path.startsWith('/api/records')) return handleRecords(request, env, ctx);
  if (path.startsWith('/api/projects')) return handleProjects(request, env, ctx);
  if (path.startsWith('/api/content-items')) return handleContentItems(request, env, ctx);
  if (path.startsWith('/api/followups')) return handleFollowups(request, env, ctx);
  if (path === '/api/export') return handleExports(request, env, ctx);
  if (path.startsWith('/api/domain-settings/')) return handleDomainSettings(request, env, ctx);
  if (path === '/api/period-reviews' || path.startsWith('/api/period-reviews/')) return handlePeriodReviews(request, env, ctx);
  if (path === '/api/dashboard-settings') return handleDashboardSettings(request, env, ctx);
  if (path === '/api/daily-reviews' || path.startsWith('/api/daily-reviews/')) return handleDailyReviews(request, env, ctx);
  if (path === '/api/dashboard') return handleDashboard(request, env, ctx);

  return fail(404, 'NOT_FOUND', 'API endpoint not found');
}
