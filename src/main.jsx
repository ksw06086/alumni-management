import React, { useEffect, useMemo, useState } from 'react';
import { Check, GraduationCap, LogIn, LogOut, RefreshCw, Save, Search, Users } from 'lucide-react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const API_URL = import.meta.env.VITE_API_BASE_URL || '';
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const STATUSES = ['전체학생', '취업자', '진학자', '미취업자', '국비교육자', '군입대자', '기타'];

async function api(action, payload = {}) {
  if (!API_URL) throw new Error('VITE_API_BASE_URL이 설정되지 않았습니다.');
  const response = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...payload }) });
  const result = await response.json();
  if (!result.ok) throw new Error(result.error || '요청 처리에 실패했습니다.');
  return result;
}

function App() {
  const [auth, setAuth] = useState(null), [mode, setMode] = useState('google');
  const [credentials, setCredentials] = useState({ userId: '', password: '' });
  const [operators, setOperators] = useState([]), [operatorId, setOperatorId] = useState('');
  const [sheets, setSheets] = useState([]), [year, setYear] = useState('');
  const [students, setStudents] = useState([]), [status, setStatus] = useState('전체학생'), [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null), [draft, setDraft] = useState(null), [message, setMessage] = useState(''), [loading, setLoading] = useState(false);

  const completeLogin = async result => {
    setAuth({ token: result.token, user: result.user }); setSheets(result.sheets || []); setYear(result.sheets?.[0] || ''); setOperatorId(result.user.userId);
    try { const users = await api('users', { token: result.token }); setOperators(users.users.filter(u => u.active)); } catch (_) { setOperators([result.user]); }
  };
  const login = async () => { setLoading(true); try { await completeLogin(await api('login', credentials)); setMessage('로그인되었습니다.'); } catch (e) { setMessage(e.message); } finally { setLoading(false); } };
  const googleLogin = () => {
    if (!CLIENT_ID) return setMessage('Google Client ID가 설정되지 않았습니다.');
    if (!window.google?.accounts?.oauth2) return setMessage('Google 인증 모듈을 불러오는 중입니다.');
    const client = window.google.accounts.oauth2.initTokenClient({ client_id: CLIENT_ID, scope: 'openid email profile', callback: async response => {
      if (response.error) return setMessage('Google 로그인이 실패했습니다.'); setLoading(true);
      try { await completeLogin(await api('googleLogin', { accessToken: response.access_token })); setMessage('로그인되었습니다.'); } catch (e) { setMessage(e.message); } finally { setLoading(false); }
    } }); client.requestAccessToken({ prompt: 'select_account' });
  };
  const loadStudents = async target => { if (!auth || !(target || year)) return; setLoading(true); try { const result = await api('students', { token: auth.token, year: target || year }); setStudents(result.students); setSelected(null); setDraft(null); setMessage(`${target || year} 시트를 불러왔습니다.`); } catch (e) { setMessage(e.message); } finally { setLoading(false); } };
  useEffect(() => { if (auth && year) loadStudents(year); }, [auth, year]);
  const filtered = useMemo(() => students.filter(s => (status === '전체학생' || s.status === status) && [s.name, s.studentId, s.company, s.field].join(' ').toLowerCase().includes(query.toLowerCase())), [students, status, query]);
  const saveStudent = async () => { if (!draft) return; setLoading(true); try { const result = await api('saveStudent', { token: auth.token, year, student: draft, operatorId, detail: '학생 정보 수정' }); setStudents(rows => rows.map(row => row.studentId === draft.studentId ? result.student : row)); setSelected(result.student); setDraft(result.student); setMessage('학생 정보와 작업 로그를 저장했습니다.'); } catch (e) { setMessage(e.message); } finally { setLoading(false); } };

  if (!auth) return <LoginScreen mode={mode} setMode={setMode} credentials={credentials} setCredentials={setCredentials} onGoogle={googleLogin} onLogin={login} loading={loading} message={message}/>;
  const logout = async () => { try { await api('logout', { token: auth.token }); } catch (_) {} setAuth(null); };
  return <div className="app-shell design-shell"><aside className="sidebar"><div className="sidebar-brand"><div className="sidebar-logo"><GraduationCap size={21}/></div><div><b>졸업생관리</b><small>COMPUTER SOFTWARE</small></div></div><nav><p className="nav-label">MAIN MENU</p><button className="nav-item active">대시보드</button><button className="nav-item">졸업생 명단</button><button className="nav-item">통계 및 분석</button><button className="nav-item">시스템 설정</button></nav><div className="sidebar-bottom"><div className="side-status"><i/> Google Sheets 연결</div><small>v2.0.0 · 졸업생관리프로그램</small></div></aside><div className="workspace"><header className="topbar"><div className="breadcrumb"><span>관리 시스템</span><b>/</b><strong>대시보드</strong></div><div className="account"><span>{auth.user.name} ({auth.user.role === 'admin' ? '관리자' : '일반사용자'})</span><button onClick={logout}>로그아웃 <LogOut size={16}/></button></div></header><main>
    <section className="filters"><label>연도별 시트<select value={year} onChange={e => setYear(e.target.value)}><option value="">시트를 선택하세요</option>{sheets.map(s => <option key={s} value={s}>{s}</option>)}</select></label><label>작업자<select value={operatorId} onChange={e => setOperatorId(e.target.value)}>{operators.map(o => <option key={o.userId} value={o.userId}>{o.name}</option>)}</select></label><button className="sync" onClick={() => loadStudents()} disabled={loading}><RefreshCw size={15}/> {loading ? '불러오는 중' : 'Sheets 동기화'}</button></section>
    <section className="stats"><div className="total-card"><span>전체 학생</span><strong>{students.length}<small>명</small></strong><p>{year || '-'} 기준</p></div>{STATUSES.slice(1).map(label => <div className="stat-card" key={label}><span>{label}</span><strong>{students.filter(s => s.status === label).length}<small>명</small></strong></div>)}</section>
    <section className="panel detail-panel"><div className="panel-title"><h2>졸업생 정보</h2>{selected ? <span>선택된 대상: <b>{selected.name}</b> (학번: {selected.studentId})</span> : <span>목록에서 학생을 선택해주세요.</span>}</div>{draft ? <div className="form-grid"><Field label="이름" value={draft.name} onChange={v => setDraft({ ...draft, name: v })}/><Field label="전화번호" value={draft.phone} onChange={v => setDraft({ ...draft, phone: v })}/><Field label="주소" value={draft.address} onChange={v => setDraft({ ...draft, address: v })} wide/><Field label="상태" value={draft.status} options={STATUSES.slice(1)} onChange={v => setDraft({ ...draft, status: v })}/><Field label="취업/진학 업체" value={draft.company} onChange={v => setDraft({ ...draft, company: v })}/><Field label="관심분야" value={draft.field} onChange={v => setDraft({ ...draft, field: v })}/><Field label="기본정보" value={draft.detail} onChange={v => setDraft({ ...draft, detail: v })} textarea wide/><button className="save" onClick={saveStudent} disabled={loading}><Save size={18}/> 정보 업데이트</button></div> : <div className="empty-detail">학생 목록에서 조회 버튼을 선택해주세요.</div>}</section>
    <section className="panel table-panel"><div className="panel-title"><h2>학생 명단 <small>총 {filtered.length}명</small></h2><div className="table-actions"><label className="search"><Search size={16}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="이름, 학번, 업체 검색"/></label></div></div><div className="status-filter">{STATUSES.map(label => <button key={label} className={status === label ? 'active' : ''} onClick={() => setStatus(label)}>{label}</button>)}</div><div className="table-wrap"><table><thead><tr><th>번호</th><th>학번</th><th>이름</th><th>성별</th><th>평점평균</th><th>구분</th><th>취업/진학 업체</th><th>관심분야</th><th>관리</th></tr></thead><tbody>{filtered.map((s, i) => <tr key={s.studentId} className={selected?.studentId === s.studentId ? 'selected' : ''}><td>{i + 1}</td><td>{s.studentId}</td><td><b>{s.name}</b></td><td>{s.gender}</td><td>{s.gpa || '-'}</td><td><span className="tag">{s.status}</span></td><td>{s.company || '-'}</td><td>{s.field || '-'}</td><td><button className="view" onClick={() => { setSelected(s); setDraft({ ...s }); }}>{selected?.studentId === s.studentId ? <Check size={14}/> : null}{selected?.studentId === s.studentId ? '선택됨' : '조회'}</button></td></tr>)}</tbody></table></div></section><p className="notice">{message}</p></main><footer>컴퓨터소프트웨어공학과 학사 행정 시스템 <span>GitHub Pages + Google Apps Script</span></footer></div></div>;
}

