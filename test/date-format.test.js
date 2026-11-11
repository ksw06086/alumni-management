import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatKoreanDate,
  formatKoreanDateTime,
  formatKoreanPreservedDate,
  formatTransferDetailForDisplay,
  hasStoredTime,
  parseStoredDate,
  toDateInputValue,
} from '../src/shared/dateFormat.js';

test('formats legacy mixed-language timestamps in Seoul time and 24-hour format', () => {
  const legacy = 'Wed Oct 07 2026 11:08:05 GMT+0900 (韓國標準時間)';
  assert.equal(formatKoreanDateTime(legacy), '2026.10.07(수) 11:08:05');
  assert.equal(formatKoreanDateTime(legacy.replace('11:08:05', '23:08:05')), '2026.10.07(수) 23:08:05');
});

test('formats date-only values without adding a time and validates calendar dates', () => {
  assert.equal(formatKoreanDate('20210709'), '2021.07.09(금)');
  assert.equal(formatKoreanDateTime('2021-07-09'), '2021.07.09(금)');
  assert.equal(formatKoreanPreservedDate('20210709', { dateOnly: true }), '2021.07.09(금)');
  assert.equal(formatKoreanDate('20210230'), '20210230');
  assert.equal(formatKoreanDateTime('not a date'), 'not a date');
  assert.equal(formatKoreanDateTime(''), '');
  assert.equal(parseStoredDate('20210230'), null);
});

test('parses ISO and Seoul-local timestamps while preserving the civil date', () => {
  assert.equal(formatKoreanDateTime('2026-10-07T02:08:05Z'), '2026.10.07(수) 11:08:05');
  assert.equal(formatKoreanDateTime('2026-10-07T11:08:05'), '2026.10.07(수) 11:08:05');
  assert.equal(formatKoreanDateTime('2026-02-30T11:08:05Z'), '2026-02-30T11:08:05Z');
  assert.equal(toDateInputValue('2026-10-07T02:08:05Z'), '2026-10-07');
  assert.equal(hasStoredTime('2026-10-07'), false);
  assert.equal(hasStoredTime('2026-10-07T11:08:05'), true);
});

test('formats only recognized date fields in existing transfer details', () => {
  const detail = '[재학생 전환 시 보존 정보]\n생년월일: 20210709\n이메일: ksw04180\n재학생 최초 등록일: Wed Oct 07 2026 11:08:05 GMT+0900 (韓國標準時間)\n참고사항: 원본 날짜 문자열 유지';
  assert.equal(formatTransferDetailForDisplay(detail), '[재학생 전환 시 보존 정보]\n생년월일: 2021.07.09(금)\n이메일: ksw04180\n재학생 최초 등록일: 2026.10.07(수) 11:08:05\n참고사항: 원본 날짜 문자열 유지');
});
