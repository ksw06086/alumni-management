const SPREADSHEET_ID = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
const GOOGLE_CLIENT_ID = PropertiesService.getScriptProperties().getProperty('GOOGLE_CLIENT_ID');
const SESSION_TTL_SECONDS = 21600;
const USERS_SHEET = '사용자목록';
const LOGS_SHEET = 'logs';
const USER_HEADERS = ['userId', 'name', 'email', 'passwordHash', 'role', 'active'];
const LOG_HEADERS = ['timestamp', 'userId', 'userName', 'action', 'targetYear', 'targetStudentId', 'targetStudentName', 'detail'];
const DATA_HEADERS = ['graduationYear', 'studentId', 'name', 'gender', 'phone', 'address', 'status', 'company', 'field', 'detail', 'gpa', 'updatedAt'];
const VALID_STATUSES = ['취업자', '진학자', '미취업자', '국비교육자', '군입대자', '기타'];

function doGet(e) { return respond_(route_(e && e.parameter ? e.parameter : {})); }
function doPost(e) {
  let body = {};
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
  catch (_) { return respond_({ ok: false, error: '요청 형식이 올바르지 않습니다.' }); }
  return respond_(route_(body));
}

function route_(request) {
  try {
    if (!SPREADSHEET_ID) throw new Error('Apps Script 속성 SPREADSHEET_ID가 설정되지 않았습니다.');
    switch (request.action) {
      case 'login': return login_(request);
      case 'googleLogin': return googleLogin_(request);
      case 'users': return withSession_(request, ['admin'], () => ({ ok: true, users: readUsers_(false) }));
      case 'saveUser': return withSession_(request, ['admin'], session => saveUser_(session, request.user || {}));
      case 'sheets': return withSession_(request, ['admin', 'user'], () => ({ ok: true, sheets: listDataSheets_() }));
      case 'students': return withSession_(request, ['admin', 'user'], session => {
        const students = readStudents_(request.year);
        appendLog_(session, '조회', request.year, '', '', '연도별 시트 조회');
        return { ok: true, year: request.year, students: students };
      });
      case 'saveStudent': return withSession_(request, ['admin', 'user'], session => saveStudent_(session, request));
      case 'deleteStudent': return withSession_(request, ['admin', 'user'], session => deleteStudent_(session, request));
      case 'statistics': return withSession_(request, ['admin', 'user'], () => ({ ok: true, statistics: getStatistics_() }));
      case 'logs': return withSession_(request, ['admin'], () => ({ ok: true, logs: readLogs_() }));
      case 'logout': return logout_(request);
      default: throw new Error('알 수 없는 요청입니다.');
    }
  } catch (error) { return { ok: false, error: error.message || String(error) }; }
}

function login_(request) {
  const userId = String(request.userId || '').trim();
  const attemptKey = 'login-fail:' + userId.toLowerCase();
  const cache = CacheService.getScriptCache();
  const failures = Number(cache.get(attemptKey) || 0);
  if (failures >= 5) throw new Error('로그인 시도가 너무 많습니다. 15분 후 다시 시도하세요.');
  const user = readUsers_(true).find(u => u.userId === userId && u.active);
  if (!user || !user.passwordHash || !verifyPassword_(String(request.password || ''), user.passwordHash)) {
    cache.put(attemptKey, String(failures + 1), 900);
    throw new Error('아이디 또는 비밀번호가 올바르지 않습니다.');
  }
  cache.remove(attemptKey);
  if (!user.passwordHash.startsWith('pbkdf2$')) {
    user.passwordHash = hashPassword_(String(request.password || ''));
    const sheet = getOrCreateSheet_(USERS_SHEET, USER_HEADERS);
    const rows = sheet.getDataRange().getValues();
    const rowIndex = rows.slice(1).findIndex(row => String(row[0]) === user.userId);
    if (rowIndex >= 0) sheet.getRange(rowIndex + 2, 4).setValue(user.passwordHash);
  }
  return createSession_(user);
}

