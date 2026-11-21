import { useCallback, useEffect, useRef, useState } from 'react';
import { errMsg } from './util.ts';

/** Loads data once and on demand. Errors become plain messages (staff 401 is handled by the api client). */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const run = useCallback(() => {
    const my = ++seq.current;
    setLoading(true);
    fn().then(
      (d) => { if (my === seq.current) { setData(d); setError(null); setLoading(false); } },
      (e) => { if (my === seq.current) { setError(errMsg(e)); setLoading(false); } },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { run(); }, [run]);
  return { data, setData, error, loading, reload: run };
}
