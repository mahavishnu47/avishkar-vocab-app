/** First-run checklist: done items are ticked and struck through, the first open item is "Next". */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export interface ChecklistItem {
  done: boolean;
  label: string;
  action?: { label: string; to?: string; onClick?: () => void };
  extra?: ReactNode;
}

export function Checklist({ items }: { items: ChecklistItem[] }) {
  const nextIdx = items.findIndex((i) => !i.done);
  return (
    <ol className="s-checklist">
      {items.map((it, i) => (
        <li key={it.label} className={`${it.done ? 'done' : ''} ${i === nextIdx ? 'next' : ''}`}>
          <div className="row">
            <span aria-hidden="true">{it.done ? '✅' : '☐'}</span>
            <span className="s-ck-label">{it.label}</span>
            {i === nextIdx && <span className="t-badge">Next</span>}
          </div>
          {!it.done && it.action && (it.action.to
            ? <Link className="btn btn-primary" to={it.action.to}>{it.action.label}</Link>
            : <button type="button" className="btn btn-primary" onClick={it.action.onClick}>{it.action.label}</button>)}
          {!it.done && it.extra}
        </li>
      ))}
    </ol>
  );
}
