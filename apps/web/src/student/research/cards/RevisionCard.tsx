import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { RecallTodayRes, StudentHomeRes } from '@shabd/core';
import { vocabApi } from '../../../shared/research/vocab-api.ts';

/** Home card: "Yesterday's words challenge" (only when there is something to revise) and "My Word Bank". */
export function RevisionCard(_props: { home: StudentHomeRes }) {
  const nav = useNavigate();
  const [rec, setRec] = useState<RecallTodayRes | null>(null);
  useEffect(() => {
    let live = true;
    vocabApi.recallToday().then((r) => { if (live) setRec(r); }, () => { /* offline: just show the bank */ });
    return () => { live = false; };
  }, []);
  const has = !!rec && rec.items.length > 0;
  return (
    <section className="card stack" aria-label="Revision" style={{ textAlign: 'center' }}>
      {has && (
        <button className="btn btn-write btn-block btn-tall" onClick={() => nav('/recall')}>
          {rec!.alreadyDone ? '🔁 Yesterday’s words again' : '🧠 Yesterday’s words challenge'}
        </button>
      )}
      <button className="btn btn-block btn-tall" onClick={() => nav('/bank')}>📚 My Word Bank</button>
    </section>
  );
}
