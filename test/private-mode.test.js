import test from 'node:test';
import assert from 'node:assert/strict';

import worker from '../src/worker.js';

function privateEnv() {
  return {
    DB: {
      prepare() {
        throw new Error('Unauthenticated private-mode requests must not query D1');
      }
    }
  };
}

test('private APIs reject unauthenticated reads before querying D1', async () => {
  const response = await worker.fetch(
    new Request('https://blog.zhuwd.com/api/records'),
    privateEnv(),
    {}
  );
  const payload = await response.json();

  assert.equal(response.status, 401);
  assert.equal(payload.error.code, 'UNAUTHORIZED');
  assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow, noarchive, nosnippet');
});

test('visitor dashboard exposes no record metadata', async () => {
  const response = await worker.fetch(
    new Request('https://blog.zhuwd.com/api/dashboard'),
    privateEnv(),
    {}
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.data.mode, 'visitor');
  assert.equal('publicRecordCount' in payload.data, false);
  assert.equal('latestPublicRecord' in payload.data, false);
});

test('authenticated non-owner accounts cannot access private APIs', async () => {
  const env = {
    SESSION_SECRET: 'test-session-secret',
    DB: {
      prepare() {
        return {
          bind() { return this; },
          async first() {
            return {
              session_id: 'session-1',
              user_id: 'visitor-1',
              csrf_token: 'csrf-1',
              expires_at: '2099-01-01T00:00:00.000Z',
              last_seen_at: new Date().toISOString(),
              email: 'visitor@example.com',
              name: 'Visitor',
              avatar_url: null,
              role: 'visitor'
            };
          }
        };
      }
    }
  };
  const response = await worker.fetch(
    new Request('https://blog.zhuwd.com/api/records', {
      headers: { cookie: 'sd_session=test-token' }
    }),
    env,
    {}
  );
  const payload = await response.json();

  assert.equal(response.status, 403);
  assert.equal(payload.error.code, 'FORBIDDEN');
});

test('static responses receive noindex headers', async () => {
  const env = {
    ASSETS: {
      fetch() {
        return new Response('<!doctype html>', {
          headers: { 'content-type': 'text/html; charset=utf-8' }
        });
      }
    }
  };
  const response = await worker.fetch(new Request('https://blog.zhuwd.com/'), env, {});

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow, noarchive, nosnippet');
});
