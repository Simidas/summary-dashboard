const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';

export function getGoogleAuthUrl(env, request, state) {
  const origin = getAppOrigin(env, request);
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
  url.searchParams.set('redirect_uri', `${origin}/api/auth/google/callback`);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', state);
  url.searchParams.set('access_type', 'online');
  url.searchParams.set('prompt', 'select_account');
  return url.toString();
}

export async function exchangeCodeForToken(env, request, code) {
  const origin = getAppOrigin(env, request);
  const body = new URLSearchParams({
    code,
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    redirect_uri: `${origin}/api/auth/google/callback`,
    grant_type: 'authorization_code'
  });

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded'
    },
    body
  });

  if (!response.ok) {
    throw new Error(`Google token exchange failed: ${response.status}`);
  }

  return response.json();
}

export async function verifyGoogleIdToken(idToken, clientId) {
  const [headerSegment, payloadSegment, signatureSegment] = idToken.split('.');
  if (!headerSegment || !payloadSegment || !signatureSegment) {
    throw new Error('Invalid id_token format');
  }

  const header = decodeJsonSegment(headerSegment);
  const payload = decodeJsonSegment(payloadSegment);
  if (header.alg !== 'RS256') throw new Error('Unsupported id_token algorithm');

  const jwksResponse = await fetch(GOOGLE_JWKS_URL, {
    headers: { accept: 'application/json' }
  });
  if (!jwksResponse.ok) throw new Error('Failed to fetch Google JWKS');

  const jwks = await jwksResponse.json();
  const jwk = jwks.keys?.find(key => key.kid === header.kid);
  if (!jwk) throw new Error('Google JWKS key not found');

  const key = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );

  const signedData = new TextEncoder().encode(`${headerSegment}.${payloadSegment}`);
  const signature = base64UrlToBytes(signatureSegment);
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, signedData);
  if (!valid) throw new Error('Invalid Google id_token signature');

  const issuerOk = payload.iss === 'https://accounts.google.com' || payload.iss === 'accounts.google.com';
  if (!issuerOk) throw new Error('Invalid Google id_token issuer');
  if (payload.aud !== clientId) throw new Error('Invalid Google id_token audience');
  if (Number(payload.exp || 0) * 1000 <= Date.now()) throw new Error('Google id_token expired');
  if (payload.email_verified !== true && payload.email_verified !== 'true') {
    throw new Error('Google email is not verified');
  }

  return {
    sub: payload.sub,
    email: payload.email,
    emailVerified: true,
    name: payload.name,
    avatarUrl: payload.picture
  };
}

function getAppOrigin(env, request) {
  return env.APP_ORIGIN || new URL(request.url).origin;
}

function decodeJsonSegment(segment) {
  const text = new TextDecoder().decode(base64UrlToBytes(segment));
  return JSON.parse(text);
}

function base64UrlToBytes(segment) {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(segment.length / 4) * 4, '=');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
