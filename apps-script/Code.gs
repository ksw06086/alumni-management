const SPREADSHEET_ID = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
const GOOGLE_CLIENT_ID = PropertiesService.getScriptProperties().getProperty('GOOGLE_CLIENT_ID');
const SESSION_TTL_SECONDS = 21600;
const USERS_SHEET = '사용자목록';
const LOGS_SHEET = 'logs';
const COUNSELINGS_SHEET = 'counselings';
const STUDENT_TRANSFERS_SHEET = 'student_transfers';
const STUDENT_TRANSFER_HEADERS = ['transferId', 'studentId', 'graduationYear', 'state', 'createdAt', 'updatedAt', 'error'];
const CURRENT_STUDENTS_SHEET = '재학생';
const CURRENT_STUDENT_HEADERS = ['student_id', 'name', 'birth_date', 'gender', 'phone', 'email', 'affiliation', 'enrollment_status', 'notes', 'created_at', 'updated_at'];
// 아래 두 일정 탭은 사용자가 만든 한국어 헤더를 검증합니다. SCHEDULE_FIELDS는 프론트엔드에 주는 API 필드명이며 열 순서가 서로 대응해야 합니다.
const SCHEDULES_SHEET = '스케줄';
const SCHEDULE_CATEGORIES_SHEET = '스케줄설정';
const USER_HEADERS = ['userId', 'name', 'email', 'passwordHash', 'role', 'active'];
const LOG_HEADERS = ['timestamp', 'userId', 'userName', 'action', 'targetYear', 'targetStudentId', 'targetStudentName', 'detail'];
const COUNSELING_HEADERS = ['counselingId', 'graduationYear', 'studentId', 'studentName', 'counseledAt', 'content', 'authorUserId', 'authorName', 'createdAt', 'updatedAt'];
const SCHEDULE_HEADERS = ['일정ID', '사용자ID', '작성자명', '일정제목', '카테고리ID', '시작일시', '종료일시', '종일여부', '장소', '상세설명', '반복유형', '반복간격', '반복종료일', '등록일시', '수정일시'];
const SCHEDULE_CATEGORY_HEADERS = ['카테고리ID', '카테고리명', '색상코드', '사용여부', '정렬순서'];
const ARCHIVE_POSTS_SHEET = 'archive_posts';
const ARCHIVE_FILES_SHEET = 'archive_files';
const ARCHIVE_DRIVE_FOLDER_NAME = '졸업생관리프로그램 자료실';
const ARCHIVE_POST_HEADERS = ['post_id', 'title', 'content', 'author_id', 'author_name', 'created_at', 'updated_at', 'view_count', 'status'];
const ARCHIVE_FILE_HEADERS = ['file_id', 'post_id', 'drive_file_id', 'original_filename', 'stored_filename', 'file_type', 'mime_type', 'file_size', 'drive_folder_id', 'uploaded_by', 'uploaded_at', 'status'];
const ARCHIVE_UPLOAD_LIMITS = { video: 500000000, other: 200000000 };
const ARCHIVE_ALLOWED = {
  png: ['image/png','image'], jpg: ['image/jpeg','image'], jpeg: ['image/jpeg','image'], webp: ['image/webp','image'], gif: ['image/gif','image'], bmp: ['image/bmp','image'],
  mp4: ['video/mp4','video'], mov: ['video/quicktime','video'], webm: ['video/webm','video'], avi: ['video/x-msvideo','video'],
  pdf: ['application/pdf','document'], txt: ['text/plain','document'], csv: ['text/csv','document'], xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','document'], xls: ['application/vnd.ms-excel','document'], doc: ['application/msword','document'], docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document','document'], hwp: ['application/x-hwp','document'], hwpx: ['application/vnd.hancom.hwpx','document'], ppt: ['application/vnd.ms-powerpoint','document'], pptx: ['application/vnd.openxmlformats-officedocument.presentationml.presentation','document'], zip: ['application/zip','archive']
};
const SCHEDULE_FIELDS = ['schedule_id', 'user_id', 'user_name', 'title', 'category_id', 'start_datetime', 'end_datetime', 'all_day', 'location', 'description', 'repeat_type', 'repeat_interval', 'repeat_until', 'created_at', 'updated_at'];
const DATA_HEADERS = ['graduationYear', 'studentId', 'name', 'gender', 'phone', 'address', 'status', 'company', 'field', 'detail', 'gpa', 'updatedAt'];
const VALID_STATUSES = ['취업자', '진학자', '미취업자', '군입대자', '기타'];

// Apps Script 웹 앱 진입점입니다. 실제 기능 선택과 권한 검사는 route_에서 처리합니다.
function doGet(e) { return respond_(route_(e && e.parameter ? e.parameter : {})); }
function doPost(e) {
  let body = {};
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
  catch (_) { return respond_({ ok: false, error: '요청 형식이 올바르지 않습니다.' }); }
  return respond_(route_(body));
}

// action 라우터: 요청 본문에서 작업을 고르고, 데이터 접근 전에 세션과 역할을 확인합니다.
function route_(request) {
  try {
    if (!SPREADSHEET_ID) throw new Error('Apps Script 속성 SPREADSHEET_ID가 설정되지 않았습니다.');
    switch (request.action) {
      case 'googleLogin': return googleLogin_(request);
      case 'session': return withSession_(request, ['admin', 'user'], user => ({ ok: true, user: user }));
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
      case 'currentStudents': return withSession_(request, ['admin'], () => ({ ok: true, students: readCurrentStudents_() }));
      case 'transferCurrentStudent': return withSession_(request, ['admin'], session => transferCurrentStudent_(session, request));
      case 'saveCurrentStudent': return withSession_(request, ['admin'], session => saveCurrentStudent_(session, request));
      case 'currentCounselings': return withSession_(request, ['admin'], () => ({ ok: true, counselings: readCounselings_('재학생', request.studentId) }));
      case 'saveCurrentCounseling': return withSession_(request, ['admin'], session => saveCounseling_(session, Object.assign({}, request, { year: '재학생' })));
      case 'deleteCurrentCounseling': return withSession_(request, ['admin'], session => deleteCounseling_(session, Object.assign({}, request, { year: '재학생' })));
      case 'counselings': return withSession_(request, ['admin', 'user'], () => ({ ok: true, counselings: readCounselings_(request.year, request.studentId) }));
      case 'saveCounseling': return withSession_(request, ['admin', 'user'], session => saveCounseling_(session, request));
      case 'deleteCounseling': return withSession_(request, ['admin', 'user'], session => deleteCounseling_(session, request));
      case 'scheduleCategories': return withSession_(request, ['admin', 'user'], () => ({ ok: true, categories: readScheduleCategories_() }));
      case 'schedules': return withSession_(request, ['admin', 'user'], session => ({ ok: true, schedules: readSchedules_(session, request.fromDate, request.toDate) }));
      case 'saveSchedule': return withSession_(request, ['admin', 'user'], session => saveSchedule_(session, request));
      case 'deleteSchedule': return withSession_(request, ['admin', 'user'], session => deleteSchedule_(session, request));
      case 'statistics': return withSession_(request, ['admin', 'user'], () => ({ ok: true, statistics: getStatistics_() }));
      case 'logs': return withSession_(request, ['admin'], () => ({ ok: true, logs: readLogs_() }));
      case 'archivePosts': return withSession_(request, ['admin', 'user'], () => ({ ok: true, posts: readArchivePosts_() }));
      case 'saveArchivePost': return withSession_(request, ['admin'], session => saveArchivePost_(session, request.post || {}));
      case 'publishArchivePost': return withSession_(request, ['admin'], session => publishArchivePost_(session, request.postId));
      case 'deleteArchivePost': return withSession_(request, ['admin'], session => deleteArchivePost_(session, request.postId));
      case 'archivePostView': return withSession_(request, ['admin', 'user'], () => incrementArchiveView_(request.postId));
      case 'archiveUploadStart': return archiveBridge_(request, () => withSession_(request, ['admin'], session => archiveUploadStart_(session, request)));
      case 'archiveUploadComplete': return archiveBridge_(request, () => withSession_(request, ['admin'], session => archiveUploadComplete_(session, request)));
      case 'archiveDownloadInfo': return archiveBridge_(request, () => withSession_(request, ['admin', 'user'], () => archiveDownloadInfo_(request.fileId)));
      case 'archivePrepareFileDelete': return archiveBridge_(request, () => withSession_(request, ['admin'], session => archivePrepareFileDelete_(session, request.fileId)));
      case 'archiveCompleteFileDelete': return archiveBridge_(request, () => withSession_(request, ['admin'], session => archiveCompleteFileDelete_(session, request.fileId)));
      case 'archivePreparePostDelete': return archiveBridge_(request, () => withSession_(request, ['admin'], () => archivePreparePostDelete_(request.postId)));
      case 'archiveCompletePostDelete': return archiveBridge_(request, () => withSession_(request, ['admin'], session => archiveCompletePostDelete_(session, request.postId, request.failedFileIds || [])));
      case 'logout': return logout_(request);
      default: throw new Error('알 수 없는 요청입니다.');
    }
  } catch (error) { return { ok: false, error: error.message || String(error) }; }
}

