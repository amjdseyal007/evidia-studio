/**
 * Shared enterprise UI primitives: data table (sort/filter/paginate),
 * modal, confirm dialog, toasts, pills, meters, empty states, and
 * lightweight inline-SVG charts. All styling via index.css tokens.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

// ------------------------------------------------------------------ pills
export type Tone = 'ok' | 'warn' | 'err' | 'info' | 'neutral';
export function Pill({ tone = 'neutral', children, testId }: { tone?: Tone; children: ReactNode; testId?: string }) {
  return <span className={`pill pill-${tone}`} data-testid={testId}>{children}</span>;
}

export function toneForStatus(status: string): Tone {
  const s = status.toLowerCase();
  if (['active', 'succeeded', 'connected', 'operational', 'healthy', 'deployed', 'intact'].includes(s)) return 'ok';
  if (['running', 'provisioning', 'invited', 'warn'].includes(s)) return 'info';
  if (['degraded', 'unknown', 'not-deployed', 'synth-only', 'warning', 'suspended'].includes(s)) return 'warn';
  if (['failed', 'error', 'blocked', 'offboarded', 'deactivated', 'revoked'].includes(s)) return 'err';
  return 'neutral';
}

// ------------------------------------------------------------------ meter
export function Meter({ value, max, label }: { value: number; max: number; label?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="meter" role="meter" aria-valuenow={value} aria-valuemax={max} aria-label={label}>
      <div className="meter-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

// ------------------------------------------------------------------ toasts
export interface Toast { id: number; title: string; body?: string; tone: Tone }
const ToastCtx = createContext<{ push: (t: Omit<Toast, 'id'>) => void }>({ push: () => undefined });
let toastSeq = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = toastSeq++;
    setToasts((prev) => [...prev, { ...t, id }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 5200);
  }, []);
  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`} role="status">
            <strong>{t.title}</strong>
            {t.body ? <div>{t.body}</div> : null}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export function useToasts() {
  return useContext(ToastCtx);
}

// ------------------------------------------------------------------ modal
export function Modal({ title, onClose, children, testId }: { title: string; onClose: () => void; children: ReactNode; testId?: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    boxRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} data-testid={testId}
        ref={boxRef} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close dialog">✕</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function ConfirmDialog({ title, body, confirmLabel, danger, onConfirm, onCancel }: {
  title: string; body: ReactNode; confirmLabel: string; danger?: boolean;
  onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <Modal title={title} onClose={onCancel} testId="confirm-dialog">
      <div className="modal-body-text">{body}</div>
      <div className="modal-actions">
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
        <button type="button" className={danger ? 'btn btn-danger' : 'btn btn-primary'} onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ table
export interface Column<T> {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number;
  width?: string;
}

export function DataTable<T extends { [k: string]: unknown }>({
  rows, columns, pageSize = 8, testId, emptyText = 'No records.', rowKey,
}: {
  rows: T[]; columns: Array<Column<T>>; pageSize?: number; testId?: string;
  emptyText?: string; rowKey: (row: T) => string;
}) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? rows.filter((r) => columns.some((c) => {
          const v = c.sortValue ? c.sortValue(r) : null;
          return v !== null && String(v).toLowerCase().includes(q);
        }))
      : rows;
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.sortValue) return base;
    return [...base].sort((a, b) => {
      const va = col.sortValue!(a); const vb = col.sortValue!(b);
      return (va < vb ? -1 : va > vb ? 1 : 0) * sortDir;
    });
  }, [rows, columns, query, sortKey, sortDir]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pages - 1);
  const pageRows = filtered.slice(safePage * pageSize, safePage * pageSize + pageSize);

  return (
    <div data-testid={testId}>
      <div className="table-tools">
        <input className="input input-sm" type="search" placeholder="Filter…" value={query}
          onChange={(e) => { setQuery(e.target.value); setPage(0); }} aria-label="Filter table" />
        <span className="muted">{filtered.length} records</span>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} style={c.width ? { width: c.width } : undefined}>
                  {c.sortValue ? (
                    <button type="button" className="th-sort" onClick={() => {
                      if (sortKey === c.key) setSortDir((d) => (d === 1 ? -1 : 1));
                      else { setSortKey(c.key); setSortDir(1); }
                    }}>
                      {c.label}{sortKey === c.key ? (sortDir === 1 ? ' ↑' : ' ↓') : ''}
                    </button>
                  ) : c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r) => (
              <tr key={rowKey(r)}>{columns.map((c) => <td key={c.key}>{c.render(r)}</td>)}</tr>
            ))}
            {pageRows.length === 0 && (
              <tr><td colSpan={columns.length}><div className="empty-state">{emptyText}</div></td></tr>
            )}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="table-pager">
          <button type="button" className="btn btn-sm" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>← Prev</button>
          <span className="muted">Page {safePage + 1} of {pages}</span>
          <button type="button" className="btn btn-sm" disabled={safePage >= pages - 1} onClick={() => setPage(safePage + 1)}>Next →</button>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ misc
export function EmptyState({ title, body }: { title: string; body?: string }) {
  return <div className="empty-state"><strong>{title}</strong>{body ? <div>{body}</div> : null}</div>;
}

export function SkeletonRows({ n = 4 }: { n?: number }) {
  return <div aria-busy="true">{Array.from({ length: n }, (_, i) => <div key={i} className="skeleton" />)}</div>;
}

export function SectionTitle({ title, sub, actions }: { title: string; sub?: string; actions?: ReactNode }) {
  return (
    <div className="section-head">
      <div>
        <h2>{title}</h2>
        {sub ? <p className="muted">{sub}</p> : null}
      </div>
      {actions ? <div className="row">{actions}</div> : null}
    </div>
  );
}

/** Tiny inline-SVG sparkline (no chart library). */
export function Sparkline({ points, width = 120, height = 32 }: { points: number[]; width?: number; height?: number }) {
  if (points.length < 2) return null;
  const max = Math.max(...points); const min = Math.min(...points);
  const range = max - min || 1;
  const step = width / (points.length - 1);
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(height - 3 - ((p - min) / range) * (height - 6)).toFixed(1)}`).join(' ');
  return (
    <svg width={width} height={height} className="sparkline" aria-hidden="true">
      <path d={d} fill="none" strokeWidth="2" />
    </svg>
  );
}

export function fmtNum(n: number): string {
  return n.toLocaleString('en-US');
}
export function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
