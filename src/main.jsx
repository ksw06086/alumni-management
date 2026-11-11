import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowDown, ArrowUp, ArrowUpDown, Archive, BarChart3, CalendarDays, Check, Download, GraduationCap, LayoutDashboard, LogOut, Menu, Plus, RefreshCw, Save, Settings, Trash2, Users, X } from 'lucide-react';
import { EMPLOYMENT_CATEGORIES, getEmploymentSummary } from './employment.js';
import SchedulePage from './SchedulePage.jsx';
import CurrentStudentsPage from './CurrentStudentsPage.jsx';
import StudentListHeader from './StudentListHeader.jsx';
import { getStudentStatusColor } from './studentStatus.js';
import { filterStudentRows, sortStudentRows } from './studentTableUtils.js';
import { formatTransferDetailForDisplay } from './dateFormat.js';
import LoginScreen from './LoginScreen.jsx';
import ArchivePage from './ArchivePage.jsx';
import './styles.css';
import './counseling.css';
import './loading.css';
import './current-students.css';
import './student-ui.css';

// 배포 환경별 값은 Vite 빌드 시 주입됩니다. 브라우저는 Worker URL만 호출합니다.
const API_URL = import.meta.env.VITE_API_BASE_URL || '';
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const STATUSES = ['취업자', '진학자', '미취업자', '군입대자', '기타'];
const EMPTY_STUDENT = { graduationYear: '', studentId: '', name: '', gender: '', phone: '', address: '', status: '미취업자', company: '', field: '', detail: '', gpa: '' };
const NAV = [
  { id: 'dashboard', label: '대시보드', icon: LayoutDashboard },
  { id: 'students', label: '졸업생 명단', icon: GraduationCap },
  { id: 'currentStudents', label: '재학생관리', icon: Users, admin: true },
  { id: 'analytics', label: '통계 및 분석', icon: BarChart3 },
  { id: 'schedule', label: '일정', icon: CalendarDays },
  { id: 'archive', label: '자료실', icon: Archive },
  { id: 'settings', label: '시스템 설정', icon: Settings, admin: true },
];
const SESSION_KEY = 'alumni-management.session';

function formatKoreanDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || '';
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric',
    weekday: 'short', hour: 'numeric', minute: '2-digit', hourCycle: 'h23',
  }).format(date);
}

function formatKoreanDate(value) {
  const datePart = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return value || '';
  const date = new Date(`${datePart}T00:00:00+09:00`);
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric' }).format(date);
}

// 로그인 세션은 현재 탭을 새로고침해도 유지되도록 sessionStorage에 저장합니다.
function readSavedSession() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
    return saved?.auth?.token ? saved : null;
  } catch (_) { return null; }
}

// 모든 화면의 API 호출 경계입니다. 서버 오류 형식을 사용자용 예외로 통일합니다.
async function api(action, payload = {}) {
  if (!API_URL) throw new Error('VITE_API_BASE_URL이 설정되지 않았습니다. 배포 설정을 확인하세요.');
  let response;
  try { response = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...payload }) }); }
  catch (_) { throw new Error('서버에 연결할 수 없습니다. 네트워크와 API 설정을 확인하세요.'); }
  let result;
  try { result = await response.json(); } catch (_) { throw new Error(`서버 응답을 읽을 수 없습니다. (HTTP ${response.status})`); }
  if (!response.ok || !result.ok) throw new Error(result.error || `요청에 실패했습니다. (HTTP ${response.status})`);
  return result;
}

