import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, MapPin, MoreHorizontal, Pencil, Plus, Repeat2, Search, Trash2, X } from 'lucide-react';
import { buildDateEventMap, buildWeekEventSegments, calendarGridDates, dateKey } from './schedules.js';

const API_URL = import.meta.env.VITE_API_BASE_URL || '';
const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];
const DEFAULT_CATEGORY_COLOR = '#64748b';

async function send(action, token, payload = {}) {
  // 일정 화면의 API 어댑터입니다. 인증 토큰과 action을 붙여 Worker에 보내고 응답 오류를 예외로 바꿉니다.
  if (!API_URL) throw new Error('VITE_API_BASE_URL이 설정되지 않았습니다.');
  let response;
  try {
    response = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, token, ...payload }) });
  } catch (_) { throw new Error('일정 API에 연결할 수 없습니다. 네트워크와 API 설정을 확인하세요.'); }
  let result;
  try { result = await response.json(); } catch (_) { throw new Error(`서버 응답을 읽을 수 없습니다. (HTTP ${response.status})`); }
  if (!response.ok || !result.ok) throw new Error(result.error || `요청에 실패했습니다. (HTTP ${response.status})`);
  return result;
}

function seoulDateParts(date = new Date()) {
  // 브라우저 로컬 시간대가 아닌 서비스 기준 시간대(Asia/Seoul)로 오늘 날짜를 계산합니다.
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  return Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
}
function seoulDateKey(date = new Date()) {
  const parts = seoulDateParts(date);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}
