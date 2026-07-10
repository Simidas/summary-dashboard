import test from 'node:test';
import assert from 'node:assert/strict';

import { decodeCursor, encodeCursor, parsePage } from '../src/lib/pagination.js';
import { ValidationError } from '../src/lib/schema.js';
import { validateRecordBody } from '../src/services/input-schemas.js';

test('cursor round-trips structured pagination values', () => {
  const cursor = encodeCursor({ createdAt: '2026-07-10T12:00:00.000Z', id: 'record-1' });
  assert.deepEqual(decodeCursor(cursor), {
    v: 1,
    createdAt: '2026-07-10T12:00:00.000Z',
    id: 'record-1'
  });
});

test('parsePage clamps limits and accepts a cursor', () => {
  const cursor = encodeCursor({ id: 'item-1' });
  const url = new URL(`https://example.com/api/records?limit=999&cursor=${cursor}`);
  assert.deepEqual(parsePage(url, { defaultLimit: 20, maxLimit: 100 }), {
    limit: 100,
    cursor: { v: 1, id: 'item-1' }
  });
});

test('record schema rejects oversized and malformed inputs', () => {
  assert.throws(() => validateRecordBody({ content: '', date: '10/07/2026' }), ValidationError);
  assert.throws(() => validateRecordBody({ content: 'ok', tags: Array(21).fill('tag') }), ValidationError);
});

test('record schema preserves supported optional input', () => {
  const result = validateRecordBody({
    content: '  今天完成了核心任务  ', domain: 'work', energy: 4, tags: ['进展']
  });
  assert.equal(result.content, '今天完成了核心任务');
  assert.equal(result.energy, 4);
});