// 아이디 로그인은 실패 횟수를 제한하고, 비밀번호는 저장된 해시와 비교합니다.
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

// 브라우저 토큰을 Google tokeninfo로 검증한 뒤 사용자목록에 등록된 활성 계정만 허용합니다.
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

// 세션 토큰은 Apps Script Cache에 저장하며, authVersion으로 계정 변경 후 기존 세션을 무효화합니다.
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

// 보호된 API의 공통 권한 경계입니다. 허용 역할에 없으면 callback을 실행하지 않습니다.
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
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Google 이메일 주소를 입력하세요.');
  if (input.password && String(input.password).length < 10) throw new Error('비밀번호는 10자 이상이어야 합니다.');
  const sheet = getOrCreateSheet_(USERS_SHEET, USER_HEADERS);
  const values = sheet.getDataRange().getValues();
  const existingIndex = values.slice(1).findIndex(row => String(row[0]) === userId);
  const existing = existingIndex >= 0 ? values[existingIndex + 1] : null;
  if (existing && userId === session.userId && (role !== 'admin' || String(input.active) === 'false')) throw new Error('현재 로그인한 관리자 계정의 권한 또는 활성 상태는 여기서 변경할 수 없습니다.');
  const active = input.active !== false && String(input.active).toLowerCase() !== 'false';
  if (email && readUsers_(true).some(user => user.email.toLowerCase() === email && user.userId !== userId)) throw new Error('이미 다른 계정에 연결된 이메일입니다.');
  const passwordHash = input.password ? hashPassword_(String(input.password)) : (existing ? String(existing[3] || '') : '');
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
  return SpreadsheetApp.openById(SPREADSHEET_ID).getSheets().map(sheet => sheet.getName()).filter(name => /^\d{4}$/.test(name));
}
function getDataSheet_(year) {
  const target = String(year || '').trim();
  if (!target || listDataSheets_().indexOf(target) < 0) throw new Error('선택한 연도 시트를 찾을 수 없습니다.');
  return getGraduateSheetInfo_(target).sheet;
}
function getGraduateSheetInfo_(year, requiredHeaders) {
  const target = String(year || '').trim();
  if (!/^\d{4}$/.test(target)) throw new Error('졸업연도는 4자리 숫자여야 합니다.');
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(target);
  if (!sheet) throw new Error(`${target}년 졸업생 시트가 없습니다. 시트를 먼저 만들고 다시 시도하세요. 새 시트는 자동 생성하지 않습니다.`);
  const values = sheet.getDataRange().getValues();
  const headers = (values[0] || []).map(value => String(value == null ? '' : value).trim());
  const required = requiredHeaders || ['graduationYear', 'studentId', 'name', 'status'];
  const missing = required.filter(header => headers.indexOf(header) < 0);
  if (!headers.length || missing.length) throw new Error(`${target}년 시트의 필수 컬럼이 없습니다: ${missing.join(', ') || '헤더 행'}`);
  return { sheet: sheet, headers: headers, values: values, indexes: Object.fromEntries(headers.map((header, index) => [header, index])) };
}
function getOrCreateGraduateYearSheetInfo_(year) {
  const book = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = book.getSheetByName(year);
  if (!sheet) {
    const years = listDataSheets_().sort((a, b) => Number(b) - Number(a));
    const template = years.length ? book.getSheetByName(years[0]) : null;
    try {
      if (template) {
        sheet = template.copyTo(book).setName(year);
        // clearContents keeps the template's formatting and data validation while removing copied student rows.
        sheet.clearContents();
        const templateHeaders = getGraduateSheetInfo_(years[0]).headers;
        sheet.getRange(1, 1, 1, templateHeaders.length).setValues([templateHeaders]);
      } else {
        // DATA_HEADERS is the project's canonical graduate schema when no annual sheet exists yet.
        sheet = book.insertSheet(year);
        sheet.getRange(1, 1, 1, DATA_HEADERS.length).setValues([DATA_HEADERS]);
      }
    } catch (error) {
      throw new Error(`${year}년도 졸업생 시트를 생성하지 못했습니다. 다시 시도해 주세요. ${error.message || String(error)}`);
    }
  }
  return getGraduateSheetInfo_(year, ['graduationYear', 'studentId', 'name', 'status', 'detail']);
}
function readStudents_(year) {
  const info = getGraduateSheetInfo_(year);
  return info.values.slice(1).filter(row => row.some(Boolean)).map(row => Object.fromEntries(DATA_HEADERS.map(header => [header, row[info.indexes[header]] == null ? '' : String(row[info.indexes[header]])] )));
}

