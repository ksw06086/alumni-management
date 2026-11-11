import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Check, Trash2 } from 'lucide-react';
import { DataState } from '../../components/FormControls.jsx';
import { EMPLOYMENT_CATEGORIES, getEmploymentSummary } from './employment.js';
import { getStudentStatusColor, STUDENT_STATUSES } from '../graduates/studentStatus.js';
import { sortStudentRows } from '../graduates/studentTableUtils.js';

export function StudentStats({ students, year, loadState, onRetry, onSelectStatus }) {
  if (loadState.status !== 'loaded') {
    return <section className="stats stats-loading"><DataState state={loadState} onRetry={onRetry}/></section>;
  }

  return (
    <section className="stats">
      <button type="button" className="total-card status-count-card" onClick={() => onSelectStatus('전체학생')}>
        <span>전체 학생</span>
        <strong>{students.length}<small>명</small></strong>
        <p>{year || '-'} 기준</p>
      </button>
      {STUDENT_STATUSES.map(label => {
        const color = getStudentStatusColor(label);
        const count = students.filter(student => student.status === label).length;

        return (
          <button
            type="button"
            className="stat-card status-count-card"
            style={{ '--status-accent': color.accent, '--status-bg': color.background, '--status-fg': color.foreground }}
            key={label}
            onClick={() => onSelectStatus(label)}
          >
            <span>{label}</span>
            <strong>{count}<small>명</small></strong>
          </button>
        );
      })}
    </section>
  );
}

