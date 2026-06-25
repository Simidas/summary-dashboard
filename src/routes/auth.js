import { fail, ok, redirect } from '../lib/response.js';
import { exchangeCodeForToken, getGoogleAuthUrl, verifyGoogleIdToken } from '../lib/google-oauth.js';
import {
  clearOAuthStateCookie,
  createSession,
  destroySession,
  getSession,
  makeOAuthStateCookie,
  randomToken,
  readOAuthState,
  assertCsrf
} from '../lib/session.js';
import { upsertUser } from '../lib/db.js';

export async function handleAuth(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === '/api/auth/google/start') {
    return startGoogleAuth(request, env);
  }

  if (path === '/api/auth/google/callback') {
    return handleGoogleCallback(request, env);
  }

  if (path === '/api/auth/me') {
    const session = await getSession(request, env);
    if (!session) return ok({ user: null, csrfToken: null, role: 'visitor' });
    return ok({
      user: session.user,
      csrfToken: session.csrfToken
    });
  }

  if (path === '/api/auth/logout' && request.method === 'POST') {
    const session = await getSession(request, env);
    if (session && !assertCsrf(request, session, env)) {
      return fail(403, 'CSRF_FAILED', '请求校验失败');
    }
    const cookie = await destroySession(request, env);
    return ok({ loggedOut: true }, { headers: { 'set-cookie': cookie } });
  }

  return fail(404, 'NOT_FOUND', 'Auth endpoint not found');
}

function startGoogleAuth(request, env) {
  if (!env.GOOGLE_CLIENT_ID) {
    return fail(500, 'OAUTH_NOT_CONFIGURED', 'Google OAuth is not configured');
  }

  const state = randomToken(24);
  const location = getGoogleAuthUrl(env, request, state);
  return redirect(location, {
    'set-cookie': makeOAuthStateCookie(request, state)
  });
}

async function handleGoogleCallback(request, env) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const storedState = readOAuthState(request);
  const clearState = clearOAuthStateCookie(request);
  const appOrigin = env.APP_ORIGIN || url.origin;

  if (!code || !state || !storedState || state !== storedState) {
    return redirect(`${appOrigin}/#home?auth=failed`, { 'set-cookie': clearState });
  }

  try {
    const token = await exchangeCodeForToken(env, request, code);
    const profile = await verifyGoogleIdToken(token.id_token, env.GOOGLE_CLIENT_ID);
    const user = await upsertUser(env, profile);
    const session = await createSession(env, request, user.id);

    const headers = new Headers({
      location: `${appOrigin}/#home?auth=success`
    });
    headers.append('set-cookie', clearState);
    headers.append('set-cookie', session.cookie);

    return new Response(null, { status: 302, headers });
  } catch (error) {
    return redirect(`${appOrigin}/#home?auth=failed`, { 'set-cookie': clearState });
  }
}
