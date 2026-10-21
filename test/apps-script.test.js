import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function makeHarness() {
  const sheets = new Map();
  const cacheValues = new Map();
  let googleProfile = { email: 'admin@example.com', email_verified: true, aud: 'test-client' };
  const users = new Sheet('사용자목록');
  users.rows = [
    ['userId', 'name', 'email', 'passwordHash', 'role', 'active'],
    ['admin', 'Admin User', 'admin@example.com', '', 'admin', true],
    ['legacy', 'Legacy User', '', '', 'user', true],
  ];
  const yearly = new Sheet('2025');
  yearly.rows = [
    ['graduationYear', 'studentId', 'name', 'gender', 'phone', 'address', 'status', 'company', 'field', 'detail', 'gpa', 'updatedAt'],
    ['2025', 'S001', 'Kim', 'F', '010-0000', 'Seoul', '취업자', 'Example Co', 'Web', '', '3.8', ''],
  ];
  sheets.set(users.name, users);
  sheets.set(yearly.name, yearly);

  const cache = {
    get: key => cacheValues.get(key) ?? null,
    put: (key, value) => cacheValues.set(key, String(value)),
    remove: key => cacheValues.delete(key),
  };
  const workbook = {
    getSheetByName: name => sheets.get(name) || null,
    insertSheet: name => { const sheet = new Sheet(name); sheets.set(name, sheet); return sheet; },
    getSheets: () => [...sheets.values()],
  };
  const bytes = value => [...value].map(byte => byte > 127 ? byte - 256 : byte);
  const Utilities = {
    DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
    computeDigest: (_algorithm, value) => bytes(crypto.createHash('sha256').update(value, 'utf8').digest()),
    computeHmacSha256Signature: (value, key) => {
      const valueBuffer = Array.isArray(value) ? Buffer.from(value.map(byte => byte & 255)) : Buffer.from(value, 'utf8');
      const keyBuffer = Array.isArray(key) ? Buffer.from(key.map(byte => byte & 255)) : Buffer.from(key, 'utf8');
      return bytes(crypto.createHmac('sha256', keyBuffer).update(valueBuffer).digest());
    },
    getUuid: () => crypto.randomUUID(),
    formatDate: value => value.toISOString().replace('T', ' ').slice(0, 19),
  };
  const context = vm.createContext({
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => ({ SPREADSHEET_ID: 'test-sheet', GOOGLE_CLIENT_ID: 'test-client' })[key] || null }) },
    SpreadsheetApp: { openById: () => workbook, getScriptTimeZone: () => 'UTC' },
    CacheService: { getScriptCache: () => cache }, Utilities,
    Session: { getScriptTimeZone: () => 'UTC' },
    UrlFetchApp: { fetch: () => ({ getResponseCode: () => 200, getContentText: () => JSON.stringify(googleProfile) }) },
    ContentService: { createTextOutput: text => ({ text, setMimeType() { return this; } }), MimeType: { JSON: 'application/json' } },
    Logger: { log() {} },
  });
  const source = fs.readFileSync(path.join(root, 'apps-script', 'Code.gs'), 'utf8');
  vm.runInContext(source, context, { filename: 'Code.gs' });
  const legacyHash = value => crypto.createHash('sha256').update(value, 'utf8').digest('hex');
  users.rows[1][3] = vm.runInContext("hashPassword_('strong-admin-password')", context);
  users.rows[2][3] = legacyHash('legacy-password');
  return {
    call: payload => vm.runInContext(`route_(${JSON.stringify(payload)})`, context),
    userRows: users.rows,
    sheets,
    clearCache: () => cacheValues.clear(),
    setGoogleProfile: profile => { googleProfile = profile; },
  };
}

class Sheet {
  constructor(name) { this.name = name; this.rows = []; }
  getName() { return this.name; }
  getLastRow() { return this.rows.length; }
  getDataRange() { return { getValues: () => this.rows.map(row => [...row]) }; }
  getRange(row, column, rowCount = 1, columnCount = 1) {
    return {
      getValues: () => Array.from({ length: rowCount }, (_, ri) => Array.from({ length: columnCount }, (_, ci) => this.rows[row - 1 + ri]?.[column - 1 + ci] ?? '')),
      setValues: values => values.forEach((line, ri) => {
        const targetRow = row - 1 + ri;
        while (this.rows.length <= targetRow) this.rows.push([]);
        for (let ci = 0; ci < line.length; ci++) this.rows[targetRow][column - 1 + ci] = line[ci];
      }),
      setValue: value => {
        const targetRow = row - 1;
        while (this.rows.length <= targetRow) this.rows.push([]);
        this.rows[targetRow][column - 1] = value;
      },
    };
  }
  appendRow(row) { this.rows.push([...row]); }
  deleteRow(row) { this.rows.splice(row - 1, 1); }
}

