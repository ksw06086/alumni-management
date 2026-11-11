import React from 'react';
import { Search } from 'lucide-react';

export default function StudentListHeader({ title, count, query, onQueryChange, placeholder, children }) {
  return <header className="panel-title student-list-header">
    <h2 className="student-list-heading">{title}</h2>
    <small className="student-list-total">총 {count}명</small>
    <label className="search student-list-search">
      <Search size={16} aria-hidden="true"/>
      <input value={query} onChange={event => onQueryChange(event.target.value)} placeholder={placeholder}/>
    </label>
    <div className="student-list-actions">{children}</div>
  </header>;
}
