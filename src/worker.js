import { handleAuth } from './routes/auth.js';
import { handleContentItems } from './routes/content-items.js';
import { handleDailyReviews } from './routes/daily-reviews.js';
import { handleDashboard } from './routes/dashboard.js';
import { handleDashboardSettings } from './routes/dashboard-settings.js';
import { handleDomainSettings } from './routes/domain-settings.js';
import { handleFollowups } from './routes/followups.js';
import { handlePeriodReviews } from './routes/period-reviews.js';
import { handleProjects } from './routes/projects.js';
import { handleRecords } from './routes/records.js';
import { fail, ok } from './lib/response.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204 });
    }

    if (url.pathname.startsWith('/api/')) {
      return handleApi(request, env, ctx);
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return fail(404, 'NOT_FOUND', 'Static assets binding is not configured');
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
        aiProvider: env.AI_PROVIDER || 'minimax'
      });
    }

    if (!env.DB) {
      return fail(500, 'DB_NOT_CONFIGURED', 'D1 database binding is not configured');
    }

    if (path.startsWith('/api/auth/')) return handleAuth(request, env, ctx);
    if (path.startsWith('/api/records')) return handleRecords(request, env, ctx);
    if (path.startsWith('/api/projects')) return handleProjects(request, env, ctx);
    if (path.startsWith('/api/content-items')) return handleContentItems(request, env, ctx);
    if (path.startsWith('/api/followups')) return handleFollowups(request, env, ctx);
    if (path.startsWith('/api/domain-settings/')) return handleDomainSettings(request, env, ctx);
    if (path.startsWith('/api/period-reviews/')) return handlePeriodReviews(request, env, ctx);
    if (path === '/api/dashboard-settings') return handleDashboardSettings(request, env, ctx);
    if (path.startsWith('/api/daily-reviews/')) return handleDailyReviews(request, env, ctx);
    if (path === '/api/dashboard') return handleDashboard(request, env, ctx);

    return fail(404, 'NOT_FOUND', 'API endpoint not found');
  } catch (error) {
    console.error('API error', error);
    return fail(500, 'INTERNAL_ERROR', '服务暂时不可用');
  }
}
