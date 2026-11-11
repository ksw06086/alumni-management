import React, { useEffect } from 'react';
import { CheckCircle2, Info, TriangleAlert, X } from 'lucide-react';

const ICONS = { success: CheckCircle2, warning: TriangleAlert, error: TriangleAlert, info: Info };

function ToastItem({ toast, onDismiss }) {
  useEffect(() => {
    const timeout = window.setTimeout(() => onDismiss(toast.id), toast.type === 'error' ? 10000 : 4500);
    return () => window.clearTimeout(timeout);
  }, [toast.id, toast.type, onDismiss]);
  const Icon = ICONS[toast.type] || Info;
  return <div className={`toast toast-${toast.type}`} role={toast.type === 'error' ? 'alert' : 'status'}>
    <Icon size={18} aria-hidden="true"/>
    <span>{toast.message}</span>
    <button type="button" onClick={() => onDismiss(toast.id)} aria-label="알림 닫기"><X size={16}/></button>
  </div>;
}

export default function ToastViewport({ items, onDismiss }) {
  if (!items.length) return null;
  return <div className="toast-viewport" aria-live="polite" aria-relevant="additions text">
    {items.map(toast => <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss}/>) }
  </div>;
}
