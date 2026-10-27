import { useEffect, useRef } from 'react';

export function usePolling(fn: () => void | Promise<void>, ms: number, deps: unknown[] = []) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const run = () => { void ref.current(); };
    const start = () => { if (!timer) timer = setInterval(run, ms); };
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
    const onVis = () => {
      if (document.visibilityState === 'visible') { run(); start(); } else { stop(); }
    };
    if (document.visibilityState === 'visible') { run(); start(); }
    document.addEventListener('visibilitychange', onVis);
    return () => { stop(); document.removeEventListener('visibilitychange', onVis); };
  }, [ms, ...deps]);
}

const cache = new Map<string, { at: number; p: Promise<unknown> }>();

export function sharedFetchJson(url: string, headers: Record<string, string>, ttlMs = 10000, force = false): Promise<unknown> {
  const key = url + '|' + (headers['X-Admin-Token'] || headers['X-Client-Token'] || '');
  const hit = cache.get(key);
  if (!force && hit && Date.now() - hit.at < ttlMs) return hit.p;
  const p = fetch(url, { headers }).then(r => r.json()).catch(() => { cache.delete(key); return null; });
  cache.set(key, { at: Date.now(), p });
  return p;
}
