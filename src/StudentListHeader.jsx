import React from 'react';
import { Search, X } from 'lucide-react';

export default function StudentListHeader({ title, count, query, onQueryChange, placeholder, children }) {
  return <header className="panel-title student-list-header">
    <h2 className="student-list-heading">{title}</h2>
    <small className="student-list-total">총 {count}명</small>
    <div className="search student-list-search">
      <Search size={16} aria-hidden="true"/>
      <input aria-label={placeholder || `${title} 검색`} value={query} onChange={event => onQueryChange(event.target.value)} placeholder={placeholder}/>
      {query && <button type="button" className="student-list-search-clear" onClick={() => onQueryChange('')} aria-label="검색어 지우기" title="검색어 지우기"><X size={15}/></button>}
    </div>
    <div className="student-list-actions">{children}</div>
  </header>;
}