function googleLogin_(request) {
  if (!request.accessToken) throw new Error('Google 인증 토큰이 없습니다.');
  if (!GOOGLE_CLIENT_ID) throw new Error('Apps Script 속성 GOOGLE_CLIENT_ID가 설정되지 않았습니다.');
  const response = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?access_token=' + encodeURIComponent(request.accessToken), { muteHttpExceptions: true });
  if (response.getResponseCode() !== 200) throw new Error('Google 인증을 확인할 수 없습니다.');
  const profile = JSON.parse(response.getContentText());
  if (String(profile.email_verified).toLowerCase() !== 'true') throw new Error('인증된 Google 이메일이 아닙니다.');
  if (profile.aud !== GOOGLE_CLIENT_ID) throw new Error('등록되지 않은 Google 애플리케이션의 토큰입니다.');
  const email = String(profile.email || '').toLowerCase();
  const user = readUsers_(true).find(u => u.active && String(u.email || '').toLowerCase() === email);
  if (!user) throw new Error('사용자목록에 등록된 Google 계정이 아닙니다.');
  return createSession_(user);
}

function createSession_(user) {
  const token = Utilities.getUuid();
  const cache = CacheService.getScriptCache();
  const sessionUser = Object.assign(publicUser_(user), { authVersion: cache.get('auth-version:' + user.userId) || '1' });
  cache.put('session:' + token, JSON.stringify(sessionUser), SESSION_TTL_SECONDS);
  appendLog_(sessionUser, '로그인', '', '', '', '로그인 성공');
  return { ok: true, token: token, user: publicUser_(user), sheets: listDataSheets_() };
}

function getSession_(token) {
  const key = 'session:' + String(token || '');
  const raw = CacheService.getScriptCache().get(key);
  if (!raw) throw new Error('로그인이 만료되었습니다. 다시 로그인해주세요.');
  const session = JSON.parse(raw);
  const current = readUsers_(true).find(user => user.userId === session.userId && user.active);
  const version = CacheService.getScriptCache().get('auth-version:' + session.userId) || '1';
  if (!current || current.role !== session.role || String(session.authVersion || '1') !== version) {
    CacheService.getScriptCache().remove(key);
    throw new Error('계정이 비활성화되었거나 권한이 변경되었습니다. 다시 로그인해주세요.');
  }
  CacheService.getScriptCache().put(key, JSON.stringify(Object.assign(publicUser_(current), { authVersion: version })), SESSION_TTL_SECONDS);
  return publicUser_(current);
}

function withSession_(request, roles, callback) {
  const session = getSession_(request.token);
  if (roles.indexOf(session.role) < 0) throw new Error('이 작업을 수행할 권한이 없습니다.');
  return callback(session);
}

function logout_(request) {
  try {
    const session = getSession_(request.token);
    appendLog_(session, '로그아웃', '', '', '', '로그아웃');
  } catch (_) { /* Expired sessions can still be cleared locally. */ }
  CacheService.getScriptCache().remove('session:' + String(request.token || ''));
  return { ok: true };
}

function readUsers_(includePrivate) {
  const sheet = getOrCreateSheet_(USERS_SHEET, USER_HEADERS);
  const values = sheet.getDataRange().getValues();
  return values.slice(1).filter(row => row.some(Boolean)).map(row => {
    const user = Object.fromEntries(USER_HEADERS.map((h, i) => [h, String(row[i] == null ? '' : row[i])]));
    user.active = String(user.active).toLowerCase() !== 'false' && user.active !== '0';
    return includePrivate ? user : publicUser_(user);
  });
}
function publicUser_(user) { return { userId: user.userId, name: user.name, email: user.email, role: user.role, active: user.active }; }