function App() {
  // 서버 데이터(auth, students 등)와 화면 상태(page, draft 등)를 이 컴포넌트에서 관리합니다.
  const [savedSession] = useState(readSavedSession);
  const [auth, setAuth] = useState(savedSession?.auth || null);
  const [sessionReady, setSessionReady] = useState(!savedSession);
  const [sheets, setSheets] = useState(savedSession?.sheets || []), [year, setYear] = useState(savedSession?.year || '');
  const [sheetsLoad, setSheetsLoad] = useState({ status: savedSession ? 'loaded' : 'idle', error: '' });
  const [students, setStudents] = useState([]), [status, setStatus] = useState('전체학생'), [query, setQuery] = useState('');
  const [studentsLoad, setStudentsLoad] = useState({ status: 'idle', error: '' });
  const [page, setPage] = useState(window.location.hash === '#/current-students' ? 'currentStudents' : 'dashboard'), [selected, setSelected] = useState(null), [draft, setDraft] = useState(null), [menuOpen, setMenuOpen] = useState(false);
  const [users, setUsers] = useState([]), [analytics, setAnalytics] = useState([]);
  const [counselings, setCounselings] = useState([]), [counselingStudentId, setCounselingStudentId] = useState(''), [counselingSearch, setCounselingSearch] = useState(''), [counselingDraft, setCounselingDraft] = useState(null);
  const [counselingPage, setCounselingPage] = useState(1), [counselingDetail, setCounselingDetail] = useState(null);
  const counselingFetchSequence = useRef(0);
  const studentsFetchSequence = useRef(0);
  const pageFetchSequences = useRef({ analytics: 0, settings: 0 });
  const [counselingsLoad, setCounselingsLoad] = useState({ status: 'idle', error: '' });
  const [analyticsLoad, setAnalyticsLoad] = useState({ status: 'idle', error: '' });
  const [usersLoad, setUsersLoad] = useState({ status: 'idle', error: '' });
  const [message, setMessage] = useState(''), [loading, setLoading] = useState(false), [refreshingSheets, setRefreshingSheets] = useState(false), [userDraft, setUserDraft] = useState(null);

  // 공통 로딩·오류 처리기입니다. API 작업 후 상단 알림과 버튼 상태를 갱신합니다.
  const run = async (work, successMessage = '') => {
    setLoading(true);
    try { const result = await work(); if (successMessage) setMessage(successMessage); return result; }
    catch (error) {
      setMessage(error.message);
      if (error.message.includes('로그인이 만료') || error.message.includes('계정이 비활성화')) setAuth(null);
      return null;
    }
    finally { setLoading(false); }
  };
  // 로그인 응답의 토큰·사용자·시트 목록으로 앱 초기 상태를 채웁니다.
  const completeLogin = async result => {
    setAuth({ token: result.token, user: result.user }); setSessionReady(true); setSheets(result.sheets || []); setSheetsLoad({ status: 'loaded', error: '' });
    const initialYear = result.sheets?.[0] || ''; setYear(initialYear); setPage('dashboard'); window.history.replaceState(null, '', '#/');
    setMessage('로그인되었습니다.');
  };
  const googleLogin = () => {
    if (!CLIENT_ID) return setMessage('Google Client ID가 설정되지 않았습니다.');
    if (!window.google?.accounts?.oauth2) return setMessage('Google 인증 모듈을 불러오는 중입니다. 잠시 후 다시 시도하세요.');
    const client = window.google.accounts.oauth2.initTokenClient({ client_id: CLIENT_ID, scope: 'openid email profile', callback: response => {
      if (response.error) return setMessage('Google 로그인이 실패했습니다.');
      run(() => api('googleLogin', { accessToken: response.access_token }).then(completeLogin));
    } });
    client.requestAccessToken({ prompt: 'select_account' });
  };
  // 연도 시트가 바뀌면 학생 목록을 다시 읽고 이전 학생 선택·상담 편집 상태를 초기화합니다.
  const loadStudents = useCallback(async (token = auth?.token, target = year) => {
    const sequence = ++studentsFetchSequence.current;
    if (!token || !target) { setStudents([]); setStudentsLoad({ status: 'loaded', error: '' }); return; }
    setStudentsLoad({ status: 'loading', error: '' });
    setSelected(null); setDraft(null); setCounselingStudentId(''); setCounselings([]); setCounselingDraft(null); setCounselingsLoad({ status: 'idle', error: '' }); counselingFetchSequence.current += 1;
    try {
      const result = await api('students', { token, year: target });
      if (sequence !== studentsFetchSequence.current) return;
      setStudents(result.students || []); setSelected(null); setDraft(null); setCounselings([]); setCounselingStudentId(''); setCounselingDraft(null); counselingFetchSequence.current += 1;
      setStudentsLoad({ status: 'loaded', error: '' }); setCounselingsLoad({ status: 'idle', error: '' });
    } catch (error) {
      if (sequence !== studentsFetchSequence.current) return;
      setStudentsLoad({ status: 'error', error: error.message });
      throw error;
    }
  }, [auth?.token, year]);
  const retryStudents = () => run(() => loadStudents(auth.token, year));
  const changeYear = nextYear => {
    studentsFetchSequence.current += 1; counselingFetchSequence.current += 1;
    setYear(nextYear); setStudents([]); setSelected(null); setDraft(null); setCounselings([]); setCounselingStudentId(''); setCounselingDraft(null); setCounselingsLoad({ status: 'idle', error: '' });
    setStudentsLoad({ status: nextYear ? 'loading' : 'loaded', error: '' });
  };
  const refreshSheetList = async (announce = false) => {
    if (!auth || refreshingSheets) return;
    setRefreshingSheets(true); setSheetsLoad({ status: 'loading', error: '' });
    try {
      const result = await api('sheets', { token: auth.token });
      const latestSheets = result.sheets || [];
      setSheets(latestSheets);
      setSheetsLoad({ status: 'loaded', error: '' });
      if (year && !latestSheets.includes(year)) {
        const fallbackYear = latestSheets[0] || '';
        setYear(fallbackYear);
        if (!fallbackYear) setStudents([]);
      }
      if (announce) setMessage('연도 시트 목록을 최신 상태로 갱신했습니다.');
    } catch (error) { setSheetsLoad({ status: 'error', error: error.message }); setMessage(error.message); }
    finally { setRefreshingSheets(false); }
  };
  // 인증 정보를 탭 단위 저장소에 동기화해 새로고침 후에도 로그인 상태를 복원합니다.
  useEffect(() => {
    try {
      if (auth) sessionStorage.setItem(SESSION_KEY, JSON.stringify({ auth, sheets, year }));
      else sessionStorage.removeItem(SESSION_KEY);
    } catch (_) { setMessage('브라우저 세션 저장을 사용할 수 없습니다. 새로고침하면 로그아웃될 수 있습니다.'); }
  }, [auth, sheets, year]);
  useEffect(() => {
    if (!auth?.token || sessionReady) return;
    api('session', { token: auth.token }).then(result => setAuth(current => current ? { ...current, user: result.user } : current)).catch(() => setAuth(null)).finally(() => setSessionReady(true));
  }, [auth?.token, sessionReady]);
  // 인증 또는 선택 연도가 달라지면 그 연도 학생 목록을 다시 요청합니다.
  useEffect(() => { if (auth && year) run(() => loadStudents(auth.token, year), `${year} 시트를 불러왔습니다.`); else if (auth) loadStudents(auth.token, ''); }, [auth?.token, year]);
  useEffect(() => {
    if (page !== 'students' || !selected?.studentId) return;
    setCounselingStudentId(selected.studentId); setCounselings([]); setCounselingPage(1); setCounselingDetail(null); setCounselingDraft(null); setCounselingsLoad({ status: 'loading', error: '' });
    run(() => loadCounselings(selected.studentId, year));
  }, [page, selected?.studentId, year]);

  const loadPageData = async target => {
    const currentState = target === 'analytics' ? analyticsLoad : usersLoad;
    if (!auth || currentState.status === 'loading') return;
    const sequence = ++pageFetchSequences.current[target];
    const setState = target === 'analytics' ? setAnalyticsLoad : setUsersLoad;
    setState({ status: 'loading', error: '' });
    try {
      const result = target === 'analytics'
        ? await api('statistics', { token: auth.token })
        : await api('users', { token: auth.token });
      if (sequence !== pageFetchSequences.current[target]) return;
      if (target === 'analytics') setAnalytics(result.statistics || []); else setUsers(result.users || []);
      setState({ status: 'loaded', error: '' });
    } catch (error) {
      if (sequence === pageFetchSequences.current[target]) setState({ status: 'error', error: error.message });
      setMessage(error.message);
      if (error.message.includes('로그인이 만료') || error.message.includes('계정이 비활성화')) setAuth(null);
    }
  };
  const loadCounselings = async (studentId = counselingStudentId, targetYear = year) => {
    if (!studentId || !targetYear) { setCounselings([]); setCounselingsLoad({ status: 'loaded', error: '' }); return; }
    const sequence = ++counselingFetchSequence.current;
    setCounselingsLoad({ status: 'loading', error: '' });
    try {
      const result = await api('counselings', { token: auth.token, year: targetYear, studentId });
      if (sequence === counselingFetchSequence.current) { setCounselings(result.counselings || []); setCounselingsLoad({ status: 'loaded', error: '' }); }
    } catch (error) {
      if (sequence !== counselingFetchSequence.current) return;
      setCounselingsLoad({ status: 'error', error: error.message });
      throw error;
    }
  };
  const selectCounselingStudent = async studentId => {
    setCounselingStudentId(studentId); setCounselingDraft(null); setCounselings([]);
    setCounselingPage(1); setCounselingDetail(null);
    if (studentId) await run(() => loadCounselings(studentId));
  };
  const navigate = target => { if (target === 'currentStudents' && auth?.user?.role !== 'admin') { setMessage('재학생관리는 관리자만 이용할 수 있습니다.'); return; } setPage(target); window.history.replaceState(null, '', target === 'currentStudents' ? '#/current-students' : '#/'); setMenuOpen(false); setMessage(''); if (['analytics', 'settings'].includes(target)) loadPageData(target); };
  // 필터 결과는 원본 students를 변경하지 않고 상태·검색어에서 파생합니다.
  const filtered = useMemo(() => filterStudentRows(students, { status, query }), [students, status, query]);
  const openStudentsForStatus = nextStatus => { counselingFetchSequence.current += 1; setStatus(nextStatus); setQuery(''); setSelected(null); setDraft(null); setCounselingStudentId(''); setCounselings([]); setCounselingsLoad({ status: 'idle', error: '' }); setCounselingDraft(null); setCounselingDetail(null); setPage('students'); window.history.replaceState(null, '', '#/'); setMenuOpen(false); setMessage(''); };

  // selected가 있으면 수정, 없으면 신규 등록으로 처리합니다.
  const saveStudent = () => run(async () => {
    const result = await api('saveStudent', { token: auth.token, year, create: !selected, student: { ...draft, graduationYear: year } });
    await loadStudents(auth.token, year); setSelected(result.student); setDraft(result.student); setMessage('학생 정보가 저장되었습니다.');
  });
  // 상담 요청은 연도와 학생 ID를 함께 보내 서버에서 학생별로 분리합니다.
  const saveCounseling = () => run(async () => {
    const date = String(counselingDraft?.counseledAt || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('상담 날짜를 입력하세요.');
    const previousDateTime = String(counselingDraft?.originalCounseledAt || '');
    const preservedTime = counselingDraft?.counselingId && previousDateTime.slice(0, 10) === date && /^\d{2}:\d{2}$/.test(previousDateTime.slice(11, 16)) ? previousDateTime.slice(11, 16) : '00:00';
    await api('saveCounseling', { token: auth.token, year, studentId: counselingStudentId, counseling: { ...counselingDraft, originalCounseledAt: undefined, counseledAt: `${date}T${preservedTime}` } });
    setCounselingDraft(null); setCounselingPage(1); await loadCounselings(counselingStudentId); setMessage('상담 기록을 저장했습니다.');
  });
  const deleteCounseling = record => {
    if (!window.confirm('이 상담 기록을 삭제할까요?')) return;
    run(async () => { await api('deleteCounseling', { token: auth.token, year, studentId: counselingStudentId, counselingId: record.counselingId }); await loadCounselings(counselingStudentId); setMessage('상담 기록을 삭제했습니다.'); });
  };
  const startCounselingFor = student => { counselingFetchSequence.current += 1; setSelected(student); setDraft({ ...student }); setCounselingSearch(''); setCounselingPage(1); setCounselingDetail(null); setCounselingDraft(null); setCounselingStudentId(student.studentId); setCounselings([]); setCounselingsLoad({ status: 'loading', error: '' }); navigate('students'); };
  const toggleStudentSelection = student => {
    if (selected?.studentId === student.studentId) {
      counselingFetchSequence.current += 1; setSelected(null); setDraft(null); setCounselingStudentId(''); setCounselings([]); setCounselingsLoad({ status: 'idle', error: '' }); setCounselingPage(1); setCounselingDetail(null); setCounselingDraft(null);
      return;
    }
    counselingFetchSequence.current += 1; setSelected(student); setDraft({ ...student }); setCounselingStudentId(student.studentId); setCounselings([]); setCounselingsLoad({ status: 'loading', error: '' }); setCounselingPage(1); setCounselingDetail(null); setCounselingDraft(null);
  };
  const removeStudent = student => {
    if (!window.confirm(`${student.name} (${student.studentId}) 학생을 삭제할까요? 이 작업은 되돌릴 수 없습니다.`)) return;
    run(async () => { await api('deleteStudent', { token: auth.token, year, studentId: student.studentId }); await loadStudents(auth.token, year); setMessage('학생이 삭제되었습니다.'); });
  };
  const startNewStudent = () => { counselingFetchSequence.current += 1; setSelected(null); setDraft({ ...EMPTY_STUDENT, graduationYear: year }); setCounselingStudentId(''); setCounselings([]); setCounselingPage(1); setCounselingDetail(null); setCounselingDraft(null); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  // 수식처럼 해석될 수 있는 사용자 입력값을 이스케이프해 CSV로 내보냅니다.
  const exportCsv = () => {
    const columns = [['studentId', '학번'], ['name', '이름'], ['gender', '성별'], ['phone', '전화번호'], ['address', '주소'], ['status', '상태'], ['company', '취업/진학처'], ['field', '관심분야'], ['detail', '상세정보'], ['gpa', '평점'], ['updatedAt', '수정일']];
    const quote = value => { const text = String(value ?? ''); const safe = /^[\s]*[=+@-]/.test(text) ? `'${text}` : text; return `"${safe.replaceAll('"', '""')}"`; };
    const content = '\uFEFF' + [columns.map(([, label]) => quote(label)).join(','), ...filtered.map(row => columns.map(([key]) => quote(row[key])).join(','))].join('\r\n');
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' })); link.download = `졸업생_${year || '목록'}.csv`; link.click(); URL.revokeObjectURL(link.href);
  };
  const saveUser = () => run(async () => {
    const result = await api('saveUser', { token: auth.token, user: userDraft });
    setUsers(result.users); setUserDraft(null); setMessage('사용자 계정이 저장되었습니다.');
  });
  const logout = async () => { try { await api('logout', { token: auth.token }); } catch (_) {} setAuth(null); setStudents([]); setMessage('로그아웃되었습니다.'); };

  // 인증 전에는 로그인 화면만 렌더링하고, 인증 후에는 page 값으로 업무 화면을 분기합니다.
  if (!sessionReady) return <div className="login-page"><div className="login-card">Checking login...</div></div>;
  if (!auth) return <LoginScreen onGoogle={googleLogin} loading={loading} message={message}/>;
  const currentNav = NAV.find(item => item.id === page)?.label || '대시보드';
  const isAdmin = auth.user.role === 'admin';
  return <div className="app-shell design-shell"><aside className={`sidebar ${menuOpen ? 'open' : ''}`}><div className="sidebar-brand"><div className="sidebar-logo"><GraduationCap size={21}/></div><div><b>졸업생관리</b><small>COMPUTER SOFTWARE</small></div><button className="sidebar-close" onClick={() => setMenuOpen(false)} aria-label="메뉴 닫기"><X size={18}/></button></div><nav><p className="nav-label">MAIN MENU</p>{NAV.filter(item => !item.admin || isAdmin).map(({ id, label, icon: Icon }) => <button key={id} className={`nav-item ${page === id ? 'active' : ''}`} onClick={() => navigate(id)}><Icon size={17}/>{label}</button>)}</nav><div className="sidebar-bottom"><div className="side-status"><i/> Sheets API 연결</div><small>{isAdmin ? '관리자' : '일반 사용자'} · v2.1.0</small></div></aside>{menuOpen && <button className="sidebar-backdrop" onClick={() => setMenuOpen(false)} aria-label="메뉴 닫기"/>}
    <div className="workspace"><header className="topbar"><button className="menu-toggle" onClick={() => setMenuOpen(true)} aria-label="메뉴 열기"><Menu size={20}/></button><div className="breadcrumb"><span>관리 시스템</span><b>/</b><strong>{currentNav}</strong></div><div className="account"><span>{auth.user.name} ({isAdmin ? '관리자' : '일반사용자'})</span><button onClick={logout}>로그아웃 <LogOut size={16}/></button></div></header><main>
      {page === 'currentStudents' && (isAdmin ? <CurrentStudentsPage auth={auth} api={api} run={run} loading={loading} setMessage={setMessage} onStudentTransferred={async targetYear => { await refreshSheetList(false); changeYear(targetYear); navigate('students'); }}/> : <section className="panel access-denied" role="alert"><div className="panel-title"><h2>접근 권한이 없습니다.</h2></div><p>재학생관리는 관리자만 이용할 수 있습니다.</p><button className="primary-button" onClick={() => navigate('dashboard')}>대시보드로 이동</button></section>)}
      {['dashboard', 'students'].includes(page) && <><section className="filters year-sheet-toolbar"><label><span>연도별 시트</span><select value={year} onFocus={() => refreshSheetList(false)} onChange={e => changeYear(e.target.value)}><option value="">시트를 선택하세요</option>{sheets.map(s => <option key={s} value={s}>{s}</option>)}</select></label><div className="year-sheet-actions"><button className="outline-button year-refresh" onClick={() => refreshSheetList(true)} disabled={refreshingSheets} title="연도 시트 목록 새로고침"><RefreshCw size={15} className={refreshingSheets ? 'spin' : ''}/> 연도 목록 새로고침</button>{sheetsLoad.status === 'error' && <button className="outline-button year-sheet-retry" onClick={() => refreshSheetList(true)}>다시 시도</button>}<button className="sync" onClick={() => retryStudents()} disabled={studentsLoad.status === 'loading' || !year}><RefreshCw size={15}/> Sheets 동기화</button></div></section>
        {page === 'dashboard' && <EmploymentOverview students={students} year={year} loadState={studentsLoad} onRetry={retryStudents}/>}<StudentStats students={students} year={year} loadState={studentsLoad} onRetry={retryStudents} onSelectStatus={openStudentsForStatus}/>
        {page === 'dashboard' && <><section className="panel"><div className="panel-title"><h2>현황 요약</h2><span>{year || '연도'} 기준 상태별 인원</span></div><StatusBars students={students} loadState={studentsLoad} onRetry={retryStudents}/></section><section className="panel"><div className="panel-title"><h2>최근 졸업생</h2><button className="text-button" onClick={() => navigate('students')}>명단 보기 →</button></div><StudentTable rows={students} rowLimit={8} selected={selected} onSelect={s => { counselingFetchSequence.current += 1; setCounselings([]); setCounselingStudentId(s.studentId); setCounselingsLoad({ status: 'loading', error: '' }); setCounselingPage(1); setCounselingDetail(null); setCounselingDraft(null); setSelected(s); setDraft({ ...s }); navigate('students'); }} onCounsel={startCounselingFor} onDelete={removeStudent} isAdmin={isAdmin} loadState={studentsLoad} onRetry={retryStudents} emptyMessage="등록된 졸업생이 없습니다."/></section></>}
        {page === 'students' && <><section className="panel detail-panel"><div className="panel-title"><h2>{draft ? (draft.studentId ? '졸업생 정보 수정' : '졸업생 등록') : '졸업생 정보'}</h2></div>{studentsLoad.status !== 'loaded' ? <div className="student-detail-data-state"><DataState state={studentsLoad} onRetry={() => run(() => loadStudents(auth.token, year))}/></div> : draft ? <div className="form-grid"><Field label="학번 *" value={draft.studentId} disabled={!!selected} onChange={v => setDraft({ ...draft, studentId: v })}/><Field label="이름 *" value={draft.name} onChange={v => setDraft({ ...draft, name: v })}/><Field label="성별" value={draft.gender} onChange={v => setDraft({ ...draft, gender: v })}/><Field label="전화번호" value={draft.phone} onChange={v => setDraft({ ...draft, phone: v })}/><Field label="상태" value={draft.status} options={STATUSES} onChange={v => setDraft({ ...draft, status: v })}/><Field label="취업/진학처" value={draft.company} onChange={v => setDraft({ ...draft, company: v })}/><Field label="관심분야" value={draft.field} onChange={v => setDraft({ ...draft, field: v })}/><Field label="평점평균" value={draft.gpa} onChange={v => setDraft({ ...draft, gpa: v })}/><Field label="주소" value={draft.address} onChange={v => setDraft({ ...draft, address: v })} wide/><Field label="상세정보" value={formatTransferDetailForDisplay(draft.detail)} onChange={v => setDraft({ ...draft, detail: v })} textarea wide/><div className="form-actions"><button className="sync" onClick={() => { setDraft(null); setSelected(null); }}>취소</button><button className="save" onClick={saveStudent} disabled={loading || !draft.name?.trim() || !draft.studentId?.trim()}><Save size={17}/> 저장</button></div></div> : <div className="empty-detail">명단에서 학생을 선택하거나 새 학생을 등록하세요.</div>}</section>
          <section className="panel table-panel"><StudentListHeader title="졸업생 명단" count={filtered.length} query={query} onQueryChange={setQuery} placeholder="이름, 학번, 관심분야, 거주지 검색"><button className="outline-button student-list-button" onClick={exportCsv} disabled={!filtered.length}><Download size={15}/> CSV</button><button className="primary-button student-list-button" onClick={startNewStudent} disabled={!year}><Plus size={16}/> 학생 등록</button></StudentListHeader><StatusFilter value={status} onChange={setStatus}/>{studentsLoad.status === 'loaded' ? <StudentTable rows={filtered} selected={selected} onSelect={toggleStudentSelection} clickableRows onDelete={removeStudent} isAdmin={isAdmin} emptyMessage={students.length ? '검색 조건에 맞는 졸업생이 없습니다.' : '등록된 졸업생이 없습니다.'}/> : <div className="student-list-data-state"><DataState state={studentsLoad} onRetry={() => run(() => loadStudents(auth.token, year))}/></div>}</section></>}
      </>}
      {page === 'students' && <StudentsCounseling student={selected} records={counselings} loading={loading} loadState={counselingsLoad} onRetry={() => run(() => loadCounselings(selected?.studentId, year))} page={counselingPage} setPage={setCounselingPage} detail={counselingDetail} setDetail={setCounselingDetail} draft={counselingDraft} setDraft={setCounselingDraft} onSave={saveCounseling} onDelete={deleteCounseling}/>}
      {page === 'analytics' && <section className="panel"><div className="panel-title"><h2>졸업 연도별 통계</h2><button className="sync" onClick={() => loadPageData('analytics')} disabled={analyticsLoad.status === 'loading'}><RefreshCw size={15}/> 새로고침</button></div>{analyticsLoad.status !== 'loaded' ? <DataState state={analyticsLoad} onRetry={() => loadPageData('analytics')}/> : analytics.length ? <div className="analytics-list">{analytics.map(item => <div className="analytics-year" key={item.year}><h3>{item.year} <small>{item.total}명</small></h3><StatusBars counts={item.counts} total={item.total}/></div>)}</div> : <div className="empty-detail">등록된 데이터가 없습니다.</div>}</section>}
      {page === 'schedule' && <SchedulePage auth={auth}/>}
      {page === 'archive' && <ArchivePage auth={auth} api={api} isAdmin={isAdmin} setMessage={setMessage}/>}
      {page === 'settings' && isAdmin && <section className="panel table-panel"><div className="panel-title"><h2>사용자 계정 관리</h2><button className="primary-button" onClick={() => setUserDraft({ userId: '', name: '', email: '', role: 'user', active: true })}><Plus size={16}/> 사용자 추가</button></div>{userDraft && <div className="form-grid user-form"><Field label="아이디 *" value={userDraft.userId} disabled={users.some(u => u.userId === userDraft.userId)} onChange={v => setUserDraft({ ...userDraft, userId: v })}/><Field label="이름 *" value={userDraft.name} onChange={v => setUserDraft({ ...userDraft, name: v })}/><Field label="Google 이메일" value={userDraft.email} onChange={v => setUserDraft({ ...userDraft, email: v })}/><Field label="역할" value={userDraft.role} options={[{ value: 'user', label: '일반 사용자' }, { value: 'admin', label: '관리자' }]} onChange={v => setUserDraft({ ...userDraft, role: v })}/><label className="field"><span>사용 상태</span><select value={String(userDraft.active)} onChange={e => setUserDraft({ ...userDraft, active: e.target.value === 'true' })}><option value="true">활성</option><option value="false">비활성</option></select></label><div className="form-actions"><button className="sync" onClick={() => setUserDraft(null)}>취소</button><button className="save" onClick={saveUser} disabled={loading || !userDraft.userId?.trim() || !userDraft.name?.trim()}><Save size={17}/> 계정 저장</button></div></div>}{usersLoad.status !== 'loaded' ? <DataState state={usersLoad} onRetry={() => loadPageData('settings')}/> : <div className="table-wrap"><table><thead><tr><th>아이디</th><th>이름</th><th>이메일</th><th>역할</th><th>상태</th><th>관리</th></tr></thead><tbody>{users.map(user => <tr key={user.userId}><td>{user.userId}</td><td>{user.name}</td><td>{user.email || '-'}</td><td>{user.role === 'admin' ? '관리자' : '일반 사용자'}</td><td>{user.active ? '활성' : '비활성'}</td><td><button className="view" onClick={() => setUserDraft({ ...user })}>수정</button></td></tr>)}</tbody></table>{!users.length && <DataState state={usersLoad} empty emptyMessage="등록된 데이터가 없습니다."/>}</div>}</section>}
      <p className="notice" role="status">{message}</p></main><footer>컴퓨터소프트웨어공학과 학사 행정 시스템 <span>GitHub Pages + Google Apps Script</span></footer></div></div>;
}

function StudentsCounseling({ student, records, loading, loadState, onRetry, page, setPage, detail, setDetail, draft, setDraft, onSave, onDelete }) {
  const pageSize = 5;
  const pageCount = Math.max(1, Math.ceil(records.length / pageSize));
  const visible = records.slice((page - 1) * pageSize, page * pageSize);
  const openNew = () => setDraft({ counselingId: '', counseledAt: new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10), content: '' });
  const closeOnBackdrop = event => { if (event.target === event.currentTarget) { setDetail(null); setDraft(null); } };
  return <>
    <section className="panel student-counseling-panel">
      <div className="panel-title"><h2>상담 이력 <small>{records.length}건</small></h2><button className="primary-button" disabled={!student || loading} onClick={openNew}><Plus size={15}/> 상담 등록</button></div>
      {!student ? <div className="empty-detail">졸업생을 선택하면 상담 이력이 표시됩니다.</div> : loadState.status !== 'loaded' ? <div className="counseling-data-state"><DataState state={loadState} onRetry={onRetry}/></div> : records.length === 0 ? <div className="empty-detail">등록된 상담이력이 없습니다.</div> : <>
        <div className="student-counseling-list">{visible.map(record => <button className="student-counseling-row" key={record.counselingId} onClick={() => setDetail(record)}><time>{formatKoreanDate(record.counseledAt)}</time><span>{record.content}</span><small>{record.authorName || ''}</small></button>)}</div>
        {pageCount > 1 && <nav className="counseling-pagination" aria-label="상담 이력 페이지"><button disabled={page <= 1} onClick={() => setPage(page - 1)}>이전</button>{Array.from({ length: pageCount }, (_, index) => index + 1).map(number => <button key={number} className={number === page ? 'active' : ''} aria-current={number === page ? 'page' : undefined} onClick={() => setPage(number)}>{number}</button>)}<button disabled={page >= pageCount} onClick={() => setPage(page + 1)}>다음</button></nav>}
      </>}
    </section>
    {detail && <div className="counseling-modal-backdrop" onMouseDown={closeOnBackdrop}><section className="counseling-modal" role="dialog" aria-modal="true" aria-labelledby="counseling-detail-title"><header><h2 id="counseling-detail-title">상담 내용</h2><button className="icon-button" aria-label="닫기" onClick={() => setDetail(null)}><X size={18}/></button></header><div className="counseling-modal-body"><dl><dt>상담일자</dt><dd>{formatKoreanDate(detail.counseledAt)}</dd>{detail.authorName && <><dt>작성자</dt><dd>{detail.authorName}</dd></>}</dl><div className="counseling-full-content">{detail.content}</div>{detail.createdAt && <small>작성 {formatKoreanDateTime(detail.createdAt)}{detail.updatedAt && detail.updatedAt !== detail.createdAt ? ` · 수정 ${formatKoreanDateTime(detail.updatedAt)}` : ''}</small>}</div><footer><button className="danger-text-button" onClick={() => { onDelete(detail); setDetail(null); }}>삭제</button><button className="sync" onClick={() => { setDraft({ ...detail, originalCounseledAt: detail.counseledAt, counseledAt: String(detail.counseledAt || '').slice(0, 10) }); setDetail(null); }}>수정</button><button className="primary-button" onClick={() => setDetail(null)}>닫기</button></footer></section></div>}
    {draft && <div className="counseling-modal-backdrop" onMouseDown={closeOnBackdrop}><section className="counseling-modal" role="dialog" aria-modal="true" aria-labelledby="counseling-edit-title"><header><h2 id="counseling-edit-title">{draft.counselingId ? '상담 기록 수정' : '상담 기록 등록'}</h2><button className="icon-button" aria-label="닫기" onClick={() => setDraft(null)}><X size={18}/></button></header><div className="counseling-modal-body"><label className="field"><span>상담 날짜 *</span><input type="date" value={String(draft.counseledAt || '').slice(0, 10)} onChange={event => setDraft({ ...draft, counseledAt: event.target.value })}/></label><label className="field"><span>상담 내용 *</span><textarea rows="7" value={draft.content || ''} onChange={event => setDraft({ ...draft, content: event.target.value })} placeholder="상담 내용을 입력하세요."/></label></div><footer><button className="sync" onClick={() => setDraft(null)}>취소</button><button className="primary-button" disabled={loading || !draft.counseledAt || !draft.content?.trim()} onClick={() => onSave()}><Save size={15}/> 저장</button></footer></section></div>}
  </>;
}


function DataState({ state, onRetry, empty = false, emptyMessage = '등록된 데이터가 없습니다.' }) {
  if (state?.status === 'loading' || state?.status === 'idle') return <div className="data-state" role="status" aria-live="polite"><span className="data-spinner" aria-hidden="true"/><span>데이터를 불러오는 중입니다...</span></div>;
  if (state?.status === 'error') return <div className="data-state data-state-error" role="alert"><span>데이터를 불러오지 못했습니다. 다시 시도해 주세요.</span>{state.error && <small title={state.error}>{state.error}</small>}<button className="outline-button" onClick={onRetry}>다시 시도</button></div>;
  if (empty) return <div className="data-state data-state-empty" role="status">{emptyMessage}</div>;
  return null;
}
function StudentStats({ students, year, loadState, onRetry, onSelectStatus }) {
  if (loadState.status !== 'loaded') return <section className="stats stats-loading"><DataState state={loadState} onRetry={onRetry}/></section>;
  return <section className="stats"><button type="button" className="total-card status-count-card" onClick={() => onSelectStatus('전체학생')}><span>전체 학생</span><strong>{students.length}<small>명</small></strong><p>{year || '-'} 기준</p></button>{STATUSES.map(label => { const color = getStudentStatusColor(label); return <button type="button" className="stat-card status-count-card" style={{ '--status-accent': color.accent, '--status-bg': color.background, '--status-fg': color.foreground }} key={label} onClick={() => onSelectStatus(label)}><span>{label}</span><strong>{students.filter(s => s.status === label).length}<small>명</small></strong></button>; })}</section>;
}
function Field({ label, value, onChange, options, textarea, wide, disabled, type = 'text' }) { return <label className={`field ${wide ? 'wide' : ''}`}><span>{label}</span>{textarea ? <textarea value={value || ''} onChange={e => onChange(e.target.value)}/> : options ? <select value={value ?? ''} onChange={e => onChange(e.target.value)}>{options.map(o => typeof o === 'string' ? <option key={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>)}</select> : <input type={type} disabled={disabled} value={value ?? ''} onChange={e => onChange(e.target.value)}/>}</label>; }
function StatusFilter({ value, onChange }) { return <div className="status-filter">{['전체학생', ...STATUSES].map(label => <button key={label} className={value === label ? 'active' : ''} onClick={() => onChange(label)}>{label}</button>)}</div>; }
function StudentTable({ rows, rowLimit, selected, onSelect, onCounsel, onDelete, isAdmin, clickableRows = false, loadState = { status: 'loaded' }, onRetry, emptyMessage = '표시할 데이터가 없습니다.' }) {
  const [sort, setSort] = useState(null);
  const columns = [{ key: 'studentId', label: '학번' }, { key: 'name', label: '이름' }, { key: 'gender', label: '성별' }, { key: 'gpa', label: '평점', numeric: true }, { key: 'status', label: '상태' }, { key: 'company', label: '취업/진학처' }, { key: 'field', label: '관심분야' }];
  const sortedRows = useMemo(() => sortStudentRows(rows, sort && { ...sort, numeric: sort.key === 'gpa' }), [rows, sort]);
  const displayedRows = rowLimit ? sortedRows.slice(0, rowLimit) : sortedRows;
  const toggleSort = key => setSort(current => current?.key !== key ? { key, direction: 'asc' } : current.direction === 'asc' ? { key, direction: 'desc' } : null);
  const sortHeader = ({ key, label }) => { const active = sort?.key === key; const Icon = active ? (sort.direction === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown; return <th key={key} aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}><button type="button" className="sortable-header" onClick={() => toggleSort(key)}>{label}<Icon size={13}/></button></th>; };
  if (loadState.status !== 'loaded') return <div className={`table-data-state ${clickableRows ? 'student-table-state' : ''}`}><DataState state={loadState} onRetry={onRetry}/></div>;
  return <div className="table-wrap"><table><thead><tr><th>번호</th>{columns.map(sortHeader)}<th>관리</th></tr></thead><tbody>{displayedRows.map((s, i) => { const color = getStudentStatusColor(s.status); return <tr key={`${s.graduationYear}-${s.studentId}`} className={`${selected?.studentId === s.studentId ? 'selected ' : ''}${clickableRows ? 'clickable-row' : ''}`} onClick={clickableRows ? () => onSelect(s) : undefined} onKeyDown={clickableRows ? event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(s); } } : undefined} tabIndex={clickableRows ? 0 : undefined}><td>{i + 1}</td><td>{s.studentId}</td><td><b>{s.name}</b></td><td>{s.gender || '-'}</td><td>{s.gpa || '-'}</td><td><span className="tag" style={{ '--status-bg': color.background, '--status-fg': color.foreground, '--status-accent': color.accent }}>{s.status || '미지정'}</span></td><td>{s.company || '-'}</td><td>{s.field || '-'}</td><td><div className="row-actions">{!clickableRows && <button className="view" onClick={event => { event.stopPropagation(); onSelect(s); }}>{selected?.studentId === s.studentId ? <Check size={14}/> : null}조회</button>}{!clickableRows && onCounsel && <button className="view" onClick={event => { event.stopPropagation(); onCounsel(s); }} title="상담 이력">상담</button>}<button className="icon-button danger" aria-label={`${s.name} 삭제`} title="삭제" onClick={event => { event.stopPropagation(); onDelete(s); }}><Trash2 size={15}/></button></div></td></tr>; })}</tbody></table>{!displayedRows.length && <div className="empty-detail">{emptyMessage}</div>}</div>;
}
function EmploymentOverview({ students, year, loadState, onRetry }) {
  if (loadState.status !== 'loaded') return <section className="panel employment-overview"><div className="panel-title"><h2>취업 현황</h2><span>{year || '연도'} 기준 · 학생 명단 상태값</span></div><DataState state={loadState} onRetry={onRetry}/></section>;
  if (!students.length) return <section className="panel employment-overview"><div className="panel-title"><h2>취업 현황</h2><span>{year || '연도'} 기준 · 학생 명단 상태값</span></div><DataState state={loadState} empty emptyMessage="등록된 데이터가 없습니다."/></section>;
  const { counts, total, excluded, eligible, employed, rate: rawRate } = getEmploymentSummary(students);
  const rate = rawRate === null ? null : rawRate.toFixed(1);
  let offset = 0;
  const segments = counts.map(item => { const start = offset; const part = total ? item.count / total : 0; offset += part; return { ...item, start, part }; });
  const gradient = total ? `conic-gradient(${segments.map(item => `${getStudentStatusColor(item.label).accent} ${item.start * 100}% ${(item.start + item.part) * 100}%`).join(',')})` : '#e9edf3';
  return <section className="panel employment-overview"><div className="panel-title"><h2>취업 현황</h2><span>{year || '연도'} 기준 · 학생 명단 상태값</span></div><div className="employment-content"><div className="employment-chart-area"><div className="employment-donut" style={{ background: gradient }} aria-label={`전체 ${total}명 상태별 원형 그래프`}><div className="donut-hole"><b>{total}</b><span>전체 학생</span></div></div><div className="employment-legend">{counts.map(item => <div className="employment-legend-item" key={item.label}><i style={{ background: getStudentStatusColor(item.label).accent }}/><span>{item.label}</span><b>{item.count}명</b><small>{total ? (item.count / total * 100).toFixed(1) : '0.0'}%</small></div>)}</div></div><div className="employment-rate"><span>취업률</span><strong>{rate === null ? '산정 불가' : <>{rate}<small>%</small></>}</strong><p>취업자 <b>{employed}명</b> / 산정 대상 <b>{eligible}명</b></p><small>전체 {total}명 중 진학·군입대 {excluded}명 제외</small></div></div></section>;
}
function StatusBars({ students, counts, total, loadState, onRetry }) {
  if (loadState && loadState.status !== 'loaded') return <DataState state={loadState} onRetry={onRetry}/>;
  if (loadState && !counts && !students.length) return <DataState state={loadState} empty emptyMessage="등록된 데이터가 없습니다."/>;
  const summary = counts || STATUSES.reduce((acc, label) => ({ ...acc, [label]: students.filter(s => s.status === label).length }), {});
  const max = Math.max(total ?? students.length, 1);
  return <div className="status-bars">{STATUSES.map(label => { const color = getStudentStatusColor(label); return <div className="status-bar-row" key={label} style={{ '--status-accent': color.accent, '--status-fg': color.foreground }}><span className="status-badge">{label}</span><div className="bar"><i style={{ width: `${Math.min(100, (summary[label] || 0) / max * 100)}%` }}/></div><b>{summary[label] || 0}명</b></div>; })}</div>;
}
createRoot(document.getElementById('root')).render(<App/>);
