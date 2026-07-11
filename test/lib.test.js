import test from 'node:test';
import assert from 'node:assert/strict';

import { decodeCursor, encodeCursor, parsePage } from '../src/lib/pagination.js';
import { ValidationError } from '../src/lib/schema.js';
import { normalizeSuggestion } from '../src/lib/ai-client.js';
import { getPeriodDateRange } from '../src/services/closure-metrics.js';
import {
  validateDailyFocusBody,
  validateFollowupTransitionBody,
  validateInsightBody,
  validateRecordBody,
  validateSuggestionDecisionBody
} from '../src/services/input-schemas.js';

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

test('closure schemas accept the single current data model', () => {
  assert.equal(validateFollowupTransitionBody({ status: 'closed', outcomeType: 'completed' }).outcomeType, 'completed');
  assert.equal(validateDailyFocusBody({ text: '完成行动闭环 API' }).status, undefined);
  assert.equal(validateSuggestionDecisionBody({
    suggestionId: 's1', candidateType: 'action', candidateKey: 'action-0', decision: 'modified'
  }).decision, 'modified');
  assert.equal(validateInsightBody({
    text: '会议密集会影响创作精力', type: 'pattern', sourceRecordId: 'r1'
  }).type, 'pattern');
});

test('closure schemas reject obsolete or ambiguous values', () => {
  assert.throws(() => validateFollowupTransitionBody({ status: 'done' }), ValidationError);
  assert.throws(() => validateSuggestionDecisionBody({
    suggestionId: 's1', candidateType: 'archive', candidateKey: 'x', decision: 'accepted'
  }), ValidationError);
  assert.throws(() => validateInsightBody({ text: 'x', type: 'unknown', sourceRecordId: 'r1' }), ValidationError);
});

test('AI normalization preserves structured insight candidate objects', () => {
  const result = normalizeSuggestion({ AI_PROVIDER: 'minimax', MINIMAX_MODEL: 'test-model' }, {
    nextSmallStep: '先验证一个接口',
    structuredResult: {
      insightCandidates: [{
        key: 'validation-first', text: '持续验证比堆功能重要', type: 'strategy', evidence: ['完成接口验证']
      }]
    }
  });
  assert.deepEqual(result.structuredResult.insightCandidates[0], {
    key: 'validation-first', text: '持续验证比堆功能重要', type: 'strategy', evidence: ['完成接口验证']
  });
});

test('closure metric ranges follow ISO week, month, and year boundaries', () => {
  assert.deepEqual(getPeriodDateRange('weekly', '2026-W28'), {
    start: '2026-07-06', endExclusive: '2026-07-13'
  });
  assert.deepEqual(getPeriodDateRange('monthly', '2026-07'), {
    start: '2026-07-01', endExclusive: '2026-08-01'
  });
  assert.deepEqual(getPeriodDateRange('yearly', '2026'), {
    start: '2026-01-01', endExclusive: '2027-01-01'
  });
  assert.equal(getPeriodDateRange('weekly', '2026-W99'), null);
});