function saveUser_(session, input) {
  const userId = String(input.userId || '').trim();
  const name = String(input.name || '').trim();
  const email = String(input.email || '').trim().toLowerCase();
  const role = String(input.role || 'user');
  if (!userId || !name) throw new Error('아이디와 이름을 입력하세요.');
  if (!/^[A-Za-z0-9._-]{3,40}$/.test(userId)) throw new Error('아이디는 영문, 숫자, ., _, -만 사용해 3~40자로 입력하세요.');
  if (role !== 'admin' && role !== 'user') throw new Error('올바르지 않은 사용자 역할입니다.');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Google 이메일 주소를 확인하세요.');
  if (input.password && String(input.password).length < 10) throw new Error('비밀번호는 10자 이상이어야 합니다.');
  const sheet = getOrCreateSheet_(USERS_SHEET, USER_HEADERS);
  const values = sheet.getDataRange().getValues();
  const existingIndex = values.slice(1).findIndex(row => String(row[0]) === userId);
  const existing = existingIndex >= 0 ? values[existingIndex + 1] : null;
  if (existing && userId === session.userId && (role !== 'admin' || String(input.active) === 'false')) throw new Error('현재 로그인한 관리자 계정의 권한 또는 활성 상태는 여기서 변경할 수 없습니다.');
  const active = input.active !== false && String(input.active).toLowerCase() !== 'false';
  if (email && readUsers_(true).some(user => user.email.toLowerCase() === email && user.userId !== userId)) throw new Error('이미 다른 계정에 연결된 이메일입니다.');
  const passwordHash = input.password ? hashPassword_(String(input.password)) : (existing ? String(existing[3] || '') : '');
  if (!existing && !passwordHash) throw new Error('새 계정에는 비밀번호가 필요합니다.');
  const row = [userId, name, email, passwordHash, role, active];
  if (existingIndex < 0) sheet.appendRow(row); else sheet.getRange(existingIndex + 2, 1, 1, USER_HEADERS.length).setValues([row]);
  if (existing && (userId !== session.userId || (input.password && String(input.password)) || String(existing[4]) !== role || String(existing[5]).toLowerCase() !== String(active))) {
    const cache = CacheService.getScriptCache();
    const versionKey = 'auth-version:' + userId;
    cache.put(versionKey, String(Number(cache.get(versionKey) || 1) + 1), 21600);
  }
  appendLog_(session, existing ? '사용자 수정' : '사용자 등록', '', userId, name, '계정 설정 변경');
  return { ok: true, users: readUsers_(false) };
}

function listDataSheets_() {
  return SpreadsheetApp.openById(SPREADSHEET_ID).getSheets().map(sheet => sheet.getName()).filter(name => name !== USERS_SHEET && name !== LOGS_SHEET);
}
function getDataSheet_(year) {
  const target = String(year || '').trim();
  if (!target || listDataSheets_().indexOf(target) < 0) throw new Error('선택한 연도 시트를 찾을 수 없습니다.');
  return getOrCreateSheet_(target, DATA_HEADERS);
}
function readStudents_(year) {
  const values = getDataSheet_(year).getDataRange().getValues();
  return values.slice(1).filter(row => row.some(Boolean)).map(row => Object.fromEntries(DATA_HEADERS.map((h, i) => [h, row[i] == null ? '' : String(row[i])] )));
}

function saveStudent_(session, request) {
  const year = String(request.year || '').trim();
  const input = request.student || {};
  const studentId = String(input.studentId || '').trim();
  const name = String(input.name || '').trim();
  if (!studentId || !name) throw new Error('학번과 이름을 입력하세요.');
  const student = {};
  DATA_HEADERS.forEach(header => { student[header] = String(input[header] == null ? '' : input[header]).trim(); });
  student.graduationYear = year;
  if (student.status && VALID_STATUSES.indexOf(student.status) < 0) throw new Error('올바른 졸업 후 상태를 선택하세요.');
  if (student.gpa && (!/^\d{1,2}(\.\d{1,2})?$/.test(student.gpa) || Number(student.gpa) > 4.5)) throw new Error('평점은 0~4.5 범위에서 입력하세요.');
  const sheet = getDataSheet_(year);
  const values = sheet.getDataRange().getValues();
  const index = values.slice(1).findIndex(row => String(row[1]).trim() === studentId);
  const isCreate = index < 0;
  if (request.create && !isCreate) throw new Error('이미 등록된 학번입니다. 기존 학생을 선택해 수정하세요.');
  if (!request.create && isCreate) throw new Error('수정할 학생을 찾을 수 없습니다. 목록을 새로고침하세요.');
  if (isCreate) {
    student.updatedAt = now_();
    sheet.appendRow(DATA_HEADERS.map(header => student[header] || ''));
  } else {
    student.updatedAt = now_();
    sheet.getRange(index + 2, 1, 1, DATA_HEADERS.length).setValues([DATA_HEADERS.map(header => student[header] || '')]);
  }
  appendLog_(session, isCreate ? '학생 등록' : '학생 수정', year, studentId, name, isCreate ? '학생 정보 등록' : '학생 정보 수정');
  return { ok: true, student: student };
}

