'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type LoadTiming = { token: number; key: string; label: string; startedAt: number; elapsedMs: number | null; failed?: boolean };

export function formatLoadTime(ms: number) {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  if (ms < 1) return '<1 ms';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(2)} s`;
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}

/** Browser-observed duration; tickets fence late completions from another selection. */
export function useLoadTiming() {
  const sequence = useRef(0), mounted = useRef(true);
  const [timing, setTiming] = useState<LoadTiming | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; sequence.current++; }; }, []);
  const start = useCallback((key: string, label: string) => {
    const ticket: LoadTiming = { token: ++sequence.current, key, label, startedAt: performance.now(), elapsedMs: null };
    setTiming(ticket); return ticket;
  }, []);
  const finish = useCallback((ticket: LoadTiming, failed = false) => {
    if (mounted.current && ticket.token === sequence.current) setTiming(current => current?.token === ticket.token && current.elapsedMs === null ? { ...ticket, elapsedMs: Math.max(0, performance.now() - ticket.startedAt), failed } : current);
  }, []);
  const clear = useCallback(() => { sequence.current++; setTiming(null); }, []);
  return { timing, start, finish, clear };
}