function currentSeoulMonth() { const { year, month } = seoulDateParts(); return new Date(year, month - 1, 1); }
function timeValue(datetime) { return String(datetime || '').slice(11, 16); }
function seoulDatetime(date, time, allDay) { return `${date}T${allDay ? '00:00' : time}:00+09:00`; }
function formatDate(date) {
  const [year, month, day] = date.split('-').map(Number);
  const dayName = DAY_NAMES[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${year}.${String(month).padStart(2, '0')}.${String(day).padStart(2, '0')} (${dayName})`;
}
function monthLabel(date) { return new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', timeZone: 'Asia/Seoul' }).format(new Date(Date.UTC(date.getFullYear(), date.getMonth(), 15, 12))); }
function safeColor(value) { return /^#[\da-f]{6}$/i.test(String(value || '')) ? value : DEFAULT_CATEGORY_COLOR; }
function eventKey(event) { return `${event.schedule_id}:${event.occurrence_start_date}`; }
function monthOccurrences(dateMap, year, month) {
  // 다일 일정은 날짜 맵에 여러 번 나타나므로 occurrence 키로 중복을 제거해 월간 목록을 만듭니다.
  const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const monthEnd = dateKey(new Date(Date.UTC(year, month + 1, 0)));
  const unique = new Map();
  Object.entries(dateMap).forEach(([, events]) => {
    events.forEach(event => {
      if (event.occurrence_start_date <= monthEnd && event.occurrence_end_date >= monthStart) unique.set(eventKey(event), event);
    });
  });
  return [...unique.values()].sort((a, b) => a.occurrence_start_date.localeCompare(b.occurrence_start_date) || a.start_datetime.localeCompare(b.start_datetime));
}

export default function SchedulePage({ auth }) {
  // 화면 상태(선택 월, 필터, 모달)와 서버 원본(categories/schedules)을 분리해 관리합니다.
  const [month, setMonth] = useState(currentSeoulMonth);
  const [categories, setCategories] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [hiddenCategoryIds, setHiddenCategoryIds] = useState([]);
  const [search, setSearch] = useState('');
  const [focusedDate, setFocusedDate] = useState('');
  const [detail, setDetail] = useState(null);
  const [editor, setEditor] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const gridDates = useMemo(() => calendarGridDates(month), [month]);
  const rangeStart = dateKey(gridDates[0]);
  const rangeEnd = dateKey(gridDates[gridDates.length - 1]);

  const loadCategories = async () => {
    const result = await send('scheduleCategories', auth.token);
    setCategories(result.categories || []);
  };
  const loadSchedules = async (fromDate = rangeStart, toDate = rangeEnd) => {
    const result = await send('schedules', auth.token, { fromDate, toDate });
    setSchedules(result.schedules || []);
  };

  // 로그인 사용자별 카테고리를 한 번 읽습니다. unmount 후 늦게 도착한 응답은 무시합니다.
  useEffect(() => {
    let active = true;
    send('scheduleCategories', auth.token).then(result => { if (active) { setCategories(result.categories || []); setError(''); } }).catch(reason => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, [auth.token]);
  // 월 이동 때 달력에 보이는 42일 범위만 요청합니다. 요청 범위가 바뀌면 이전 응답을 무시합니다.
  useEffect(() => {
    let active = true;
    setBusy(true);
    send('schedules', auth.token, { fromDate: rangeStart, toDate: rangeEnd }).then(result => {
      if (active) { setSchedules(result.schedules || []); setError(''); }
    }).catch(reason => { if (active) setError(reason.message); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [auth.token, rangeStart, rangeEnd]);

  // 아래 값들은 API 원본에서 파생되는 읽기 전용 데이터입니다. 검색/필터 변경 시 재계산됩니다.
  const categoriesById = useMemo(() => Object.fromEntries(categories.map(category => [category.category_id, category])), [categories]);
  const displayCategories = useMemo(() => categories.filter(category => category.is_active || schedules.some(schedule => schedule.category_id === category.category_id)), [categories, schedules]);
  const filteredSchedules = useMemo(() => schedules.filter(schedule =>
    !hiddenCategoryIds.includes(schedule.category_id) && schedule.title.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())
  ), [schedules, hiddenCategoryIds, search]);
  const dateEvents = useMemo(() => buildDateEventMap(filteredSchedules, rangeStart, rangeEnd), [filteredSchedules, rangeStart, rangeEnd]);
  const weekEventSegments = useMemo(() => buildWeekEventSegments(dateEvents, gridDates), [dateEvents, gridDates]);
  const agendaEvents = useMemo(() => {
    if (focusedDate) return (dateEvents[focusedDate] || []).slice().sort((a, b) => a.start_datetime.localeCompare(b.start_datetime));
    return monthOccurrences(dateEvents, month.getFullYear(), month.getMonth());
  }, [dateEvents, focusedDate, month]);

  const setMonthOffset = offset => { setMonth(current => new Date(current.getFullYear(), current.getMonth() + offset, 1)); setFocusedDate(''); setError(''); };
  const goToday = () => { const { year, month } = seoulDateParts(); setMonth(new Date(year, month - 1, 1)); setFocusedDate(seoulDateKey()); };
  const openNew = date => {
    if (!categories.some(category => category.is_active)) { setError('사용 가능한 카테고리가 없습니다. schedule_categories 시트의 카테고리 행을 확인하세요.'); return; }
    const selectedDate = date || focusedDate || seoulDateKey();
    const firstCategory = categories.find(category => category.is_active);
    setError(''); setDetail(null);
    setEditor({ schedule_id: '', title: '', category_id: firstCategory.category_id, start_date: selectedDate, start_time: '09:00', end_date: selectedDate, end_time: '10:00', all_day: false, location: '', description: '', repeat_type: 'none', repeat_interval: 1, repeat_until: '' });
  };
  const openEdit = schedule => {
    setDetail(null);
    setEditor({
      schedule_id: schedule.schedule_id, title: schedule.title, category_id: schedule.category_id,
      start_date: schedule.start_datetime.slice(0, 10), start_time: timeValue(schedule.start_datetime),
      end_date: schedule.end_datetime.slice(0, 10), end_time: timeValue(schedule.end_datetime),
      all_day: schedule.all_day, location: schedule.location || '', description: schedule.description || '',
      repeat_type: schedule.repeat_type || 'none', repeat_interval: schedule.repeat_interval || 1, repeat_until: schedule.repeat_until || '',
    });
  };
  // 폼 값의 필수 항목과 시작/종료 순서를 검증한 뒤 한국 시간 ISO 형태로 저장합니다.
  const save = async value => {
    if (!value.title.trim()) { setError('일정 제목을 입력하세요.'); return; }
    if (!value.start_date || !value.end_date || (!value.all_day && (!value.start_time || !value.end_time))) { setError('시작 및 종료 날짜와 시간을 입력하세요.'); return; }
    const start = seoulDatetime(value.start_date, value.start_time, value.all_day);
    const end = seoulDatetime(value.end_date, value.end_time, value.all_day);
    if (Date.parse(start) > Date.parse(end)) { setError('종료 일시는 시작 일시보다 빠를 수 없습니다.'); return; }
    if (value.repeat_type !== 'none' && value.repeat_until && value.repeat_until < value.start_date) { setError('반복 종료일은 시작 날짜 이후로 입력하세요.'); return; }
    setBusy(true); setError('');
    try {
      await send('saveSchedule', auth.token, { schedule: {
        schedule_id: value.schedule_id, title: value.title, category_id: value.category_id,
        start_datetime: start, end_datetime: end, all_day: value.all_day,
        location: value.location, description: value.description,
        repeat_type: value.repeat_type, repeat_interval: value.repeat_type === 'none' ? 1 : Number(value.repeat_interval || 1),
        repeat_until: value.repeat_type === 'none' ? '' : value.repeat_until,
      } });
      await loadSchedules(); setEditor(null); setDetail(null); setNotice(value.schedule_id ? '일정을 수정했습니다.' : '일정을 등록했습니다.');
    } catch (reason) { setError(reason.message); }
    finally { setBusy(false); }
  };
  // 삭제는 확인 대화상자 뒤 서버에 요청하고, 성공하면 현재 달력 데이터를 다시 불러옵니다.
  const remove = async schedule => {
    if (!window.confirm(`“${schedule.title}” 일정을 삭제할까요?`)) return;
    setBusy(true); setError('');
    try {
      await send('deleteSchedule', auth.token, { schedule_id: schedule.schedule_id });
      await loadSchedules(); setDetail(null); setNotice('일정을 삭제했습니다.');
    } catch (reason) { setError(reason.message); }
    finally { setBusy(false); }
  };
  const toggleCategory = id => setHiddenCategoryIds(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
  const titleForDate = focusedDate ? formatDate(focusedDate) : `${monthLabel(month)} 일정`;

  return <div className="schedule-page">
    <div className="schedule-page-heading"><div><p className="schedule-eyebrow">PERSONAL PLANNER</p><h1>일정</h1><p>개인 일정과 반복 일정을 월간 달력에서 관리합니다.</p></div><button className="primary-button schedule-write" onClick={() => openNew()}><Plus size={17}/> 일정 쓰기</button></div>
    <section className="panel schedule-panel">
      <div className="schedule-toolbar"><div className="schedule-toolbar-left"><button className="outline-button" onClick={goToday}>오늘</button><button className="calendar-nav-button" aria-label="이전 달" onClick={() => setMonthOffset(-1)}><ChevronLeft size={20}/></button><button className="calendar-nav-button" aria-label="다음 달" onClick={() => setMonthOffset(1)}><ChevronRight size={20}/></button><h2>{monthLabel(month)}</h2><span className="calendar-view-label"><CalendarDays size={15}/> 월간</span></div><div className="schedule-search"><Search size={16}/><input aria-label="일정 제목 검색" placeholder="제목 검색" value={search} onChange={event => setSearch(event.target.value)}/>{search && <button aria-label="검색 지우기" onClick={() => setSearch('')}><X size={14}/></button>}</div></div>
      <div className="schedule-layout"><aside className="schedule-sidebar"><h3>내 카테고리</h3><p>표시할 일정을 선택하세요.</p><div className="category-filter-list">{displayCategories.map(category => <label key={category.category_id} className={hiddenCategoryIds.includes(category.category_id) ? 'category-filter muted' : 'category-filter'}><input type="checkbox" checked={!hiddenCategoryIds.includes(category.category_id)} onChange={() => toggleCategory(category.category_id)}/><i style={{ backgroundColor: safeColor(category.color_hex) }}/><span>{category.category_name}</span></label>)}</div><button className="category-show-all" onClick={() => setHiddenCategoryIds([])}>모두 표시</button><div className="schedule-sidebar-hint"><Repeat2 size={15}/> 반복 일정은 종료일까지 자동으로 표시됩니다.</div></aside>
        <div className="calendar-scroll"><div className="month-calendar" aria-label={`${monthLabel(month)} 월간 달력`}>
          <div className="calendar-weekdays">{DAY_NAMES.map((day, index) => <div key={day} className={index === 0 ? 'sunday' : index === 6 ? 'saturday' : ''}>{day}</div>)}</div>
          {/* 긴 일정은 주 단위 막대, 하루 일정은 날짜 셀 안의 이벤트로 렌더링합니다. */}
          <div className="calendar-days">{weekEventSegments.map((week, weekIndex) => {
            const days = gridDates.slice(weekIndex * 7, weekIndex * 7 + 7);
            return <div className="calendar-week" key={dateKey(days[0])} style={{ '--week-lanes': week.laneCount }}>
              <div className="calendar-week-events">{week.segments.map(segment => {
                const event = segment.event; const category = categoriesById[event.category_id];
                return <button key={`${eventKey(event)}-${weekIndex}`} className="calendar-event calendar-span-event" style={{ '--event-color': safeColor(category?.color_hex), gridColumn: `${segment.startColumn} / ${segment.endColumn}`, top: `${34 + segment.lane * 22}px` }} title={`${event.title} · ${event.occurrence_start_date} – ${event.occurrence_end_date}`} onClick={click => { click.stopPropagation(); setDetail({ ...event, _category: category }); setError(''); }}><span>{event.title}</span></button>;
              })}</div>
              {days.map(day => {
                const key = dateKey(day); const isCurrentMonth = day.getUTCMonth() === month.getMonth();
                const isToday = key === seoulDateKey(); const isFocused = key === focusedDate;
                const events = (dateEvents[key] || []).filter(event => event.occurrence_start_date === event.occurrence_end_date);
                const shown = events.slice(0, 3);
                return <div key={key} className={`calendar-day ${isCurrentMonth ? '' : 'outside-month'} ${isToday ? 'today' : ''} ${isFocused ? 'focused' : ''}`} onClick={() => { setFocusedDate(key); setError(''); }}>
                  <button className="calendar-date" onClick={() => { setFocusedDate(key); setError(''); }} aria-label={`${key} 선택`}><span>{day.getUTCDate()}</span></button>
                  <div className="calendar-event-list">{shown.map((event, index) => {
                    const category = categoriesById[event.category_id];
                    return <button key={`${eventKey(event)}-${index}`} className="calendar-event" style={{ '--event-color': safeColor(category?.color_hex) }} title={`${event.title}${event.all_day ? ' · 종일' : ` · ${timeValue(event.start_datetime)}`}`} onClick={click => { click.stopPropagation(); setDetail({ ...event, _category: category }); setError(''); }}><span>{event.title}</span></button>;
                  })}{events.length > 3 && <button className="calendar-more" onClick={click => { click.stopPropagation(); setFocusedDate(key); }}>+{events.length - 3} more</button>}</div>
                </div>;
              })}
            </div>;
          })}</div>
        </div></div>
      </div>
    </section>
    <section className="panel schedule-agenda"><div className="panel-title"><div><h2>{titleForDate}</h2><p>{focusedDate ? '선택한 날짜의 일정' : '이 달에 시작하는 일정'}</p></div><button className="outline-button" onClick={() => openNew(focusedDate || undefined)}><Plus size={15}/> 일정 추가</button></div>
      {agendaEvents.length ? <div className="agenda-list">{agendaEvents.map(event => {
        const category = categoriesById[event.category_id];
        return <button className="agenda-event" key={eventKey(event)} onClick={() => setDetail({ ...event, _category: category })}><i style={{ backgroundColor: safeColor(category?.color_hex) }}/><span className="agenda-date">{event.occurrence_start_date === event.occurrence_end_date ? formatDate(event.occurrence_start_date) : `${formatDate(event.occurrence_start_date)} – ${formatDate(event.occurrence_end_date)}`}</span><span className="agenda-time">{event.all_day ? '종일' : `${timeValue(event.start_datetime)}–${timeValue(event.end_datetime)}`}</span><b>{event.title}</b><small>{category?.category_name || '기타'}</small></button>;
      })}</div> : <div className="schedule-empty">{search ? '검색 조건에 맞는 일정이 없습니다.' : focusedDate ? '선택한 날짜에 일정이 없습니다.' : '이번 달에 등록된 일정이 없습니다.'}</div>}
    </section>
    {(error || notice) && <p className={`schedule-message ${error ? 'error' : ''}`} role="status">{error || notice}</p>}
    {busy && <div className="schedule-loading" role="status">일정을 불러오거나 저장하고 있습니다…</div>}
    {editor && <ScheduleEditor value={editor} categories={categories.filter(category => category.is_active || category.category_id === editor.category_id)} busy={busy} onChange={setEditor} onClose={() => { setEditor(null); setError(''); }} onSave={save}/>}
    {detail && <ScheduleDetail schedule={detail} category={detail._category || categoriesById[detail.category_id]} onClose={() => setDetail(null)} onEdit={() => openEdit(detail)} onDelete={() => remove(detail)}/>}
  </div>;
}

// 편집기는 부모가 가진 draft만 갱신하고, 저장/닫기 정책은 부모 콜백에 위임합니다.
function ScheduleEditor({ value, categories, busy, onChange, onClose, onSave }) {
  const [more, setMore] = useState(Boolean(value.description || value.location || value.repeat_type !== 'none'));
  const update = (key, next) => onChange(current => ({ ...current, [key]: next }));
  useEffect(() => {
    const closeOnEscape = event => { if (event.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [busy, onClose]);
  return <div className="schedule-overlay" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}><section className="schedule-modal" role="dialog" aria-modal="true" aria-labelledby="schedule-editor-title"><header><div><p>PERSONAL PLANNER</p><h2 id="schedule-editor-title">{value.schedule_id ? '일정 수정' : '일정 쓰기'}</h2></div><button className="modal-close" aria-label="닫기" onClick={onClose} disabled={busy}><X size={19}/></button></header>
    <div className="schedule-form"><label className="schedule-field"><span>카테고리</span><select value={value.category_id} onChange={event => update('category_id', event.target.value)}>{categories.map(category => <option key={category.category_id} value={category.category_id}>{category.category_name}</option>)}</select></label>
      <div className="schedule-date-row"><div className="schedule-date-label">일시</div><div className="schedule-date-inputs"><div><input type="date" aria-label="시작 날짜" value={value.start_date} onChange={event => update('start_date', event.target.value)}/>{!value.all_day && <input type="time" aria-label="시작 시간" value={value.start_time} onChange={event => update('start_time', event.target.value)}/>}</div><div className="date-range-separator">부터</div><div><input type="date" aria-label="종료 날짜" value={value.end_date} onChange={event => update('end_date', event.target.value)}/>{!value.all_day && <input type="time" aria-label="종료 시간" value={value.end_time} onChange={event => update('end_time', event.target.value)}/>}</div></div></div>
      <div className="schedule-options"><label><input type="checkbox" checked={value.all_day} onChange={event => update('all_day', event.target.checked)}/> 종일</label><label><input type="checkbox" checked={value.repeat_type !== 'none'} onChange={event => { update('repeat_type', event.target.checked ? 'weekly' : 'none'); update('repeat_interval', 1); update('repeat_until', ''); }}/> 반복</label></div>
      {value.repeat_type !== 'none' && <div className="schedule-repeat-options"><label className="schedule-field"><span>반복 주기</span><select value={value.repeat_type} onChange={event => update('repeat_type', event.target.value)}><option value="daily">매일</option><option value="weekly">매주</option><option value="monthly">매월</option></select></label><label className="schedule-field"><span>간격</span><div className="interval-input"><input type="number" min="1" max="99" value={value.repeat_interval} onChange={event => update('repeat_interval', event.target.value)}/><span>{value.repeat_type === 'daily' ? '일마다' : value.repeat_type === 'weekly' ? '주마다' : '개월마다'}</span></div></label><label className="schedule-field"><span>반복 종료일 (선택)</span><input type="date" value={value.repeat_until} min={value.start_date} onChange={event => update('repeat_until', event.target.value)}/></label></div>}
      <label className="schedule-field"><span>일정 제목 <b>*</b></span><input autoFocus maxLength="200" value={value.title} onChange={event => update('title', event.target.value)} placeholder="일정 제목을 입력하세요."/></label>
      {more && <><label className="schedule-field"><span>장소</span><input maxLength="300" value={value.location} onChange={event => update('location', event.target.value)} placeholder="장소를 입력하세요."/></label><label className="schedule-field"><span>상세 설명</span><textarea maxLength="5000" rows="4" value={value.description} onChange={event => update('description', event.target.value)} placeholder="일정에 대한 설명을 입력하세요."/></label></>}
    </div><footer><button className="modal-cancel" onClick={onClose} disabled={busy}>취소</button><button className="modal-more" onClick={() => setMore(current => !current)}>{more ? '간단히' : '더보기'} <MoreHorizontal size={16}/></button><button className="modal-submit" onClick={() => onSave(value)} disabled={busy || !value.title.trim()}>{value.schedule_id ? '저장' : '등록'}</button></footer></section></div>;
}

// 상세 모달은 선택된 occurrence와 원본 일정 정보를 읽고 수정·삭제 동작을 부모에게 요청합니다.
function ScheduleDetail({ schedule, category, onClose, onEdit, onDelete }) {
  useEffect(() => {
    const closeOnEscape = event => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);
  const startDate = schedule.occurrence_start_date || schedule.start_datetime.slice(0, 10);
  const endDate = schedule.occurrence_end_date || schedule.end_datetime.slice(0, 10);
  const repeatLabels = { none: '', daily: '매일', weekly: '매주', monthly: '매월' };
  const repeatUnit = { daily: '일', weekly: '주', monthly: '개월' }[schedule.repeat_type];
  return <div className="schedule-overlay schedule-detail-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><section className="schedule-detail-modal" role="dialog" aria-modal="true" aria-labelledby="schedule-detail-title"><header><div className="schedule-detail-actions"><button aria-label="일정 수정" title="수정" onClick={onEdit}><Pencil size={18}/></button><button aria-label="일정 삭제" title="삭제" onClick={onDelete}><Trash2 size={18}/></button><button aria-label="닫기" title="닫기" onClick={onClose}><X size={19}/></button></div></header><div className="schedule-detail-content"><div className="detail-category"><i style={{ backgroundColor: safeColor(category?.color_hex) }}/>{category?.category_name || '기타'}</div><h2 id="schedule-detail-title">{schedule.title}</h2><p className="detail-datetime">{startDate === endDate ? formatDate(startDate) : `${formatDate(startDate)} – ${formatDate(endDate)}`}<br/>{schedule.all_day ? '종일' : `${timeValue(schedule.start_datetime)} – ${timeValue(schedule.end_datetime)}`}</p>
      {schedule.repeat_type !== 'none' && <><p className="detail-row"><Repeat2 size={16}/>{schedule.repeat_interval > 1 ? `${schedule.repeat_interval}${repeatUnit}마다` : repeatLabels[schedule.repeat_type]}{schedule.repeat_until ? ` · ${formatDate(schedule.repeat_until)}까지` : ' · 종료일 없음'}</p><p className="schedule-repeat-note">반복 일정의 수정·삭제는 전체 반복 규칙에 적용됩니다.</p></>}
      {schedule.location && <p className="detail-row"><MapPin size={16}/>{schedule.location}</p>}{schedule.description && <p className="detail-description">{schedule.description}</p>}
      <div className="detail-author"><span className="author-avatar">{String(schedule.user_name || '?').slice(0, 1)}</span><div><b>{schedule.user_name || '사용자'}</b><small>등록 {schedule.created_at || '-'}</small>{schedule.updated_at && schedule.updated_at !== schedule.created_at && <small>수정 {schedule.updated_at}</small>}</div></div>
    </div></section></div>;
}