test('Apps Script API authentication, roles, student lifecycle, statistics, logs and sessions', async t => {
  const app = makeHarness();
  const adminLogin = app.call({ action: 'login', userId: 'admin', password: 'strong-admin-password' });
  assert.equal(adminLogin.ok, true, adminLogin.error || 'admin login succeeds');
  assert.equal('authVersion' in adminLogin.user, false, 'internal session version is not returned to the browser');
  const adminToken = adminLogin.token;

  await t.test('requires a valid session and restricts admin-only actions', () => {
    assert.equal(app.call({ action: 'students', year: '2025' }).ok, false);
    const userLogin = app.call({ action: 'login', userId: 'legacy', password: 'legacy-password' });
    assert.equal(userLogin.ok, true);
    assert.match(app.userRows[2][3], /^pbkdf2\$/,'legacy SHA-256 passwords migrate after successful login');
    assert.equal(app.call({ action: 'logs', token: userLogin.token }).ok, false);
    assert.equal(app.call({ action: 'users', token: userLogin.token }).ok, false);
    assert.equal(app.call({ action: 'users', token: adminToken }).ok, true);
  });

  await t.test('accepts only verified Google profiles for the configured OAuth client', () => {
    app.setGoogleProfile({ email: 'admin@example.com', email_verified: false, aud: 'test-client' });
    assert.equal(app.call({ action: 'googleLogin', accessToken: 'mock-token' }).ok, false);
    app.setGoogleProfile({ email: 'admin@example.com', email_verified: true, aud: 'different-client' });
    assert.equal(app.call({ action: 'googleLogin', accessToken: 'mock-token' }).ok, false);
    app.setGoogleProfile({ email: 'admin@example.com', email_verified: true, aud: 'test-client' });
    assert.equal(app.call({ action: 'googleLogin', accessToken: 'mock-token' }).ok, true);
  });

  await t.test('reads students and rejects invalid sheet names', () => {
    const result = app.call({ action: 'students', token: adminToken, year: '2025' });
    assert.equal(result.ok, true);
    assert.equal(result.students.length, 1);
    assert.equal(result.students[0].studentId, 'S001');
    assert.equal(app.call({ action: 'students', token: adminToken, year: '사용자목록' }).ok, false);
  });

  await t.test('returns sheets added after the session was created', () => {
    app.sheets.set('2026', new Sheet('2026'));
    const result = app.call({ action: 'sheets', token: adminToken });
    assert.equal(result.ok, true);
    assert.ok(result.sheets.includes('2026'));
  });

  await t.test('creates, validates, updates and deletes students', () => {
    const student = { graduationYear: '2025', studentId: 'S002', name: 'Lee', status: '진학자', gpa: '4.2', company: 'Grad School' };
    const created = app.call({ action: 'saveStudent', token: adminToken, year: '2025', create: true, student });
    assert.equal(created.ok, true);
    assert.equal(created.student.updatedAt.length > 0, true);
    assert.equal(app.call({ action: 'saveStudent', token: adminToken, year: '2025', create: true, student }).ok, false, 'duplicate student IDs are rejected on create');
    assert.equal(app.call({ action: 'saveStudent', token: adminToken, year: '2025', create: true, student: { ...student, studentId: 'S003', gpa: '5.0' } }).ok, false);
    assert.equal(app.call({ action: 'saveStudent', token: adminToken, year: '2025', create: true, student: { ...student, studentId: 'S004', status: '미조사자' } }).ok, false, 'removed statuses cannot be newly assigned');
    assert.equal(app.call({ action: 'saveStudent', token: adminToken, year: '2025', create: true, student: { ...student, studentId: 'S005', status: '국비교육자' } }).ok, false, 'national training is no longer an assignable status');
    const updated = app.call({ action: 'saveStudent', token: adminToken, year: '2025', create: false, student: { ...student, name: 'Lee Updated' } });
    assert.equal(updated.ok, true);
    assert.equal(app.call({ action: 'deleteStudent', token: adminToken, year: '2025', studentId: 'S002' }).ok, true);
    assert.equal(app.call({ action: 'deleteStudent', token: adminToken, year: '2025', studentId: 'S002' }).ok, false);
  });

  await t.test('aggregates statistics and returns newest logs to admins', () => {
    const stats = app.call({ action: 'statistics', token: adminToken });
    assert.equal(stats.ok, true);
    const yearStats = stats.statistics.find(item => item.year === '2025');
    assert.ok(yearStats);
    assert.equal(yearStats.total, 1);
    assert.equal(yearStats.counts['취업자'], 1);
    const logs = app.call({ action: 'logs', token: adminToken });
    assert.equal(logs.ok, true);
    assert.ok(logs.logs.some(log => log.action === '학생 등록'));
    assert.ok(logs.logs.some(log => log.action === '학생 삭제'));
  });

  await t.test('stores counseling separately, scopes by student, sorts newest first and preserves the original author', () => {
    const student = { graduationYear: '2025', studentId: 'S002', name: 'Lee', status: '미취업자' };
    assert.equal(app.call({ action: 'saveStudent', token: adminToken, year: '2025', create: true, student }).ok, true);
    const older = app.call({ action: 'saveCounseling', token: adminToken, year: '2025', studentId: 'S001', counseling: { counseledAt: '2025-02-01T09:00', content: '첫 상담', authorName: 'Spoofed' } });
    const newer = app.call({ action: 'saveCounseling', token: adminToken, year: '2025', studentId: 'S001', counseling: { counseledAt: '2025-03-01T09:00', content: '두 번째 상담' } });
    assert.equal(older.ok, true, older.error);
    assert.equal(newer.ok, true, newer.error);
    assert.equal(older.counseling.authorName, 'Admin User', 'author comes from the authenticated session');
    assert.ok(older.counseling.createdAt);
    assert.ok(older.counseling.updatedAt);
    const list = app.call({ action: 'counselings', token: adminToken, year: '2025', studentId: 'S001' });
    assert.deepEqual(list.counselings.map(item => item.content), ['두 번째 상담', '첫 상담']);
    assert.equal(app.call({ action: 'counselings', token: adminToken, year: '2025', studentId: 'S002' }).counselings.length, 0);
    const revised = app.call({ action: 'saveCounseling', token: adminToken, year: '2025', studentId: 'S001', counseling: { counselingId: older.counseling.counselingId, counseledAt: older.counseling.counseledAt, content: '수정된 상담', authorName: 'Changed' } });
    assert.equal(revised.ok, true, revised.error);
    assert.equal(revised.counseling.content, '수정된 상담');
    assert.equal(revised.counseling.authorName, 'Admin User');
    assert.equal(app.call({ action: 'deleteCounseling', token: adminToken, year: '2025', studentId: 'S001', counselingId: newer.counseling.counselingId }).ok, true);
    assert.equal(app.call({ action: 'counselings', token: adminToken, year: '2025', studentId: 'S001' }).counselings.length, 1);
    const originalAudit = app.call({ action: 'logs', token: adminToken }).logs;
    assert.ok(originalAudit.some(log => log.action === '학생 등록'), 'the existing audit log sheet is retained');
    assert.ok(originalAudit.some(log => log.action === '상담 기록 수정'));
    assert.equal(app.call({ action: 'counselings', token: adminToken, year: '2025', studentId: 'missing' }).ok, false);
    const userLogin = app.call({ action: 'login', userId: 'legacy', password: 'legacy-password' });
    const userRecord = app.call({ action: 'saveCounseling', token: userLogin.token, year: '2025', studentId: 'S002', counseling: { counseledAt: '2025-04-01T10:00', content: '일반 사용자 상담' } });
    assert.equal(userRecord.ok, true, userRecord.error);
    assert.equal(userRecord.counseling.authorName, 'Legacy User');
  });

  await t.test('stores personal schedules in configured sheets and enforces owner permissions', () => {
    const categories = new Sheet('스케줄설정');
    categories.rows = [
      '카테고리ID, 카테고리명, 색상코드, 사용여부, 정렬순서'.split(', '),
      ['personal', '개인', '#8B5CF6', true, 1],
      ['work', '업무', '#2563EB', true, 2],
    ];
    const schedules = new Sheet('스케줄');
    schedules.rows = ['일정ID, 사용자ID, 작성자명, 일정제목, 카테고리ID, 시작일시, 종료일시, 종일여부, 장소, 상세설명, 반복유형, 반복간격, 반복종료일, 등록일시, 수정일시'.split(', ')];
    app.sheets.set(categories.name, categories);
    app.sheets.set(schedules.name, schedules);
    assert.equal(app.call({ action: 'sheets', token: adminToken }).sheets.includes('스케줄'), false, 'calendar tabs are not exposed as graduation-year sheets');
    assert.equal(app.call({ action: 'scheduleCategories', token: adminToken }).categories.length, 2);
    const saved = app.call({ action: 'saveSchedule', token: adminToken, schedule: {
      title: '개인 일정', category_id: 'personal', start_datetime: '2026-10-06T09:00:00+09:00', end_datetime: '2026-10-06T10:00:00+09:00',
      all_day: false, location: '서울', description: '내용', repeat_type: 'weekly', repeat_interval: 1, repeat_until: '2026-10-27', user_id: 'spoof', user_name: 'Spoof',
    } });
    assert.equal(saved.ok, true, saved.error);
    assert.equal(saved.schedule.user_id, 'admin', 'owner comes from the authenticated session');
    assert.equal(saved.schedule.user_name, 'Admin User');
    assert.ok(saved.schedule.created_at);
    const visible = app.call({ action: 'schedules', token: adminToken, fromDate: '2026-10-01', toDate: '2026-10-31' });
    assert.equal(visible.schedules.length, 1);
    assert.equal(visible.schedules[0].repeat_type, 'weekly');
    const updated = app.call({ action: 'saveSchedule', token: adminToken, schedule: { ...saved.schedule, title: '수정한 일정' } });
    assert.equal(updated.ok, true, updated.error);
    assert.equal(schedules.rows.length, 2, 'an edit updates the existing row instead of duplicating it');
    assert.equal(updated.schedule.created_at, saved.schedule.created_at);
    schedules.appendRow(['owned-by-other', 'someone-else', 'Other User', '비공개 일정', 'personal', '2026-10-06T09:00:00+09:00', '2026-10-06T10:00:00+09:00', false, '', '', 'none', 1, '', '2026-01-01 00:00:00', '2026-01-01 00:00:00']);
    assert.equal(app.call({ action: 'schedules', token: adminToken, fromDate: '2026-10-01', toDate: '2026-10-31' }).schedules.length, 1, 'other users schedules are not returned');
    assert.equal(app.call({ action: 'saveSchedule', token: adminToken, schedule: { ...saved.schedule, schedule_id: 'owned-by-other' } }).ok, false);
    assert.equal(app.call({ action: 'deleteSchedule', token: adminToken, schedule_id: 'owned-by-other' }).ok, false);
    assert.equal(app.call({ action: 'saveSchedule', token: adminToken, schedule: { ...saved.schedule, schedule_id: '', start_datetime: '2026-10-06T11:00:00+09:00', end_datetime: '2026-10-06T10:00:00+09:00' } }).ok, false, 'end-before-start is rejected');
    assert.equal(app.call({ action: 'deleteSchedule', token: adminToken, schedule_id: saved.schedule.schedule_id }).ok, true);
    assert.equal(schedules.rows.length, 2, 'deleting own event leaves other users rows untouched');
  });

  await t.test('administrator can create users and changed credentials invalidate sessions', () => {
    const user = { userId: 'newuser', name: 'New User', email: '', password: 'new-user-password', role: 'user', active: true };
    const saved = app.call({ action: 'saveUser', token: adminToken, user });
    assert.equal(saved.ok, true);
    const login = app.call({ action: 'login', userId: 'newuser', password: user.password });
    assert.equal(login.ok, true);
    assert.equal(app.call({ action: 'saveUser', token: adminToken, user: { ...user, password: 'updated-user-password' } }).ok, true);
    assert.match(app.call({ action: 'students', token: login.token, year: '2025' }).error, /비활성화|권한/);
    const updatedLogin = app.call({ action: 'login', userId: 'newuser', password: 'updated-user-password' });
    assert.equal(updatedLogin.ok, true);
    assert.equal(app.call({ action: 'saveUser', token: adminToken, user: { ...user, active: false, password: '' } }).ok, true);
    assert.match(app.call({ action: 'students', token: updatedLogin.token, year: '2025' }).error, /비활성화|권한/);
  });

  await t.test('logout revokes the session and failed logins are throttled', () => {
    const fresh = app.call({ action: 'login', userId: 'admin', password: 'strong-admin-password' });
    assert.equal(fresh.ok, true);
    assert.equal(app.call({ action: 'logout', token: fresh.token }).ok, true);
    assert.equal(app.call({ action: 'statistics', token: fresh.token }).ok, false);
    for (let i = 0; i < 5; i++) app.call({ action: 'login', userId: 'blocked-user', password: 'wrong-password' });
    assert.match(app.call({ action: 'login', userId: 'blocked-user', password: 'wrong-password' }).error, /너무 많습니다/);
  });
});
