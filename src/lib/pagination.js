const CURSOR_VERSION = 1;

export function parsePage(url, options = {}) {
  const defaultLimit = options.defaultLimit || 30;
  const maxLimit = options.maxLimit || 100;
  const rawLimit = Number(url.searchParams.get('limit'));
  const limit = Number.isInteger(rawLimit) && rawLimit > 0
    ? Math.min(rawLimit, maxLimit)
    : defaultLimit;
  const cursor = decodeCursor(url.searchParams.get('cursor'));
  return { limit, cursor };
}

export function makePage(rows, limit, fields) {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items.at(-1);
  return {
    items,
    page: {
      limit,
      hasMore,
      nextCursor: hasMore && last
        ? encodeCursor(Object.fromEntries(fields.map(field => [field, last[field]])))
        : null
    }
  };
}

export function encodeCursor(values) {
  const json = JSON.stringify({ v: CURSOR_VERSION, ...values });
  return base64UrlEncode(new TextEncoder().encode(json));
}

export function decodeCursor(value) {
  if (!value) return null;
  try {
    const decoded = new TextDecoder().decode(base64UrlDecode(value));
    const parsed = JSON.parse(decoded);
    return parsed?.v === CURSOR_VERSION ? parsed : null;
  } catch {
    return null;
  }
}

function base64UrlEncode(bytes) {
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(value) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(base64);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}