function deleteStudent_(session, request) {
  const year = String(request.year || '').trim();
  const studentId = String(request.studentId || '').trim();
  if (!studentId) throw new Error('삭제할 학번이 없습니다.');
  const sheet = getDataSheet_(year);
  const values = sheet.getDataRange().getValues();
  const index = values.slice(1).findIndex(row => String(row[1]).trim() === studentId);
  if (index < 0) throw new Error('학생을 찾을 수 없습니다.');
  const row = values[index + 1];
  appendLog_(session, '학생 삭제', year, row[1], row[2], '학생 정보 삭제');
  sheet.deleteRow(index + 2);
  return { ok: true };
}

function getStatistics_() {
  return listDataSheets_().sort((a, b) => b.localeCompare(a, undefined, { numeric: true })).map(year => {
    const rows = readStudents_(year);
    const counts = Object.fromEntries(VALID_STATUSES.map(status => [status, 0]));
    rows.forEach(student => { if (Object.prototype.hasOwnProperty.call(counts, student.status)) counts[student.status]++; });
    return { year: year, total: rows.length, counts: counts };
  });
}

function readLogs_() {
  const values = getOrCreateSheet_(LOGS_SHEET, LOG_HEADERS).getDataRange().getValues();
  return values.slice(1).filter(row => row.some(Boolean)).slice(-300).reverse().map(row => Object.fromEntries(LOG_HEADERS.map((header, i) => [header, row[i] instanceof Date ? Utilities.formatDate(row[i], Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss') : String(row[i] == null ? '' : row[i])] )));
}
function appendLog_(session, action, year, studentId, studentName, detail) {
  const sheet = getOrCreateSheet_(LOGS_SHEET, LOG_HEADERS);
  sheet.appendRow([new Date(), session.userId, session.name, action, year || '', studentId || '', studentName || '', detail || '']);
}
function getOrCreateSheet_(name, headers) {
  const book = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = book.getSheetByName(name);
  if (!sheet) sheet = book.insertSheet(name);
  if (sheet.getLastRow() === 0) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  return sheet;
}
function now_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss'); }
function hash_(value) { return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8).map(b => ('0' + (b < 0 ? b + 256 : b).toString(16)).slice(-2)).join(''); }
function hashPassword_(password) {
  const iterations = 60000;
  const salt = Utilities.getUuid().replace(/-/g, '');
  return 'pbkdf2$' + iterations + '$' + salt + '$' + bytesToHex_(pbkdf2_(password, salt, iterations));
}
function verifyPassword_(password, stored) {
  if (!stored.startsWith('pbkdf2$')) return hash_(password) === stored;
  const parts = stored.split('$');
  if (parts.length !== 4 || Number(parts[1]) < 10000 || Number(parts[1]) > 200000) return false;
  return bytesToHex_(pbkdf2_(password, parts[2], Number(parts[1]))) === parts[3];
}
function pbkdf2_(password, saltHex, iterations) {
  const salt = [];
  for (let i = 0; i < saltHex.length; i += 2) salt.push(parseInt(saltHex.slice(i, i + 2), 16));
  const seed = salt.concat([0, 0, 0, 1]);
  let u = Utilities.computeHmacSha256Signature(seed, password, Utilities.Charset.UTF_8);
  const result = u.slice();
  for (let round = 1; round < iterations; round++) {
    u = Utilities.computeHmacSha256Signature(u, password, Utilities.Charset.UTF_8);
    for (let i = 0; i < result.length; i++) result[i] ^= u[i];
  }
  return result;
}
function bytesToHex_(bytes) { return bytes.map(b => ('0' + (b < 0 ? b + 256 : b).toString(16)).slice(-2)).join(''); }
function hashPasswordForSetup() {
  const response = SpreadsheetApp.getUi().prompt('비밀번호 해시 생성', '해시로 변환할 비밀번호를 입력하세요.', SpreadsheetApp.getUi().ButtonSet.OK_CANCEL);
  if (response.getSelectedButton() === SpreadsheetApp.getUi().Button.OK) {
    if (response.getResponseText().length < 10) throw new Error('비밀번호는 10자 이상이어야 합니다.');
    Logger.log(hashPassword_(response.getResponseText()));
  }
}
function respond_(payload) { return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON); }