export function StatusFilter({ value, onChange }) {
  const options = ['전체학생', ...STUDENT_STATUSES];
  return (
    <div className="status-filter">
      {options.map(label => (
        <button key={label} className={value === label ? 'active' : ''} onClick={() => onChange(label)}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function StudentTable({
  rows,
  rowLimit,
  selected,
  onSelect,
  onCounsel,
  onDelete,
  clickableRows = false,
  loadState = { status: 'loaded' },
  onRetry,
  emptyMessage = '표시할 데이터가 없습니다.',
}) {
  const [sort, setSort] = useState(null);
  const columns = [
    { key: 'studentId', label: '학번' },
    { key: 'name', label: '이름' },
    { key: 'gender', label: '성별' },
    { key: 'gpa', label: '평점', numeric: true },
    { key: 'status', label: '상태' },
    { key: 'company', label: '취업/진학처' },
    { key: 'field', label: '관심분야' },
  ];
  const sortedRows = useMemo(
    () => sortStudentRows(rows, sort && { ...sort, numeric: sort.key === 'gpa' }),
    [rows, sort],
  );
  const displayedRows = rowLimit ? sortedRows.slice(0, rowLimit) : sortedRows;
  const toggleSort = key => {
    setSort(current => current?.key !== key
      ? { key, direction: 'asc' }
      : current.direction === 'asc' ? { key, direction: 'desc' } : null);
  };
  const sortHeader = ({ key, label }) => {
    const active = sort?.key === key;
    const Icon = active ? (sort.direction === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
    const direction = active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none';

    return (
      <th key={key} aria-sort={direction}>
        <button type="button" className="sortable-header" onClick={() => toggleSort(key)}>
          {label}<Icon size={13}/>
        </button>
      </th>
    );
  };

  if (loadState.status !== 'loaded') {
    return (
      <div className={`table-data-state ${clickableRows ? 'student-table-state' : ''}`}>
        <DataState state={loadState} onRetry={onRetry}/>
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>번호</th>{columns.map(sortHeader)}<th>관리</th></tr></thead>
        <tbody>
          {displayedRows.map((student, index) => {
            const color = getStudentStatusColor(student.status);
            const rowClass = `${selected?.studentId === student.studentId ? 'selected ' : ''}${clickableRows ? 'clickable-row' : ''}`;
            const selectRow = () => onSelect(student);
            const handleKeyDown = event => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                selectRow();
              }
            };

            return (
              <tr
                key={`${student.graduationYear}-${student.studentId}`}
                className={rowClass}
                onClick={clickableRows ? selectRow : undefined}
                onKeyDown={clickableRows ? handleKeyDown : undefined}
                tabIndex={clickableRows ? 0 : undefined}
              >
                <td>{index + 1}</td>
                <td>{student.studentId}</td>
                <td><b>{student.name}</b></td>
                <td>{student.gender || '-'}</td>
                <td>{student.gpa || '-'}</td>
                <td>
                  <span className="tag" style={{ '--status-bg': color.background, '--status-fg': color.foreground, '--status-accent': color.accent }}>
                    {student.status || '미지정'}
                  </span>
                </td>
                <td>{student.company || '-'}</td>
                <td>{student.field || '-'}</td>
                <td>
                  <div className="row-actions">
                    {!clickableRows && (
                      <button className="view" onClick={event => { event.stopPropagation(); onSelect(student); }}>
                        {selected?.studentId === student.studentId ? <Check size={14}/> : null}조회
                      </button>
                    )}
                    {!clickableRows && onCounsel && (
                      <button className="view" onClick={event => { event.stopPropagation(); onCounsel(student); }} title="상담 이력">상담</button>
                    )}
                    <button
                      className="icon-button danger"
                      aria-label={`${student.name} 삭제`}
                      title="삭제"
                      onClick={event => { event.stopPropagation(); onDelete(student); }}
                    >
                      <Trash2 size={15}/>
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!displayedRows.length && <div className="empty-detail">{emptyMessage}</div>}
    </div>
  );
}

export function EmploymentOverview({ students, year, loadState, onRetry }) {
  const heading = <div className="panel-title"><h2>취업 현황</h2><span>{year || '연도'} 기준 · 학생 명단 상태값</span></div>;
  if (loadState.status !== 'loaded') {
    return <section className="panel employment-overview">{heading}<DataState state={loadState} onRetry={onRetry}/></section>;
  }
  if (!students.length) {
    return <section className="panel employment-overview">{heading}<DataState state={loadState} empty emptyMessage="등록된 데이터가 없습니다."/></section>;
  }

  const { counts, total, excluded, eligible, employed, rate: rawRate } = getEmploymentSummary(students);
  const rate = rawRate === null ? null : rawRate.toFixed(1);
  let offset = 0;
  const segments = counts.map(item => {
    const start = offset;
    const part = total ? item.count / total : 0;
    offset += part;
    return { ...item, start, part };
  });
  const gradient = `conic-gradient(${segments.map(item => {
    const color = getStudentStatusColor(item.label).accent;
    return `${color} ${item.start * 100}% ${(item.start + item.part) * 100}%`;
  }).join(',')})`;

  return (
    <section className="panel employment-overview">
      {heading}
      <div className="employment-content">
        <div className="employment-chart-area">
          <div className="employment-donut" style={{ background: gradient }} aria-label={`전체 ${total}명 상태별 원형 그래프`}>
            <div className="donut-hole"><b>{total}</b><span>전체 학생</span></div>
          </div>
          <div className="employment-legend">
            {counts.map(item => (
              <div className="employment-legend-item" key={item.label}>
                <i style={{ background: getStudentStatusColor(item.label).accent }}/>
                <span>{item.label}</span><b>{item.count}명</b>
                <small>{total ? (item.count / total * 100).toFixed(1) : '0.0'}%</small>
              </div>
            ))}
          </div>
        </div>
        <div className="employment-rate">
          <span>취업률</span>
          <strong>{rate === null ? '산정 불가' : <>{rate}<small>%</small></>}</strong>
          <p>취업자 <b>{employed}명</b> / 산정 대상 <b>{eligible}명</b></p>
          <small>전체 {total}명 중 진학·군입대 {excluded}명 제외</small>
        </div>
      </div>
    </section>
  );
}

export function StatusBars({ students = [], counts, total, loadState, onRetry }) {
  if (loadState && loadState.status !== 'loaded') return <DataState state={loadState} onRetry={onRetry}/>;
  if (loadState && !counts && !students.length) {
    return <DataState state={loadState} empty emptyMessage="등록된 데이터가 없습니다."/>;
  }

  const summary = counts || STUDENT_STATUSES.reduce((result, label) => ({
    ...result,
    [label]: students.filter(student => student.status === label).length,
  }), {});
  const max = Math.max(total ?? students.length, 1);

  return (
    <div className="status-bars">
      {STUDENT_STATUSES.map(label => {
        const color = getStudentStatusColor(label);
        const count = summary[label] || 0;

        return (
          <div className="status-bar-row" key={label} style={{ '--status-accent': color.accent, '--status-fg': color.foreground }}>
            <span className="status-badge">{label}</span>
            <div className="bar"><i style={{ width: `${Math.min(100, count / max * 100)}%` }}/></div>
            <b>{count}명</b>
          </div>
        );
      })}
    </div>
  );
}
