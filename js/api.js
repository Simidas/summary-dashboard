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

export function getRecords(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value != null && value !== '') search.set(key, value);
  });
  const query = search.toString();
  return apiRequest(`/api/records${query ? `?${query}` : ''}`);
}

export function createRecord(input) {
  return apiRequest('/api/records', {
    method: 'POST',
    body: input
  });
}

export function getProjects() {
  return apiRequest('/api/projects');
}

export function getProject(slugOrId) {
  return apiRequest(`/api/projects/${encodeURIComponent(slugOrId)}`);
}

export function createProject(input) {
  return apiRequest('/api/projects', {
    method: 'POST',
    body: input
  });
}

export function updateProject(slugOrId, input) {
  return apiRequest(`/api/projects/${encodeURIComponent(slugOrId)}`, {
    method: 'PATCH',
    body: input
  });
}

export function deleteProject(slugOrId) {
  return apiRequest(`/api/projects/${encodeURIComponent(slugOrId)}`, {
    method: 'DELETE'
  });
}

export function getContentItems(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value != null && value !== '') search.set(key, value);
  });
  const query = search.toString();
  return apiRequest(`/api/content-items${query ? `?${query}` : ''}`);
}

export function createContentItem(input) {
  return apiRequest('/api/content-items', {
    method: 'POST',
    body: input
  });
}

export function updateContentItem(id, input) {
  return apiRequest(`/api/content-items/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: input
  });
}

export function getFollowups(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value != null && value !== '') search.set(key, value);
  });
  const query = search.toString();
  return apiRequest(`/api/followups${query ? `?${query}` : ''}`);
}

export function createFollowup(input) {
  return apiRequest('/api/followups', {
    method: 'POST',
    body: input
  });
}

export function updateFollowup(id, input) {
  return apiRequest(`/api/followups/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: input
  });
}

export function getDomainSettings(domain) {
  return apiRequest(`/api/domain-settings/${encodeURIComponent(domain)}`);
}

export function updateDomainSettings(domain, input) {
  return apiRequest(`/api/domain-settings/${encodeURIComponent(domain)}`, {
    method: 'PATCH',
    body: input
  });
}

export function getDailyReviews(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value != null && value !== '') search.set(key, value);
  });
  const query = search.toString();
  return apiRequest(`/api/daily-reviews${query ? `?${query}` : ''}`);
}

export function getDailyReview(date = 'today') {
  return apiRequest(`/api/daily-reviews/${encodeURIComponent(date)}`);
}

export function updateDailyReview(date = 'today', input) {
  return apiRequest(`/api/daily-reviews/${encodeURIComponent(date)}`, {
    method: 'PUT',
    body: input
  });
}

export function getPeriodReview(type, key) {
  return apiRequest(`/api/period-reviews/${encodeURIComponent(type)}/${encodeURIComponent(key)}`);
}

export function updatePeriodReview(type, key, input) {
  return apiRequest(`/api/period-reviews/${encodeURIComponent(type)}/${encodeURIComponent(key)}`, {
    method: 'PUT',
    body: input
  });
}

export function updateDashboardSettings(input) {
  return apiRequest('/api/dashboard-settings', {
    method: 'PATCH',
    body: input
  });
}

export function logout() {
  return apiRequest('/api/auth/logout', { method: 'POST' });
}
