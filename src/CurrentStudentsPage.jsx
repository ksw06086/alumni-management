import React, { useEffect, useMemo, useRef, useState } from 'react';
import { GraduationCap, Plus, RefreshCw, Save, X } from 'lucide-react';
import StudentListHeader from './StudentListHeader.jsx';

const EMPTY = { student_id: '', name: '', birth_date: '', gender: '', phone: '', email: '', affiliation: '', enrollment_status: '', notes: '', created_at: '', updated_at: '' };
const PAGE_SIZE = 5;

export default function CurrentStudentsPage({ auth, api, run, loading, setMessage, onStudentTransferred }) {
  const [students, setStudents] = useState([]), [selected, setSelected] = useState(null), [draft, setDraft] = useState(null);
  const [records, setRecords] = useState([]), [query, setQuery] = useState(''), [load, setLoad] = useState('loading');
  const [recordsLoad, setRecordsLoad] = useState('idle');
  const recordsSequence = useRef(0);
  const [counselDraft, setCounselDraft] = useState(null), [detail, setDetail] = useState(null), [page, setPage] = useState(1);
  const [transferInProgress, setTransferInProgress] = useState(false);
  const filtered = useMemo(() => students.filter(s => [s.student_id, s.name, s.phone, s.email, s.affiliation].join(' ').toLowerCase().includes(query.toLowerCase())), [students, query]);
  const refresh = async () => {
    setLoad('loading');
    try { const result = await api('currentStudents', { token: auth.token }); setStudents(result.students || []); setLoad('loaded'); }
    catch (error) { setLoad('error'); setMessage(error.message); }
  };
  const loadRecords = async id => {
    const sequence = ++recordsSequence.current;
    if (!id) { setRecords([]); setRecordsLoad('loaded'); return; }
    setRecords([]); setRecordsLoad('loading');
    try { const result = await api('currentCounselings', { token: auth.token, studentId: id }); if (sequence !== recordsSequence.current) return; setRecords(result.counselings || []); setPage(1); setRecordsLoad('loaded'); }
    catch (error) { if (sequence !== recordsSequence.current) return; setRecords([]); setRecordsLoad('error'); setMessage(error.message); }
  };
  useEffect(() => { refresh(); }, [auth.token]);
  const select = student => { setSelected(student); setDraft({ ...student }); loadRecords(student.student_id); };
  const save = () => run(async () => {
    const result = await api('saveCurrentStudent', { token: auth.token, create: !selected, student: draft });
    await refresh(); setSelected(result.student); setDraft(result.student); setMessage('재학생 정보를 저장했습니다.');
  });
  const transferStudent = () => {
    if (!selected || transferInProgress || loading) return;
    setTransferInProgress(true);
    run(async () => {
      const result = await api('transferCurrentStudent', { token: auth.token, studentId: selected.student_id });
      const year = result.graduationYear;
      setMessage(`${year}년도 졸업생 명단으로 전환되었습니다. (상태: 미취업자)`);
      await refresh();
      await onStudentTransferred?.(year);
    }).finally(() => setTransferInProgress(false));
  };
  const saveCounseling = () => run(async () => {
    const date = String(counselDraft.counseledAt || '').slice(0, 10);
    await api('saveCurrentCounseling', { token: auth.token, studentId: selected.student_id, counseling: { ...counselDraft, counseledAt: `${date}T00:00` } });
    setCounselDraft(null); await loadRecords(selected.student_id); setMessage('상담 기록을 저장했습니다.');
  });
  const deleteCounseling = () => {
    if (!window.confirm('이 상담 기록을 삭제할까요?')) return;
    run(async () => { await api('deleteCurrentCounseling', { token: auth.token, studentId: selected.student_id, counselingId: detail.counselingId }); setDetail(null); await loadRecords(selected.student_id); setMessage('상담 기록을 삭제했습니다.'); });
  };
  const pageCount = Math.ceil(records.length / PAGE_SIZE);
  const shown = records.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const field = (key, label, type = 'text', wide = false) => <label className={`field ${wide ? 'wide' : ''}`} key={key}><span>{label}</span>{type === 'textarea' ? <textarea value={draft?.[key] || ''} rows="3" onChange={e => setDraft({ ...draft, [key]: e.target.value })}/> : <input type={type} value={draft?.[key] || ''} disabled={key === 'student_id' && !!selected} onChange={e => setDraft({ ...draft, [key]: e.target.value })}/>}</label>;
  return <div className="current-students-page">
    <div className="current-student-layout">
      <section className="panel current-student-list"><StudentListHeader title="재학생 명단" count={filtered.length} query={query} onQueryChange={setQuery} placeholder="이름, 학번, 연락처, 이메일, 소속 검색"><button className="outline-button student-list-button" onClick={refresh} disabled={load === 'loading'}><RefreshCw size={15}/> 새로고침</button><button className="primary-button student-list-button" onClick={() => { setSelected(null); setDraft({ ...EMPTY }); setRecords([]); }}><Plus size={15}/> 재학생 등록</button></StudentListHeader>
        {load === 'loading' ? <div className="empty-detail">재학생 데이터를 불러오는 중입니다...</div> : load === 'error' ? <div className="empty-detail">데이터를 불러오지 못했습니다. <button className="outline-button" onClick={refresh}>다시 시도</button></div> : <div className="current-student-rows">{filtered.map(student => <button key={student.student_id} className={`current-student-row ${selected?.student_id === student.student_id ? 'active' : ''}`} onClick={() => select(student)}><b>{student.name}</b><span>{student.student_id}</span><small>{student.affiliation || student.enrollment_status || '소속 미등록'}</small></button>)}{!filtered.length && <div className="empty-detail">{students.length ? '검색 결과가 없습니다.' : '등록된 재학생이 없습니다.'}</div>}</div>}
      </section>
      <section className="panel current-student-detail"><div className="panel-title"><h2>{selected ? '재학생 정보 수정' : draft ? '재학생 등록' : '재학생 정보'}</h2></div>
        {draft ? <div className="form-grid current-student-form">{field('student_id','학번 / 학생 ID *')}{field('name','이름 *')}{field('birth_date','생년월일','date')}{field('gender','성별')}{field('phone','연락처','tel')}{field('email','이메일','email')}{field('affiliation','소속')}{field('enrollment_status','재학 상태')}{field('notes','기타 참고사항','textarea',true)}<div className="form-actions"><button className="sync" onClick={() => { setDraft(null); setSelected(null); }}>취소</button><button className="save" disabled={loading || !draft.student_id?.trim() || !draft.name?.trim()} onClick={save}><Save size={16}/> 저장</button>{selected && <button className="outline-button transfer-button" disabled={loading || transferInProgress || !selected.student_id?.trim()} onClick={transferStudent}><GraduationCap size={16}/>{transferInProgress ? '전환 처리 중…' : '졸업생 전환'}</button>}</div></div> : <div className="empty-detail">왼쪽 명단에서 학생을 선택하세요.</div>}
        <section className="panel current-counselings"><div className="panel-title"><h2>상담 이력 {selected && <small>총 {records.length}건</small>}</h2>{selected && <button className="primary-button" onClick={() => setCounselDraft({ counseledAt: new Date().toISOString().slice(0,10), content: '' })}><Plus size={15}/> 상담 등록</button>}</div>
          {!selected ? <div className="empty-detail">재학생을 선택하면 상담 이력이 표시됩니다.</div> : recordsLoad === 'loading' ? <div className="empty-detail" role="status">상담 이력을 불러오는 중입니다...</div> : recordsLoad === 'error' ? <div className="empty-detail" role="alert">상담 이력을 불러오지 못했습니다. <button className="outline-button" onClick={() => loadRecords(selected.student_id)}>다시 시도</button></div> : !records.length ? <div className="empty-detail">등록된 상담 이력이 없습니다.</div> : <div className="student-counseling-list">{shown.map(record => <button className="student-counseling-row" key={record.counselingId} onClick={() => setDetail(record)}><time>{String(record.counseledAt).slice(0,10)}</time><span>{record.content}</span><small>{record.authorName}</small></button>)}</div>}
          {pageCount > 1 && <nav className="counseling-pagination" aria-label="상담 이력 페이지"><button disabled={page <= 1} onClick={() => setPage(page - 1)}>이전</button>{Array.from({length:pageCount},(_,i)=><button key={i} className={page===i+1?'active':''} onClick={()=>setPage(i+1)}>{i+1}</button>)}<button disabled={page >= pageCount} onClick={() => setPage(page + 1)}>다음</button></nav>}
        </section>
      </section>
    </div>
    {(counselDraft || detail) && <div className="counseling-modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) { setDetail(null); setCounselDraft(null); } }}><section className="counseling-modal" role="dialog" aria-modal="true"><header><h2>{detail ? '상담 내용' : counselDraft.counselingId ? '상담 기록 수정' : '상담 등록'}</h2><button className="icon-button" onClick={() => { setDetail(null); setCounselDraft(null); }}><X size={18}/></button></header><div className="counseling-modal-body">{detail ? <><p>{String(detail.counseledAt).slice(0,10)} · {detail.authorName}</p><div className="counseling-full-content">{detail.content}</div></> : <><label className="field"><span>상담 날짜 *</span><input type="date" value={counselDraft.counseledAt} onChange={e => setCounselDraft({...counselDraft,counseledAt:e.target.value})}/></label><label className="field"><span>상담 내용 *</span><textarea rows="7" value={counselDraft.content} onChange={e => setCounselDraft({...counselDraft,content:e.target.value})}/></label></>}</div><footer>{detail && <><button className="danger-text-button" onClick={deleteCounseling}>삭제</button><button className="sync" onClick={() => { setCounselDraft({ counselingId: detail.counselingId, counseledAt: String(detail.counseledAt).slice(0,10), content: detail.content }); setDetail(null); }}>수정</button></>}<button className="sync" onClick={() => {setDetail(null);setCounselDraft(null);}}>닫기</button>{counselDraft && <button className="primary-button" onClick={saveCounseling} disabled={loading || !counselDraft.content.trim() || !counselDraft.counseledAt}><Save size={15}/> 저장</button>}</footer></section></div>}
  </div>;
}
