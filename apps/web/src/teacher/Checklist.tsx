import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';

export interface ChecklistItem {
  done: boolean;
  label: ReactNode;
  action?: { label: string; to?: string; onClick?: () => void };
}

/** "What to do next": done items are ticked and struck through; the first open item is highlighted as Next. */
export function Checklist({ items, title }: { items: ChecklistItem[]; title?: string }) {
  const nextIdx = items.findIndex((i) => !i.done);
  return (
    <section className="card stack" aria-label={title ?? 'What to do next'}>
      {title && <h2 className="t-h2">{title}</h2>}
      <ol className="t-check">
        {items.map((it, i) => {
          const isNext = i === nextIdx;
          return (
            <li key={i} className={`t-check-item ${it.done ? 'done' : ''} ${isNext ? 'next' : ''}`}>
              <span className="t-check-mark" aria-hidden="true">{it.done ? '✅' : '⬜'}</span>
              <span className="t-check-label">
                {it.label}
                <span className="sr-only">{it.done ? ' (done)' : isNext ? ' (next)' : ' (to do)'}</span>
              </span>
              {isNext && <span className="t-badge">Next</span>}
              {!it.done && it.action && (it.action.to
                ? <Link className={`btn ${isNext ? 'btn-primary' : ''}`} to={it.action.to}>{it.action.label}</Link>
                : <button className={`btn ${isNext ? 'btn-primary' : ''}`} onClick={it.action.onClick}>{it.action.label}</button>)}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