// 재학생은 졸업생 연도 시트와 분리된 고정 시트를 이름 기반으로 매핑합니다.
function getCurrentStudentsSheet_() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(CURRENT_STUDENTS_SHEET);
  if (!sheet) throw new Error('Google Sheets에 재학생 시트가 없습니다.');
  if (sheet.getLastRow() === 0) sheet.getRange(1, 1, 1, CURRENT_STUDENT_HEADERS.length).setValues([CURRENT_STUDENT_HEADERS]);
  const actual = sheet.getRange(1, 1, 1, CURRENT_STUDENT_HEADERS.length).getDisplayValues()[0].map(value => String(value).trim());
  if (CURRENT_STUDENT_HEADERS.some((header, index) => actual[index] !== header)) throw new Error('재학생 시트 첫 행의 컬럼명과 순서를 확인하세요.');
  return sheet;
}
function readCurrentStudents_() {
  const sheet = getCurrentStudentsSheet_();
  const values = sheet.getDataRange().getValues();
  return values.slice(1).filter(row => row.some(Boolean)).map(row => Object.fromEntries(CURRENT_STUDENT_HEADERS.map((header, index) => [header, row[index] == null ? '' : String(row[index])] )));
}
function formatPreservedDate_(value, dateOnly, sourceTimeZone) {
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return String(value);
    return formatKoreanDateObject_(value, dateOnly);
  }
  const text = String(value == null ? '' : value).trim();
  if (!text) return '';
  const compact = /^(\d{4})(\d{2})(\d{2})$/.exec(text);
  const separated = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  const dateParts = compact || separated;
  if (dateParts) {
    const year = Number(dateParts[1]), month = Number(dateParts[2]), day = Number(dateParts[3]);
    const date = new Date(0);
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCFullYear(year, month - 1, day);
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return text;
    return `${dateParts[1]}년 ${dateParts[2]}월 ${dateParts[3]}일`;
  }
  const isoDateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})$/i;
  const englishDateTime = /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\s+\d{4}\s+\d{2}:\d{2}:\d{2}\s+GMT[+-]\d{4}(?:\s+\(.+\))?$/i;
  const scriptDateTime = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text);
  if (!isoDateTime.test(text) && !englishDateTime.test(text) && !scriptDateTime) return text;
  let date;
  try { date = scriptDateTime ? Utilities.parseDate(text, sourceTimeZone || Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss') : new Date(text); }
  catch (_) { return text; }
  if (isNaN(date.getTime())) return text;
  return formatKoreanDateObject_(date, dateOnly);
}
function formatKoreanDateObject_(date, dateOnly) {
  const options = { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' };
  if (!dateOnly) Object.assign(options, { weekday: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  const parts = Object.fromEntries(new Intl.DateTimeFormat('ko-KR', options).formatToParts(date).map(part => [part.type, part.value]));
  const formattedDate = `${parts.year}년 ${parts.month}월 ${parts.day}일`;
  const period = /^AM$/i.test(parts.dayPeriod || '') ? '오전' : /^PM$/i.test(parts.dayPeriod || '') ? '오후' : parts.dayPeriod;
  return dateOnly ? formattedDate : `${formattedDate} (${parts.weekday}) ${period} ${parts.hour}시 ${parts.minute}분 ${parts.second}초`;
}
function saveCurrentStudent_(session, request) {
  const input = request.student || {};
  const studentId = String(input.student_id || '').trim();
  const name = String(input.name || '').trim();
  if (!studentId || !name) throw new Error('학생 ID와 이름을 입력하세요.');
  const sheet = getCurrentStudentsSheet_();
  const rows = sheet.getDataRange().getValues();
  const index = rows.slice(1).findIndex(row => String(row[0]).trim() === studentId);
  const existing = index < 0 ? null : rows[index + 1];
  if (request.create && existing) throw new Error('이미 등록된 학생 ID입니다.');
  if (!request.create && !existing) throw new Error('수정할 재학생을 찾을 수 없습니다.');
  const now = now_();
  const record = CURRENT_STUDENT_HEADERS.map((header, column) => {
    if (header === 'created_at') return existing ? String(existing[column] || '') : now;
    if (header === 'updated_at') return now;
    return String(input[header] == null ? '' : input[header]).trim();
  });
  if (existing) sheet.getRange(index + 2, 1, 1, CURRENT_STUDENT_HEADERS.length).setValues([record]);
  else sheet.appendRow(record);
  appendLog_(session, existing ? '재학생 수정' : '재학생 등록', '재학생', studentId, name, existing ? '재학생 정보 수정' : '재학생 정보 등록');
  return { ok: true, student: Object.fromEntries(CURRENT_STUDENT_HEADERS.map((header, i) => [header, record[i]])) };
}

// 연도 시트의 학생 CRUD. 컬럼 순서는 DATA_HEADERS와 시트 1행이 일치해야 합니다.
function transferCurrentStudent_(session, request) {
  const lock = LockService.getScriptLock();
  const requestStartedAt = new Date();
  const requestStartedAtIso = requestStartedAt.toISOString();
  if (!lock.tryLock(10000)) throw new Error('다른 전환 작업이 진행 중입니다. 잠시 후 다시 시도하세요.');
  try {
    const studentId = String(request.studentId || '').trim();
    const year = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy');
    const status = '미취업자';
    if (!studentId) throw new Error('학번이 비어 있어 졸업생 전환을 진행할 수 없습니다.');
    if (!/^\d{4}$/.test(year)) throw new Error('한국 표준시 기준 현재 연도를 확인할 수 없어 전환을 중단했습니다.');

    const sourceSheet = getCurrentStudentsSheet_();
    const currentRows = sourceSheet.getDataRange().getValues();
    const sourceIndex = currentRows.slice(1).findIndex(row => String(row[0]).trim() === studentId);
    const existingYear = listDataSheets_().filter(otherYear => otherYear !== year).sort((a, b) => Number(a) - Number(b)).find(otherYear => {
      const other = getGraduateSheetInfo_(otherYear);
      return other.values.slice(1).some(row => String(row[other.indexes.studentId] == null ? '' : row[other.indexes.studentId]).trim() === studentId);
    });
    if (existingYear) throw new Error(`이미 등록된 학번입니다. 졸업생 전환을 진행할 수 없습니다. 학번 ${studentId}은 ${existingYear}년도 졸업생 명단에 이미 등록되어 있습니다.`);

    const targetInfo = getOrCreateGraduateYearSheetInfo_(year);
    const targetSheet = targetInfo.sheet;
    const targetRows = targetSheet.getDataRange().getValues();
    const studentIdColumn = targetInfo.indexes.studentId;
    const nameColumn = targetInfo.indexes.name;
    const statusColumn = targetInfo.indexes.status;
    let targetIndex = targetRows.slice(1).findIndex(row => String(row[studentIdColumn]).trim() === studentId);

    const transferSheet = getOrCreateSheet_(STUDENT_TRANSFERS_SHEET, STUDENT_TRANSFER_HEADERS);
    const ledgerRows = transferSheet.getDataRange().getValues();
    let ledgerIndex = -1;
    for (let i = 0; i < ledgerRows.length - 1; i++) if (String(ledgerRows[i + 1][1]) === studentId && String(ledgerRows[i + 1][2]) === year) ledgerIndex = i;

    if (ledgerIndex >= 0 && String(ledgerRows[ledgerIndex + 1][3]) === 'completed') {
      if (sourceIndex < 0 && targetIndex >= 0) return { ok: true, alreadyCompleted: true, studentId: studentId, graduationYear: year };
      throw new Error('이 학생의 전환 완료 기록과 시트 데이터가 일치하지 않습니다. 관리자 확인이 필요합니다.');
    }
    if (ledgerIndex >= 0 && sourceIndex < 0 && targetIndex >= 0) {
      const previousState = String(ledgerRows[ledgerIndex + 1][3]);
      if (!['graduate_saved', 'counselings_moved', 'recovery_required'].includes(previousState)) throw new Error('전환 장부에서 졸업생 저장을 확인할 수 없습니다. 관리자 확인이 필요합니다.');
      const counselingSheet = getOrCreateSheet_(COUNSELINGS_SHEET, COUNSELING_HEADERS);
      const counselingRows = counselingSheet.getDataRange().getValues();
      for (let i = 1; i < counselingRows.length; i++) if (String(counselingRows[i][2]) === studentId && String(counselingRows[i][1]) === '재학생') counselingSheet.getRange(i + 1, 2).setValue(year);
      const ledgerRow = ledgerIndex + 2;
      transferSheet.getRange(ledgerRow, 4).setValue('completed');
      transferSheet.getRange(ledgerRow, 6, 1, 2).setValues([[nowSeoul_(), '재시도에서 졸업생 데이터 확인 후 완료 처리']]);
      return { ok: true, alreadyCompleted: true, studentId: studentId, graduationYear: year, recoveredAsCompleted: true };
    }
    if (sourceIndex < 0) throw new Error('재학생 명단에서 전환할 학생을 찾을 수 없습니다. 명단을 새로고침한 뒤 다시 시도하세요.');
    if (targetIndex >= 0 && ledgerIndex < 0) throw new Error(`이미 등록된 학번입니다. 학번 ${studentId}은 ${year}년도 졸업생 명단에 이미 등록되어 있습니다.`);

    const sourceRow = currentRows[sourceIndex + 1];
    const student = Object.fromEntries(CURRENT_STUDENT_HEADERS.map((header, index) => [header, String(sourceRow[index] == null ? '' : sourceRow[index]).trim()]));
    const recordedTransferAt = ledgerIndex >= 0 ? String(ledgerRows[ledgerIndex + 1][4] || '') : '';
    const transferAt = recordedTransferAt || requestStartedAt;
    const transferDate = formatPreservedDate_(transferAt, false, recordedTransferAt && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(recordedTransferAt) ? 'Asia/Seoul' : undefined);
    const preserved = [['생년월일', formatPreservedDate_(student.birth_date, true)], ['이메일', student.email], ['소속', student.affiliation], ['재학 상태', student.enrollment_status], ['참고사항', student.notes], ['재학생 최초 등록일', formatPreservedDate_(student.created_at, false)], ['재학생 졸업 전환일', transferDate]].filter(([, value]) => value).map(([label, value]) => `${label}: ${value}`);
    const detail = preserved.length ? `[재학생 전환 시 보존 정보]\n${preserved.join('\n')}` : '';
    const graduateRecord = { graduationYear: year, studentId: studentId, name: student.name, gender: student.gender, phone: student.phone, address: '', status: status, company: '', field: '', detail: detail, gpa: '', updatedAt: nowSeoul_() };
    const graduateRow = targetInfo.headers.map(header => Object.prototype.hasOwnProperty.call(graduateRecord, header) ? graduateRecord[header] : '');
    if (ledgerIndex < 0) {
      transferSheet.appendRow([Utilities.getUuid(), studentId, year, 'prepared', requestStartedAtIso, requestStartedAtIso, '']);
      ledgerIndex = transferSheet.getLastRow() - 2;
    } else if (String(ledgerRows[ledgerIndex + 1][3]) === 'rolled_back') {
      transferSheet.getRange(ledgerIndex + 2, 4).setValue('prepared');
    }
    const ledgerRowNumber = ledgerIndex + 2;
    const writeState = (state, errorText = '') => {
      transferSheet.getRange(ledgerRowNumber, 4).setValue(state);
      transferSheet.getRange(ledgerRowNumber, 6, 1, 2).setValues([[nowSeoul_(), errorText]]);
    };
    let destinationCreatedOrOwned = false;
    let sourceRemoved = false;
    try {
      if (targetIndex < 0) {
        destinationCreatedOrOwned = true;
        targetSheet.appendRow(graduateRow);
      } else {
        const existing = targetRows[targetIndex + 1];
        const priorState = String(ledgerRows[ledgerIndex + 1]?.[3] || 'prepared');
        const cell = (row, header) => targetInfo.indexes[header] == null ? '' : String(row[targetInfo.indexes[header]] == null ? '' : row[targetInfo.indexes[header]]);
        const matchesTransfer = cell(existing, 'name') === student.name && cell(existing, 'gender') === student.gender && cell(existing, 'phone') === student.phone && cell(existing, 'status') === status && (targetInfo.indexes.detail == null || cell(existing, 'detail') === detail);
        if (!matchesTransfer || !['prepared', 'graduate_saved', 'counselings_moved', 'recovery_required'].includes(priorState)) throw new Error('대상 연도의 기존 졸업생 자료를 동일 전환 건으로 확인할 수 없습니다.');
        destinationCreatedOrOwned = true;
      }
      writeState('graduate_saved');
      const savedGraduate = targetSheet.getDataRange().getValues().slice(1).find(row => String(row[studentIdColumn]).trim() === studentId);
      if (!savedGraduate || String(savedGraduate[nameColumn]) !== student.name || String(savedGraduate[statusColumn]) !== status) throw new Error('졸업생 시트 저장 결과를 확인하지 못했습니다.');

      const counselingSheet = getOrCreateSheet_(COUNSELINGS_SHEET, COUNSELING_HEADERS);
      const counselingRows = counselingSheet.getDataRange().getValues();
      const previousLinkedCount = counselingRows.slice(1).filter(row => String(row[2]) === studentId && (String(row[1]) === '재학생' || String(row[1]) === year)).length;
      for (let i = 1; i < counselingRows.length; i++) if (String(counselingRows[i][2]) === studentId && (String(counselingRows[i][1]) === '재학생' || String(counselingRows[i][1]) === year)) counselingSheet.getRange(i + 1, 2).setValue(year);
      writeState('counselings_moved');
      const movedCount = counselingSheet.getDataRange().getValues().slice(1).filter(row => String(row[2]) === studentId && String(row[1]) === year).length;
      if (movedCount < previousLinkedCount) throw new Error('상담 이력 연결 상태를 확인하지 못했습니다.');

      const latestCurrentRows = sourceSheet.getDataRange().getValues();
      const latestSourceIndex = latestCurrentRows.slice(1).findIndex(row => String(row[0]).trim() === studentId);
      if (latestSourceIndex < 0) throw new Error('원본 재학생 데이터를 찾지 못해 전환을 완료할 수 없습니다.');
      sourceSheet.deleteRow(latestSourceIndex + 2);
      sourceRemoved = true;
      writeState('completed');
      appendLog_(session, '재학생 졸업생 전환', year, studentId, student.name, '졸업생 저장 및 상담 이력 연결을 확인한 뒤 재학생 원본 제거');
      return { ok: true, studentId: studentId, graduationYear: year };
    } catch (error) {
      const sourceStillExists = sourceSheet.getDataRange().getValues().slice(1).some(row => String(row[0]).trim() === studentId);
      if (sourceRemoved || !sourceStillExists) {
        const verifiedDestination = targetSheet.getDataRange().getValues().slice(1).some(row => String(row[studentIdColumn]).trim() === studentId && String(row[nameColumn]) === student.name && String(row[statusColumn]) === status);
        if (verifiedDestination) {
          writeState('completed', '원본 삭제 후 응답 처리 오류: ' + (error.message || String(error)));
          return { ok: true, studentId: studentId, graduationYear: year, recoveredAsCompleted: true };
        }
      }
      let rollbackError = '';
      try {
        if (!sourceStillExists) sourceSheet.appendRow(sourceRow);
        const counselingSheet = getOrCreateSheet_(COUNSELINGS_SHEET, COUNSELING_HEADERS);
        const values = counselingSheet.getDataRange().getValues();
        for (let i = 1; i < values.length; i++) if (String(values[i][2]) === studentId && String(values[i][1]) === year) counselingSheet.getRange(i + 1, 2).setValue('재학생');
        if (destinationCreatedOrOwned) {
          const graduates = targetSheet.getDataRange().getValues();
          const detailColumn = targetInfo.indexes.detail;
          const ownedIndex = graduates.slice(1).findIndex(row => String(row[studentIdColumn]).trim() === studentId && String(row[nameColumn]) === student.name && (detailColumn == null || String(row[detailColumn]) === detail));
          if (ownedIndex >= 0) targetSheet.deleteRow(ownedIndex + 2);
        }
        writeState('rolled_back', error.message || String(error));
      } catch (rollback) {
        rollbackError = rollback.message || String(rollback);
        writeState('recovery_required', `${error.message || String(error)} | 복구 실패: ${rollbackError}`);
      }
      throw new Error(rollbackError ? `전환이 중단되어 자동 복구가 끝나지 않았습니다. 재학생 원본은 유지했습니다. 관리자 재처리가 필요합니다: ${rollbackError}` : `전환이 취소되어 재학생 원본은 유지했습니다. ${error.message || String(error)}`);
    }
  } finally { lock.releaseLock(); }
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
  if (student.gpa && (!/^\d{1,2}(\.\d{1,2})?$/.test(student.gpa) || Number(student.gpa) > 4.5)) throw new Error('평점은 0~4.5 범위에서 입력하세요.');
  const info = getGraduateSheetInfo_(year);
  const sheet = info.sheet;
  const values = info.values;
  const index = values.slice(1).findIndex(row => String(row[info.indexes.studentId]).trim() === studentId);
  const isCreate = index < 0;
  const existingStatus = isCreate ? '' : String(values[index + 1][info.indexes.status] || '');
  const preservesLegacyStatus = !isCreate && student.status === existingStatus && ['조사자', '미조사자', '국비교육자'].includes(existingStatus);
  if (student.status && VALID_STATUSES.indexOf(student.status) < 0 && !preservesLegacyStatus) throw new Error('올바른 졸업 후 상태를 선택하세요.');
  if (request.create && !isCreate) throw new Error('이미 등록된 학번입니다. 기존 학생을 선택해 수정하세요.');
  if (!request.create && isCreate) throw new Error('수정할 학생을 찾을 수 없습니다. 목록을 새로고침하세요.');
  if (isCreate) {
    student.updatedAt = now_();
    sheet.appendRow(info.headers.map(header => Object.prototype.hasOwnProperty.call(student, header) ? student[header] : ''));
  } else {
    student.updatedAt = now_();
    const updatedRow = [...values[index + 1]];
    DATA_HEADERS.forEach(header => { if (info.indexes[header] != null) updatedRow[info.indexes[header]] = student[header] || ''; });
    sheet.getRange(index + 2, 1, 1, info.headers.length).setValues([updatedRow.slice(0, info.headers.length)]);
  }
  appendLog_(session, isCreate ? '학생 등록' : '학생 수정', year, studentId, name, isCreate ? '학생 정보 등록' : '학생 정보 수정');
  return { ok: true, student: student };
}

function deleteStudent_(session, request) {
  const year = String(request.year || '').trim();
  const studentId = String(request.studentId || '').trim();
  if (!studentId) throw new Error('삭제할 학번이 없습니다.');
  const info = getGraduateSheetInfo_(year);
  const sheet = info.sheet;
  const values = info.values;
  const index = values.slice(1).findIndex(row => String(row[info.indexes.studentId]).trim() === studentId);
  if (index < 0) throw new Error('학생을 찾을 수 없습니다.');
  const row = values[index + 1];
  appendLog_(session, '학생 삭제', year, row[info.indexes.studentId], row[info.indexes.name], '학생 정보 삭제');
  sheet.deleteRow(index + 2);
  return { ok: true };
}

// 상태별 통계는 현재 유효한 상태 목록만 집계합니다. 과거 미지원 상태는 합계에는 포함되지만 상태 카운트에는 포함되지 않습니다.
function getStatistics_() {
  return listDataSheets_().sort((a, b) => b.localeCompare(a, undefined, { numeric: true })).map(year => {
    const rows = readStudents_(year);
    const counts = Object.fromEntries(VALID_STATUSES.map(status => [status, 0]));
    rows.forEach(student => { if (Object.prototype.hasOwnProperty.call(counts, student.status)) counts[student.status]++; });
    return { year: year, total: rows.length, counts: counts };
  });
}

function findStudent_(year, studentId) {
  if (String(year || '').trim() === '재학생') {
    const student = readCurrentStudents_().find(row => row.student_id === String(studentId || '').trim());
    if (!student) throw new Error('재학생 명단에서 학생을 찾을 수 없습니다.');
    return { studentId: student.student_id, name: student.name };
  }
  const student = readStudents_(year).find(row => row.studentId === String(studentId || '').trim());
  if (!student) throw new Error('선택한 연도의 학생 명단에서 학생을 찾을 수 없습니다.');
  return student;
}
// 상담은 학생 데이터 행과 분리된 시트에 저장하고, 조회 시 연도와 학생 ID로 범위를 제한합니다.
function readCounselings_(year, studentId) {
  const targetYear = String(year || '').trim();
  const targetStudentId = String(studentId || '').trim();
  if (!targetYear || !targetStudentId) throw new Error('연도와 학생을 선택하세요.');
  findStudent_(targetYear, targetStudentId);
  return getOrCreateSheet_(COUNSELINGS_SHEET, COUNSELING_HEADERS).getDataRange().getValues().slice(1).filter(row => row.some(Boolean) && String(row[1]) === targetYear && String(row[2]) === targetStudentId)
    .map(row => Object.fromEntries(COUNSELING_HEADERS.map((header, i) => [header, row[i] == null ? '' : String(row[i])])) )
    .sort((a, b) => b.counseledAt.localeCompare(a.counseledAt) || b.createdAt.localeCompare(a.createdAt));
}
function saveCounseling_(session, request) {
  const year = String(request.year || '').trim();
  const studentId = String(request.studentId || '').trim();
  const input = request.counseling || {};
  const counselingId = String(input.counselingId || '').trim();
  const counseledAt = String(input.counseledAt || '').trim();
  const content = String(input.content || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(counseledAt)) throw new Error('상담 일시를 입력하세요.');
  if (!content) throw new Error('상담 내용을 입력하세요.');
  const student = findStudent_(year, studentId);
  const sheet = getOrCreateSheet_(COUNSELINGS_SHEET, COUNSELING_HEADERS);
  const values = sheet.getDataRange().getValues();
  const index = counselingId ? values.slice(1).findIndex(row => String(row[0]) === counselingId && String(row[1]) === year && String(row[2]) === studentId) : -1;
  if (counselingId && index < 0) throw new Error('수정할 상담 기록을 찾을 수 없습니다.');
  const now = nowSeoul_();
  const existing = index >= 0 ? values[index + 1] : null;
  const record = [existing ? String(existing[0]) : Utilities.getUuid(), year, studentId, student.name, counseledAt, content, existing ? String(existing[6]) : session.userId, existing ? String(existing[7]) : session.name, existing ? String(existing[8]) : now, now];
  if (existing) sheet.getRange(index + 2, 1, 1, COUNSELING_HEADERS.length).setValues([record]); else sheet.appendRow(record);
  appendLog_(session, existing ? '상담 기록 수정' : '상담 기록 등록', year, studentId, student.name, existing ? '학생 상담 내용 수정' : '학생 상담 내용 등록');
  return { ok: true, counseling: Object.fromEntries(COUNSELING_HEADERS.map((header, i) => [header, record[i]])) };
}
function deleteCounseling_(session, request) {
  const year = String(request.year || '').trim();
  const studentId = String(request.studentId || '').trim();
  const counselingId = String(request.counselingId || '').trim();
  const student = findStudent_(year, studentId);
  const sheet = getOrCreateSheet_(COUNSELINGS_SHEET, COUNSELING_HEADERS);
  const index = sheet.getDataRange().getValues().slice(1).findIndex(row => String(row[0]) === counselingId && String(row[1]) === year && String(row[2]) === studentId);
  if (!counselingId || index < 0) throw new Error('삭제할 상담 기록을 찾을 수 없습니다.');
  sheet.deleteRow(index + 2);
  appendLog_(session, '상담 기록 삭제', year, studentId, student.name, '학생 상담 기록 삭제');
  return { ok: true };
}

// 일정 시트는 사용자가 만든 구조를 유지합니다. 탭 이름과 첫 행 헤더가 다르면 쓰기 전에 오류를 반환합니다.
function getRequiredScheduleSheet_(name, headers) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(name);
  if (!sheet) throw new Error(name + ' 시트가 없습니다. Google Sheets에 안내된 탭을 추가하세요.');
  const actual = sheet.getRange(1, 1, 1, headers.length).getValues()[0].map(value => String(value || '').trim());
  if (headers.some((header, index) => actual[index] !== header)) throw new Error(name + ' 시트의 첫 행 컬럼명이 안내된 구조와 다릅니다.');
  return sheet;
}
function readScheduleCategories_() {
  const values = getRequiredScheduleSheet_(SCHEDULE_CATEGORIES_SHEET, SCHEDULE_CATEGORY_HEADERS).getDataRange().getValues();
  return values.slice(1).filter(row => row.some(Boolean)).map(row => ({
    category_id: String(row[0] || ''), category_name: String(row[1] || ''), color_hex: String(row[2] || ''),
    is_active: String(row[3]).toLowerCase() !== 'false' && String(row[3]) !== '0', sort_order: Number(row[4] || 0),
  })).sort((a, b) => a.sort_order - b.sort_order || a.category_name.localeCompare(b.category_name));
}
// 일정 조회는 서버 세션의 userId로 소유자를 필터링합니다. 클라이언트가 보낸 사용자 ID는 사용하지 않습니다.
function readSchedules_(session, fromDate, toDate) {
  const from = String(fromDate || '');
  const to = String(toDate || '');
  if (!isValidDateOnly_(from) || !isValidDateOnly_(to) || from > to) throw new Error('조회할 달력 날짜 범위가 올바르지 않습니다.');
  const values = getRequiredScheduleSheet_(SCHEDULES_SHEET, SCHEDULE_HEADERS).getDataRange().getValues();
  return values.slice(1).filter(row => row.some(Boolean) && String(row[1]) === session.userId).map(row => scheduleObject_(row)).filter(item => {
    const startDate = item.start_datetime.slice(0, 10);
    const endDate = item.end_datetime.slice(0, 10);
    const repeats = item.repeat_type !== 'none' && (!item.repeat_until || item.repeat_until >= from);
    return startDate <= to && (endDate >= from || repeats);
  }).sort((a, b) => a.start_datetime.localeCompare(b.start_datetime) || a.title.localeCompare(b.title));
}
function scheduleObject_(row) {
  return Object.fromEntries(SCHEDULE_FIELDS.map((header, index) => {
    let value = row[index] == null ? '' : String(row[index]);
    if (header === 'all_day') value = String(value).toLowerCase() === 'true' || value === '1';
    if (header === 'repeat_interval') value = Number(value || 1);
    return [header, value];
  }));
}
function isValidDateOnly_(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const date = new Date(value + 'T00:00:00Z');
  return !isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function isValidSeoulDateTime_(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+09:00$/.test(String(value || ''))) return false;
  const date = new Date(value);
  return !isNaN(date.getTime()) && new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 19) === value.slice(0, 19);
}
// 일정 저장·수정은 동일한 schedule_id 행을 갱신합니다. 신규/수정 모두 소유자와 작성자는 세션에서 정합니다.
function saveSchedule_(session, request) {
  const input = request.schedule || {};
  const id = String(input.schedule_id || '').trim();
  const title = String(input.title || '').trim();
  const categoryId = String(input.category_id || '').trim();
  const start = String(input.start_datetime || '').trim();
  const end = String(input.end_datetime || '').trim();
  const allDay = input.all_day === true || String(input.all_day).toLowerCase() === 'true';
  const repeatType = String(input.repeat_type || 'none');
  const repeatInterval = Number(input.repeat_interval || 1);
  const repeatUntil = String(input.repeat_until || '').trim();
  if (!title || title.length > 200) throw new Error('일정 제목을 1~200자로 입력하세요.');
  if (!isValidSeoulDateTime_(start) || !isValidSeoulDateTime_(end)) throw new Error('일정 날짜와 시간 형식이 올바르지 않습니다.');
  if (new Date(start).getTime() > new Date(end).getTime()) throw new Error('종료 일시는 시작 일시보다 빠를 수 없습니다.');
  if (!['none', 'daily', 'weekly', 'monthly'].includes(repeatType)) throw new Error('반복 유형이 올바르지 않습니다.');
  if (!Number.isInteger(repeatInterval) || repeatInterval < 1 || repeatInterval > 99) throw new Error('반복 간격은 1~99 사이의 정수여야 합니다.');
  if (repeatUntil && (!isValidDateOnly_(repeatUntil) || repeatUntil < start.slice(0, 10))) throw new Error('반복 종료일은 시작 날짜 이후로 입력하세요.');
  if (repeatType === 'none' && repeatUntil) throw new Error('반복하지 않는 일정에는 반복 종료일을 지정할 수 없습니다.');
  const category = readScheduleCategories_().find(item => item.category_id === categoryId && item.is_active && /^#[0-9a-fA-F]{6}$/.test(item.color_hex));
  if (!category) throw new Error('사용 가능한 카테고리를 선택하세요.');
  const sheet = getRequiredScheduleSheet_(SCHEDULES_SHEET, SCHEDULE_HEADERS);
  const values = sheet.getDataRange().getValues();
  const index = id ? values.slice(1).findIndex(row => String(row[0]) === id && String(row[1]) === session.userId) : -1;
  if (id && index < 0) throw new Error('수정할 일정을 찾을 수 없습니다.');
  const existing = index >= 0 ? values[index + 1] : null;
  const now = nowSeoul_();
  const row = [existing ? String(existing[0]) : Utilities.getUuid(), session.userId, existing ? String(existing[2]) : session.name, title, categoryId, start, end, allDay, String(input.location || '').trim(), String(input.description || '').trim(), repeatType, repeatInterval, repeatType === 'none' ? '' : repeatUntil, existing ? String(existing[13]) : now, now];
  if (existing) sheet.getRange(index + 2, 1, 1, SCHEDULE_HEADERS.length).setValues([row]); else sheet.appendRow(row);
  return { ok: true, schedule: scheduleObject_(row) };
}
// 삭제 조건에 일정 ID와 세션 사용자 ID를 함께 넣어 다른 사용자의 일정은 지울 수 없게 합니다.
function deleteSchedule_(session, request) {
  const id = String(request.schedule_id || '').trim();
  if (!id) throw new Error('삭제할 일정 ID가 없습니다.');
  const sheet = getRequiredScheduleSheet_(SCHEDULES_SHEET, SCHEDULE_HEADERS);
  const values = sheet.getDataRange().getValues();
  const index = values.slice(1).findIndex(row => String(row[0]) === id && String(row[1]) === session.userId);
  if (index < 0) throw new Error('삭제할 일정을 찾을 수 없습니다.');
  sheet.deleteRow(index + 2);
  return { ok: true };
}

function readLogs_() {
  const values = getOrCreateSheet_(LOGS_SHEET, LOG_HEADERS).getDataRange().getValues();
  return values.slice(1).filter(row => row.some(Boolean)).slice(-300).reverse().map(row => Object.fromEntries(LOG_HEADERS.map((header, i) => [header, row[i] instanceof Date ? Utilities.formatDate(row[i], Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss') : String(row[i] == null ? '' : row[i])] )));
}
function appendLog_(session, action, year, studentId, studentName, detail) {
  const sheet = getOrCreateSheet_(LOGS_SHEET, LOG_HEADERS);
  sheet.appendRow([new Date(), session.userId, session.name, action, year || '', studentId || '', studentName || '', detail || '']);
}
function readArchivePosts_() {
  const postSheet = getOrCreateSheet_(ARCHIVE_POSTS_SHEET, ARCHIVE_POST_HEADERS);
  getOrCreateSheet_(ARCHIVE_FILES_SHEET, ARCHIVE_FILE_HEADERS);
  const fileRows = getOrCreateSheet_(ARCHIVE_FILES_SHEET, ARCHIVE_FILE_HEADERS).getDataRange().getValues().slice(1);
  const filesByPost = {};
  fileRows.filter(row => ['active', 'delete_failed'].includes(String(row[11]))).forEach(row => {
    const key = String(row[1]);
    if (!filesByPost[key]) filesByPost[key] = [];
    filesByPost[key].push({ fileId: String(row[0]), originalFilename: String(row[3]), fileType: String(row[5]), mimeType: String(row[6]), fileSize: Number(row[7]) || 0 });
  });
  return postSheet.getDataRange().getValues().slice(1).filter(row => row.some(Boolean) && String(row[8]) === 'active').map(row => ({
    postId: String(row[0]), title: String(row[1]), content: String(row[2]), authorId: String(row[3]), authorName: String(row[4]),
    createdAt: archiveDate_(row[5]), updatedAt: archiveDate_(row[6]), viewCount: Number(row[7]) || 0, files: filesByPost[String(row[0])] || []
  })).reverse();
}
function saveArchivePost_(session, input) {
  const title = String(input.title || '').trim();
  if (!title) throw new Error('자료 제목을 입력해 주세요.');
  if (title.length > 200) throw new Error('자료 제목은 200자 이내로 입력해 주세요.');
  const content = String(input.content || '');
  if (content.length > 50000) throw new Error('자료 내용은 50,000자 이내로 입력해 주세요.');
  getOrCreateSheet_(ARCHIVE_FILES_SHEET, ARCHIVE_FILE_HEADERS);
  const sheet = getOrCreateSheet_(ARCHIVE_POSTS_SHEET, ARCHIVE_POST_HEADERS);
  const rows = sheet.getDataRange().getValues();
  const postId = String(input.postId || '').trim();
  const existingIndex = postId ? rows.slice(1).findIndex(row => String(row[0]) === postId && String(row[8]) === 'active') : -1;
  if (postId && existingIndex < 0) throw new Error('수정할 게시글을 찾을 수 없습니다.');
  const timestamp = nowSeoul_();
  if (existingIndex >= 0) {
    const rowNumber = existingIndex + 2;
    sheet.getRange(rowNumber, 2, 1, 1).setValue(title);
    sheet.getRange(rowNumber, 3, 1, 1).setValue(content);
    sheet.getRange(rowNumber, 7, 1, 1).setValue(timestamp);
    appendLog_(session, '자료실 수정', '', postId, title, '자료 게시글 수정');
    return { ok: true, postId: postId };
  }
  const newId = Utilities.getUuid();
  sheet.appendRow([newId, title, content, session.userId, session.name, timestamp, timestamp, 0, input.publish === false ? 'draft' : 'active']);
  appendLog_(session, '자료실 등록', '', newId, title, '자료 게시글 등록');
  return { ok: true, postId: newId };
}
function publishArchivePost_(session, requestedId) {
  const postId = String(requestedId || '').trim();
  const sheet = getOrCreateSheet_(ARCHIVE_POSTS_SHEET, ARCHIVE_POST_HEADERS);
  const rows = sheet.getDataRange().getValues();
  const index = rows.slice(1).findIndex(row => String(row[0]) === postId && ['draft', 'active'].includes(String(row[8])));
  if (index < 0) throw new Error('게시할 자료를 찾을 수 없습니다.');
  sheet.getRange(index + 2, 9).setValue('active');
  sheet.getRange(index + 2, 7).setValue(nowSeoul_());
  appendLog_(session, '자료실 공개', '', postId, String(rows[index + 1][1]), '자료 게시글 공개');
  return { ok: true, postId: postId };
}
function deleteArchivePost_(session, requestedId) {
  const postId = String(requestedId || '').trim();
  if (!postId) throw new Error('삭제할 게시글 ID가 없습니다.');
  const sheet = getOrCreateSheet_(ARCHIVE_POSTS_SHEET, ARCHIVE_POST_HEADERS);
  const rows = sheet.getDataRange().getValues();
  const index = rows.slice(1).findIndex(row => String(row[0]) === postId && String(row[8]) === 'active');
  if (index < 0) throw new Error('삭제할 게시글을 찾을 수 없습니다.');
  sheet.getRange(index + 2, 9).setValue('deleted');
  sheet.getRange(index + 2, 7).setValue(nowSeoul_());
  appendLog_(session, '자료실 삭제', '', postId, String(rows[index + 1][1]), '자료 게시글 삭제');
  return { ok: true };
}
function incrementArchiveView_(requestedId) {
  const postId = String(requestedId || '').trim();
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getOrCreateSheet_(ARCHIVE_POSTS_SHEET, ARCHIVE_POST_HEADERS);
    const rows = sheet.getDataRange().getValues();
    const index = rows.slice(1).findIndex(row => String(row[0]) === postId && String(row[8]) === 'active');
    if (index < 0) throw new Error('자료 게시글을 찾을 수 없습니다.');
    const rowNumber = index + 2;
    const count = (Number(rows[rowNumber - 1][7]) || 0) + 1;
    sheet.getRange(rowNumber, 8).setValue(count);
    return { ok: true, viewCount: count };
  } finally { lock.releaseLock(); }
}
function archiveDate_(value) {
  if (value instanceof Date) return Utilities.formatDate(value, 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');
  return String(value == null ? '' : value);
}
function archiveBridge_(request, callback) {
  const expected = PropertiesService.getScriptProperties().getProperty('ARCHIVE_BRIDGE_SECRET');
  if (!expected || String(request.bridgeSecret || '') !== expected) throw new Error('자료실 서버 연결 인증에 실패했습니다.');
  return callback();
}
function archiveUploadStart_(session, request) {
  const postId = String(request.postId || '').trim();
  const files = Array.isArray(request.files) ? request.files : [];
  if (!postId || !files.length) throw new Error('게시글과 첨부파일을 확인해 주세요.');
  if (files.length > 30) throw new Error('한 번에 첨부할 수 있는 파일은 최대 30개입니다.');
  const postSheet = getOrCreateSheet_(ARCHIVE_POSTS_SHEET, ARCHIVE_POST_HEADERS);
  const postRows = postSheet.getDataRange().getValues();
  if (!postRows.slice(1).some(row => String(row[0]) === postId && ['active', 'draft'].includes(String(row[8])))) throw new Error('첨부할 게시글을 찾을 수 없습니다.');
  const totals = { video: 0, other: 0 };
  const normalized = files.map(file => {
    const originalFilename = String(file.name || '').replace(/[\\/\u0000-\u001f]/g, '_').trim().slice(0, 240);
    const ext = originalFilename.includes('.') ? originalFilename.split('.').pop().toLowerCase() : '';
    const rule = ARCHIVE_ALLOWED[ext];
    const size = Number(file.size);
    const mimeType = String(file.mimeType || 'application/octet-stream').toLowerCase();
    if (!rule || !originalFilename || !Number.isSafeInteger(size) || size <= 0) throw new Error('허용되지 않는 파일 형식이거나 파일 정보가 올바르지 않습니다.');
    if (mimeType !== 'application/octet-stream' && mimeType !== rule[0]) throw new Error(originalFilename + ' 파일의 MIME 형식이 확장자와 일치하지 않습니다.');
    const group = rule[1] === 'video' ? 'video' : 'other';
    totals[group] += size;
    if (totals[group] > ARCHIVE_UPLOAD_LIMITS[group]) throw new Error(group === 'video' ? '동영상 파일은 한 번의 업로드에서 최대 500MB까지 첨부할 수 있습니다.' : '이미지·문서·압축파일은 한 번의 업로드에서 합계 200MB까지 첨부할 수 있습니다.');
    return { originalFilename: originalFilename, extension: ext, size: size, mimeType: mimeType === 'application/octet-stream' ? rule[0] : mimeType, fileType: rule[1], fileId: Utilities.getUuid() };
  });
  const props = PropertiesService.getScriptProperties();
  let folderId = props.getProperty('ARCHIVE_DRIVE_FOLDER_ID');
  if (!folderId) {
    const folders = DriveApp.getFoldersByName(ARCHIVE_DRIVE_FOLDER_NAME);
    const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(ARCHIVE_DRIVE_FOLDER_NAME);
    folderId = folder.getId();
    props.setProperty('ARCHIVE_DRIVE_FOLDER_ID', folderId);
  }
  const token = ScriptApp.getOAuthToken();
  const sessions = normalized.map(file => {
    const storedFilename = Utilities.getUuid() + '.' + file.extension;
    const metadata = { name: storedFilename, mimeType: file.mimeType, parents: [folderId], appProperties: { archivePostId: postId, archiveFileId: file.fileId }, description: '자료실 게시글 첨부 파일' };
    const response = UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,mimeType,size,parents', {
      method: 'post', contentType: 'application/json; charset=UTF-8', payload: JSON.stringify(metadata), muteHttpExceptions: true,
      headers: { Authorization: 'Bearer ' + token, 'X-Upload-Content-Type': file.mimeType, 'X-Upload-Content-Length': String(file.size) }
    });
    if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
      console.error('Archive resumable session initialization failed', response.getResponseCode(), response.getContentText().slice(0, 500));
      throw new Error('Google Drive 업로드 준비에 실패했습니다.');
    }
    const headers = response.getAllHeaders();
    const sessionUrl = headers.Location || headers.location;
    if (!sessionUrl) throw new Error('Google Drive가 업로드 세션 주소를 반환하지 않았습니다.');
    return { uploadId: file.fileId, sessionUrl: String(sessionUrl), postId: postId, fileId: file.fileId, originalFilename: file.originalFilename, extension: file.extension, storedFilename: storedFilename, fileType: file.fileType, mimeType: file.mimeType, fileSize: file.size, driveFolderId: folderId, uploadedBy: session.userId, authorName: session.name };
  });
  return { ok: true, uploads: sessions };
}
function archiveUploadComplete_(session, request) {
  const fileId = String(request.fileId || '').trim();
  const postId = String(request.postId || '').trim();
  const driveFileId = String(request.driveFileId || '').trim();
  if (!fileId || !postId || !driveFileId) throw new Error('업로드 파일 정보를 확인할 수 없습니다.');
  const token = ScriptApp.getOAuthToken();
  const verify = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(driveFileId) + '?fields=id,name,mimeType,size,parents,appProperties', { headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true });
  if (verify.getResponseCode() !== 200) throw new Error('Google Drive에 저장된 파일을 확인하지 못했습니다.');
  const actual = JSON.parse(verify.getContentText());
  if (actual.appProperties?.archivePostId !== postId || actual.appProperties?.archiveFileId !== fileId || !actual.parents?.includes(String(request.driveFolderId || ''))) throw new Error('Google Drive 파일 검증에 실패했습니다.');
  const sheet = getOrCreateSheet_(ARCHIVE_FILES_SHEET, ARCHIVE_FILE_HEADERS);
  const rows = sheet.getDataRange().getValues();
  const existing = rows.slice(1).findIndex(row => String(row[0]) === fileId);
  const data = [fileId, postId, driveFileId, request.originalFilename, request.storedFilename, request.fileType, request.mimeType, Number(actual.size) || Number(request.fileSize) || 0, request.driveFolderId, session.userId, nowSeoul_(), 'active'];
  if (existing >= 0) sheet.getRange(existing + 2, 1, 1, data.length).setValues([data]); else sheet.appendRow(data);
  return { ok: true, fileId: fileId, fileSize: Number(actual.size) || Number(request.fileSize) || 0 };
}
function archiveDownloadInfo_(fileId) {
  const rows = getOrCreateSheet_(ARCHIVE_FILES_SHEET, ARCHIVE_FILE_HEADERS).getDataRange().getValues();
  const row = rows.slice(1).find(item => String(item[0]) === String(fileId) && String(item[11]) === 'active');
  if (!row) throw new Error('다운로드할 파일을 찾을 수 없습니다.');
  const posts = getOrCreateSheet_(ARCHIVE_POSTS_SHEET, ARCHIVE_POST_HEADERS).getDataRange().getValues();
  if (!posts.slice(1).some(post => String(post[0]) === String(row[1]) && String(post[8]) === 'active')) throw new Error('게시글에 연결된 파일이 아닙니다.');
  return { ok: true, driveToken: ScriptApp.getOAuthToken(), driveFileId: String(row[2]), filename: String(row[3]), mimeType: String(row[6]), fileSize: Number(row[7]) || 0 };
}
function archivePrepareFileDelete_(session, fileId) {
  const rows = getOrCreateSheet_(ARCHIVE_FILES_SHEET, ARCHIVE_FILE_HEADERS).getDataRange().getValues();
  const row = rows.slice(1).find(item => String(item[0]) === String(fileId) && ['active', 'delete_failed'].includes(String(item[11])));
  if (!row) throw new Error('삭제할 파일을 찾을 수 없습니다.');
  return { ok: true, fileId: String(row[0]), driveFileId: String(row[2]), driveToken: ScriptApp.getOAuthToken() };
}
function archiveCompleteFileDelete_(session, fileId) {
  const sheet = getOrCreateSheet_(ARCHIVE_FILES_SHEET, ARCHIVE_FILE_HEADERS);
  const rows = sheet.getDataRange().getValues();
  const index = rows.slice(1).findIndex(row => String(row[0]) === String(fileId));
  if (index < 0) throw new Error('삭제할 파일 메타데이터를 찾을 수 없습니다.');
  sheet.getRange(index + 2, 12).setValue('deleted');
  appendLog_(session, '자료실 파일 삭제', '', String(fileId), String(rows[index + 1][3]), 'Drive 첨부파일 삭제');
  return { ok: true };
}
function archivePreparePostDelete_(postId) {
  const id = String(postId || '').trim();
  const posts = getOrCreateSheet_(ARCHIVE_POSTS_SHEET, ARCHIVE_POST_HEADERS).getDataRange().getValues();
  if (!posts.slice(1).some(row => String(row[0]) === id && String(row[8]) === 'active')) throw new Error('삭제할 게시글을 찾을 수 없습니다.');
  const files = getOrCreateSheet_(ARCHIVE_FILES_SHEET, ARCHIVE_FILE_HEADERS).getDataRange().getValues().slice(1).filter(row => String(row[1]) === id && ['active', 'delete_failed'].includes(String(row[11]))).map(row => ({ fileId: String(row[0]), driveFileId: String(row[2]) }));
  return { ok: true, postId: id, files: files, driveToken: ScriptApp.getOAuthToken() };
}
function archiveCompletePostDelete_(session, postId, failedFileIds) {
  const id = String(postId || '').trim();
  const failed = new Set((Array.isArray(failedFileIds) ? failedFileIds : []).map(String));
  const files = getOrCreateSheet_(ARCHIVE_FILES_SHEET, ARCHIVE_FILE_HEADERS);
  const rows = files.getDataRange().getValues();
  rows.slice(1).forEach((row, index) => { if (String(row[1]) === id) files.getRange(index + 2, 12).setValue(failed.has(String(row[0])) ? 'delete_failed' : 'deleted'); });
  const posts = getOrCreateSheet_(ARCHIVE_POSTS_SHEET, ARCHIVE_POST_HEADERS);
  const postRows = posts.getDataRange().getValues();
  const index = postRows.slice(1).findIndex(row => String(row[0]) === id);
  if (index < 0) throw new Error('삭제할 게시글을 찾을 수 없습니다.');
  posts.getRange(index + 2, 9).setValue(failed.size ? 'active' : 'deleted');
  posts.getRange(index + 2, 7).setValue(nowSeoul_());
  appendLog_(session, failed.size ? '자료실 파일 정리 실패' : '자료실 삭제', '', id, String(postRows[index + 1][1]), failed.size ? '일부 Drive 파일 삭제 실패' : '게시글 및 첨부파일 삭제');
  if (failed.size) throw new Error('게시글 삭제 중 일부 Drive 파일 정리에 실패했습니다. 관리자 확인 후 다시 시도해 주세요.');
  return { ok: true };
}
// 자동 생성 대상(사용자, 상담, 로그 등)에만 사용합니다. 사용자가 만든 일정 시트 검증에는 사용하지 않습니다.
function getOrCreateSheet_(name, headers) {
  const book = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = book.getSheetByName(name);
  if (!sheet) sheet = book.insertSheet(name);
  if (sheet.getLastRow() === 0) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  return sheet;
}
function now_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss'); }
function nowSeoul_() { return Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss'); }
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
