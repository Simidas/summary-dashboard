/* ========================================
   Worker API Client
   ======================================== */

let csrfToken = null;

export class ApiError extends Error {
  constructor(code, message, status = 0, details = null) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function setCsrfToken(token) {
  csrfToken = token || null;
}

export async function apiRequest(path, options = {}) {
  const method = options.method || 'GET';
  const headers = new Headers(options.headers || {});
  headers.set('accept', 'application/json');

  if (options.body != null) {
    headers.set('content-type', 'application/json');
  }

  if (csrfToken && method !== 'GET') {
    headers.set('x-csrf-token', csrfToken);
  }

  let response;
  try {
    response = await fetch(path, {
      method,
      headers,
      body: options.body == null ? undefined : JSON.stringify(options.body)
    });
  } catch (error) {
    throw new ApiError('API_UNAVAILABLE', '在线服务暂时不可用', 0, error.message);
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new ApiError('API_UNAVAILABLE', '在线服务暂时不可用', response.status);
  }

  const payload = await response.json();
  if (!response.ok || payload.ok === false) {
    const error = payload.error || {};
    throw new ApiError(error.code || 'API_ERROR', error.message || '请求失败', response.status, error.details);
  }

  return payload.data;
}

export function getDashboard() {
  return apiRequest('/api/dashboard');
}

export function createRecord(input) {
  return apiRequest('/api/records', {
    method: 'POST',
    body: input
  });
}

export function logout() {
  return apiRequest('/api/auth/logout', { method: 'POST' });
}
