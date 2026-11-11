import assert from 'node:assert/strict';
import test from 'node:test';
import { filterStudentRows, sortStudentRows } from '../src/features/graduates/studentTableUtils.js';
import { STUDENT_STATUS_COLORS, getStudentStatusColor } from '../src/features/graduates/studentStatus.js';

test('student table sorting uses numeric and Korean order, keeps blanks last, and does not mutate input', () => {
  const rows = [
    { studentId: 'S10', name: '나', gpa: '3.9' },
    { studentId: 'S2', name: '가', gpa: '' },
    { studentId: 'S1', name: '다', gpa: '2.8' },
    { studentId: 'S3', name: '라', gpa: '미기재' },
  ];
  const original = [...rows];
  assert.deepEqual(sortStudentRows(rows, { key: 'studentId', direction: 'asc' }).map(row => row.studentId), ['S1', 'S2', 'S3', 'S10']);
  assert.deepEqual(sortStudentRows(rows, { key: 'gpa', direction: 'desc', numeric: true }).map(row => row.gpa), ['3.9', '2.8', '미기재', '']);
  assert.deepEqual(sortStudentRows(rows, { key: 'name', direction: 'asc' }).map(row => row.name), ['가', '나', '다', '라']);
  assert.deepEqual(rows, original);
});

test('student search matches interest field and partial address together with status filters', () => {
  const rows = [
    { name: '김가', studentId: 'S1', field: '인공지능', address: '서울시 강남구', status: '취업자' },
    { name: '김나', studentId: 'S2', field: '디자인', address: '부산시 해운대구', status: '진학자' },
  ];
  assert.deepEqual(filterStudentRows(rows, { query: '인공지능' }).map(row => row.studentId), ['S1']);
  assert.deepEqual(filterStudentRows(rows, { query: '서울', status: '취업자' }).map(row => row.studentId), ['S1']);
  assert.deepEqual(filterStudentRows(rows, { query: '서울', status: '진학자' }), []);
  assert.equal(filterStudentRows(rows, { query: '  ' }).length, 2, 'clearing the query restores the unfiltered list');
});

test('known graduate status values share distinct color tokens across views', () => {
  const statuses = ['취업자', '진학자', '미취업자', '군입대자', '기타'];
  const accents = statuses.map(status => getStudentStatusColor(status).accent);
  assert.deepEqual(Object.keys(STUDENT_STATUS_COLORS), statuses);
  assert.equal(new Set(accents).size, statuses.length);
  assert.equal(getStudentStatusColor('미등록 상태'), getStudentStatusColor('기타'));
});
