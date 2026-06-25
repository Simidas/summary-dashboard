export function json(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('content-type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(data), {
    ...init,
    headers
  });
}

export function ok(data = {}, init = {}) {
  return json({ ok: true, data }, init);
}

export function fail(status, code, message, details) {
  return json({
    ok: false,
    error: {
      code,
      message,
      ...(details ? { details } : {})
    }
  }, { status });
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch (error) {
    return null;
  }
}

export function redirect(location, headers = {}) {
  return new Response(null, {
    status: 302,
    headers: {
      location,
      ...headers
    }
  });
}
