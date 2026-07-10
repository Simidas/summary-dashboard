import { normalizeDomain, normalizeType, normalizeVisibility } from '../lib/db.js';
import { encodeCursor, parsePage } from '../lib/pagination.js';
import { findRecords } from '../repositories/records-repository.js';

export async function listRecordRows(env, url, session) {
  const { limit, cursor } = parsePage(url, { defaultLimit: 20, maxLimit: 500 });
  const isOwner = session?.user?.role === 'owner';
  const rows = await findRecords(env, {
    ownerId: isOwner ? session.user.id : null,
    visibility: isOwner && url.searchParams.has('visibility')
      ? normalizeVisibility(url.searchParams.get('visibility')) : null,
    domain: normalizeDomain(url.searchParams.get('domain')),
    type: url.searchParams.has('type') ? normalizeType(url.searchParams.get('type')) : null,
    project: String(url.searchParams.get('project') || '').trim(),
    cursor: cursor ? { createdAt: cursor.createdAt, id: cursor.id } : null,
    limit
  });
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items.at(-1);
  return {
    items,
    page: {
      limit,
      hasMore,
      nextCursor: hasMore && last ? encodeCursor({ createdAt: last.created_at, id: last.id }) : null
    }
  };
}
