import assert from 'node:assert/strict';
import test from 'node:test';
import { sortStudentRows } from '../src/studentTableUtils.js';

test('student table sorting uses numeric and Korean order, keeps blanks last, and does not mutate input', () => {
  const rows = [
    { studentId: 'S10', name: '나', gpa: '3.9' },
    { studentId: 'S2', name: '가', gpa: '' },
    { studentId: 'S1', name: '다', gpa: '2.8' },
  ];
  const original = [...rows];
  assert.deepEqual(sortStudentRows(rows, { key: 'studentId', direction: 'asc' }).map(row => row.studentId), ['S1', 'S2', 'S10']);
  assert.deepEqual(sortStudentRows(rows, { key: 'gpa', direction: 'desc', numeric: true }).map(row => row.gpa), ['3.9', '2.8', '']);
  assert.deepEqual(sortStudentRows(rows, { key: 'name', direction: 'asc' }).map(row => row.name), ['가', '나', '다']);
  assert.deepEqual(rows, original);
});
