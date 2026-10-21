import test from 'node:test';
import assert from 'node:assert/strict';
import { getEmploymentSummary } from '../src/employment.js';

test('employment summary counts known categories and excludes further study and military service', () => {
  const result = getEmploymentSummary([
    { status: '취업자' }, { status: '취업자' }, { status: '미취업자' },
    { status: '진학자' }, { status: '군입대자' }, { status: '국비교육자' },
    { status: '' }, { status: '조사자' }, { status: '미조사자' },
  ]);
  assert.equal(result.total, 9);
  assert.equal(result.employed, 2);
  assert.equal(result.excluded, 2);
  assert.equal(result.eligible, 7);
  assert.equal(result.rate, 2 / 7 * 100);
  assert.equal(result.counts.find(item => item.label === '기타·미분류').count, 4);
});

test('employment summary handles zero eligible population and missing statuses safely', () => {
  const result = getEmploymentSummary([{ status: '진학자' }, { status: '군입대자' }]);
  assert.equal(result.eligible, 0);
  assert.equal(result.rate, null);
  assert.equal(result.employed, 0);
  assert.equal(getEmploymentSummary([{}, { status: '기타' }]).counts.find(item => item.label === '기타·미분류').count, 2);
});
