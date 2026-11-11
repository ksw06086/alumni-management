export function DataState({ state, onRetry, empty = false, emptyMessage = '등록된 데이터가 없습니다.' }) {
  if (state?.status === 'loading' || state?.status === 'idle') {
    return (
      <div className="data-state" role="status" aria-live="polite">
        <span className="data-spinner" aria-hidden="true" />
        <span>데이터를 불러오는 중입니다...</span>
      </div>
    );
  }

  if (state?.status === 'error') {
    return (
      <div className="data-state data-state-error" role="alert">
        <span>데이터를 불러오지 못했습니다. 다시 시도해 주세요.</span>
        {state.error && <small title={state.error}>{state.error}</small>}
        <button className="outline-button" onClick={onRetry}>다시 시도</button>
      </div>
    );
  }

  if (empty) {
    return <div className="data-state data-state-empty" role="status">{emptyMessage}</div>;
  }

  return null;
}

export function Field({ label, value, onChange, options, textarea, wide, disabled, type = 'text' }) {
  return (
    <label className={`field ${wide ? 'wide' : ''}`}>
      <span>{label}</span>
      {textarea ? (
        <textarea value={value || ''} onChange={event => onChange(event.target.value)} />
      ) : options ? (
        <select value={value ?? ''} onChange={event => onChange(event.target.value)}>
          {options.map(option => typeof option === 'string'
            ? <option key={option}>{option}</option>
            : <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      ) : (
        <input
          type={type}
          disabled={disabled}
          value={value ?? ''}
          onChange={event => onChange(event.target.value)}
        />
      )}
    </label>
  );
}
