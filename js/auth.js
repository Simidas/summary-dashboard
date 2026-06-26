/* ========================================
   Auth State
   ======================================== */

import { apiRequest, logout, setCsrfToken } from './api.js?v=20260626e';

const authState = {
  loaded: false,
  apiAvailable: false,
  user: null,
  csrfToken: null,
  error: null
};

const listeners = new Set();

export async function initAuth() {
  if (!isApiEnabled()) {
    authState.loaded = true;
    authState.apiAvailable = false;
    authState.user = null;
    authState.csrfToken = null;
    authState.error = null;
    setCsrfToken(null);
    notify();
    return getAuthState();
  }

  try {
    const data = await apiRequest('/api/auth/me');
    authState.loaded = true;
    authState.apiAvailable = true;
    authState.user = data.user || null;
    authState.csrfToken = data.csrfToken || null;
    authState.error = null;
    setCsrfToken(authState.csrfToken);
  } catch (error) {
    authState.loaded = true;
    authState.apiAvailable = false;
    authState.user = null;
    authState.csrfToken = null;
    authState.error = error;
    setCsrfToken(null);
  }

  notify();
  return getAuthState();
}

export function isApiEnabled() {
  return window.__SUMMARY_API_ENABLED__ === true || window.location.port === '8787';
}

export function getAuthState() {
  return { ...authState };
}

export function onAuthChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function mountAuthControls(container) {
  if (!container) return;

  const render = () => {
    const state = getAuthState();
    container.innerHTML = buildAuthHtml(state);
    bindAuthActions(container, state);
  };

  render();
  onAuthChange(render);
}

function bindAuthActions(container, state) {
  const logoutButton = container.querySelector('[data-auth-logout]');
  logoutButton?.addEventListener('click', async () => {
    logoutButton.disabled = true;
    try {
      await logout();
    } finally {
      await initAuth();
    }
  });

  const loginLink = container.querySelector('[data-auth-login]');
  loginLink?.addEventListener('click', () => {
    loginLink.setAttribute('aria-busy', 'true');
  });
}

function buildAuthHtml(state) {
  if (!state.loaded) {
    return '<span class="auth-pill muted">检查登录中</span>';
  }

  if (!state.apiAvailable) {
    return '<span class="auth-pill muted">静态预览</span>';
  }

  if (!state.user) {
    return '<a class="auth-pill auth-login" href="/api/auth/google/start" data-auth-login>Google 登录</a>';
  }

  const avatar = state.user.avatarUrl
    ? `<img src="${escapeAttr(state.user.avatarUrl)}" alt="" class="auth-avatar">`
    : '<span class="auth-avatar fallback"></span>';
  const role = state.user.role === 'owner' ? 'Owner' : '只读';

  return `
    <div class="auth-user">
      ${avatar}
      <span>${escapeHtml(role)}</span>
      <button type="button" data-auth-logout>退出</button>
    </div>
  `;
}

function notify() {
  listeners.forEach(listener => listener(getAuthState()));
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value == null ? '' : String(value);
  return div.innerHTML;
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/"/g, '&quot;');
}
