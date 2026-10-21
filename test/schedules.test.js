import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDateEventMap, calendarGridDates, dateKey, expandScheduleInstances } from '../src/schedules.js';

const event = overrides => ({
  schedule_id: 'event-1', title: '테스트', start_datetime: '2026-10-05T09:00:00+09:00', end_datetime: '2026-10-05T10:00:00+09:00',
  all_day: false, repeat_type: 'none', repeat_interval: 1, repeat_until: '', ...overrides,
});

test('calendar month grid starts on Sunday and has six complete weeks', () => {
  const days = calendarGridDates(new Date(2026, 9, 1));
  assert.equal(days.length, 42);
  assert.equal(days[0].getUTCDay(), 0);
  assert.equal(dateKey(days[0]), '2026-09-27');
  assert.equal(dateKey(days.at(-1)), '2026-11-07');
});

test('weekly recurrence respects interval and inclusive end date', () => {
  const occurrences = expandScheduleInstances(event({ repeat_type: 'weekly', repeat_until: '2026-10-19' }), '2026-10-01', '2026-10-31');
  assert.deepEqual(occurrences.map(item => item.occurrence_start_date), ['2026-10-05', '2026-10-12', '2026-10-19']);
  const everyOtherWeek = expandScheduleInstances(event({ repeat_type: 'weekly', repeat_interval: 2, repeat_until: '2026-10-31' }), '2026-10-01', '2026-10-31');
  assert.deepEqual(everyOtherWeek.map(item => item.occurrence_start_date), ['2026-10-05', '2026-10-19']);
});

test('monthly recurrence clamps dates such as the 31st to the last day of shorter months', () => {
  const occurrences = expandScheduleInstances(event({
    start_datetime: '2026-01-31T09:00:00+09:00', end_datetime: '2026-01-31T10:00:00+09:00',
    repeat_type: 'monthly', repeat_until: '2026-04-30',
  }), '2026-02-01', '2026-02-28');
  assert.deepEqual(occurrences.map(item => item.occurrence_start_date), ['2026-02-28']);
});

test('multi-day events appear on every covered calendar day', () => {
  const map = buildDateEventMap([event({ start_datetime: '2026-10-30T09:00:00+09:00', end_datetime: '2026-11-02T10:00:00+09:00' })], '2026-10-25', '2026-11-07');
  for (const day of ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']) assert.equal(map[day].length, 1, `${day} contains the event`);
});