function LoginScreen({ mode, setMode, credentials, setCredentials, onGoogle, onLogin, loading, message }) { return <div className="login-page"><div className="login-card"><div className="login-brand-mark"><Users size={30}/></div><p className="login-eyebrow">COMPUTER SOFTWARE ENGINEERING</p><h1>졸업생관리프로그램</h1><p className="login-description">졸업생 통계 및 이력 실시간 통합 관리 시스템</p><div className="login-divider"/><div className="login-tabs"><button className={mode === 'google' ? 'active' : ''} onClick={() => setMode('google')}>Google 로그인</button><button className={mode === 'local' ? 'active' : ''} onClick={() => setMode('local')}>개인 로그인</button></div>{mode === 'google' ? <button className="google-login" onClick={onGoogle} disabled={loading}><LogIn size={19}/> Google 계정으로 로그인</button> : <div className="local-login"><input placeholder="아이디" value={credentials.userId} onChange={e => setCredentials({ ...credentials, userId: e.target.value })}/><input type="password" placeholder="비밀번호" value={credentials.password} onChange={e => setCredentials({ ...credentials, password: e.target.value })}/><button className="google-login" onClick={onLogin} disabled={loading}><LogIn size={19}/> 아이디로 로그인</button></div>}{message && <p className="login-message">{message}</p>}<span className="login-security">관리자 등록 사용자 전용</span></div></div>; }
function Field({ label, value, onChange, options, textarea, wide }) { return <label className={`field ${wide ? 'wide' : ''}`}><span>{label}</span>{textarea ? <textarea value={value || ''} onChange={e => onChange(e.target.value)}/> : options ? <select value={value || ''} onChange={e => onChange(e.target.value)}>{options.map(o => <option key={o}>{o}</option>)}</select> : <input value={value || ''} onChange={e => onChange(e.target.value)}/>}</label>; }
createRoot(document.getElementById('root')).render(<App/>);
