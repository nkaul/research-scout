'use client';

import { useEffect, useState } from 'react';
import { formatLoadTime, type LoadTiming } from '@/lib/load-timing';
import styles from './load-time.module.css';

export default function LoadTime({ timing, description }: { timing?: LoadTiming | null; description?: string }) {
  const [now, setNow] = useState(0);
  const active = !!timing && timing.elapsedMs === null;
  useEffect(() => {
    if (!active) return;
    setNow(performance.now());
    const tick = setInterval(() => setNow(performance.now()), 250);
    return () => clearInterval(tick);
  }, [active, timing?.token]);
  if (!timing) return null;
  const duration = timing.elapsedMs ?? Math.max(0, now - timing.startedAt);
  return <span className={styles.time} aria-live="off" data-testid="load-time" data-load-kind={timing.label} data-loading={active} data-duration-ms={Math.round(duration)} title={description || 'Elapsed time for this action in this browser; includes waiting for the response.'}>{timing.label} · {formatLoadTime(duration)}{active ? ' elapsed' : timing.failed ? ' · failed' : ''}</span>;
}

/** Saved server timestamps describe retrieval, independently of opening saved data. */
export function SearchDuration({ createdAt, completedAt, running }: { createdAt?: string; completedAt?: string; running: boolean }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const tick = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(tick);
  }, [running, createdAt]);
  const start = Date.parse(createdAt || ''), end = running ? now : Date.parse(completedAt || '');
  if (!Number.isFinite(start) || end === null || !Number.isFinite(end)) return null;
  return <span className={styles.time} aria-live="off" data-testid="search-duration" title="Original search duration from its saved start and completion timestamps.">Search · {formatLoadTime(Math.max(0, end - start))}{running ? ' elapsed' : ''}</span>;
}
