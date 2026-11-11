import assert from 'node:assert/strict';
import test from 'node:test';
import { formatKoreanPreservedDate, formatTransferDetailForDisplay } from '../src/dateFormat.js';

test('formats old mixed-language transfer timestamps in Korean Seoul time', () => {
  const oldValue = 'Wed Oct 07 2026 11:08:05 GMT+0900 (韓國標準時間)';
  assert.equal(formatKoreanPreservedDate(oldValue), '2026년 10월 07일 (수) 오전 11시 08분 05초');
  assert.equal(formatKoreanPreservedDate(oldValue.replace('11:08:05', '23:08:05')), '2026년 10월 07일 (수) 오후 11시 08분 05초');
});

test('formats compact birth dates safely and preserves invalid or unknown values', () => {
  assert.equal(formatKoreanPreservedDate('20210709', { dateOnly: true }), '2021년 07월 09일');
  assert.equal(formatKoreanPreservedDate('20210230', { dateOnly: true }), '20210230');
  assert.equal(formatKoreanPreservedDate('not a date'), 'not a date');
  assert.equal(formatKoreanPreservedDate(''), '');
});

test('formats only recognized date lines in existing graduate details', () => {
  const detail = '[재학생 전환 시 보존 정보]\n생년월일: 20210709\n이메일: ksw04180\n재학생 최초 등록일: Wed Oct 07 2026 11:08:05 GMT+0900 (韓國標準時間)\n기타: 원문 유지';
  assert.equal(formatTransferDetailForDisplay(detail), '[재학생 전환 시 보존 정보]\n생년월일: 2021년 07월 09일\n이메일: ksw04180\n재학생 최초 등록일: 2026년 10월 07일 (수) 오전 11시 08분 05초\n기타: 원문 유지');
});
