'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ApiError } from '@/lib/api';
import { refreshEconomics, resetEconomics, useEconomics } from '@/lib/economics';
import Icon from './icon';
import Tooltip from './tooltip';
import styles from './credit-meter.module.css';

export default function CreditMeter({ className = '' }: { className?: string; compact?: boolean }) {
  const { budget, error, loading, refreshing, resetting } = useEconomics();
  const [message, setMessage] = useState('');
  const [resetError, setResetError] = useState('');
  const [unconfirmedReset, setUnconfirmedReset] = useState(false);
  const [resetPending, setResetPending] = useState(false);
  const disclosure = useRef<HTMLDetailsElement>(null);
  const retry = useRef<{ window: string; key: string } | null>(null);

  useEffect(() => {
    const close = (event: PointerEvent) => { if (!disclosure.current?.contains(event.target as Node) && disclosure.current) disclosure.current.open = false; };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && disclosure.current?.open) {
        disclosure.current.open = false;
        disclosure.current.querySelector('summary')?.focus();
      }
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape); };
  }, []);

  async function reset() {
    if (!budget || resetting || resetPending) return;
    setMessage(''); setResetError('');
    setResetPending(true);
    // Preserve both original fields after an ambiguous failure, even if the canonical
    // GET observes that the first POST already committed a new budget window.
    if (!retry.current) retry.current = { window: budget.window_id, key: crypto.randomUUID() };
    const attempt = retry.current;
    try {
      await resetEconomics(attempt.window, attempt.key);
      retry.current = null;
      setUnconfirmedReset(false);
      setMessage('Daily credits reset. Previous usage remains in Admin history.');
    } catch (failure) {
      const stale = failure instanceof ApiError && failure.status === 409;
      if (stale) retry.current = null;
      setUnconfirmedReset(!stale);
      setResetError(failure instanceof Error ? failure.message : 'The reset could not be confirmed. Refresh the balance before trying again.');
    } finally {
      setResetPending(false);
    }
  }

  const used = budget ? Math.max(0, Math.min(100, budget.used / Math.max(1, budget.daily_budget) * 100)) : 0;
  const reserved = budget ? Math.max(0, Math.min(100 - used, budget.reserved / Math.max(1, budget.daily_budget) * 100)) : 0;
  const resetTime = budget ? new Date(budget.reset_at).toLocaleString(undefined, { timeZone: budget.timezone, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }) : '';
  const label = budget ? `${budget.used} of ${budget.daily_budget} daily credits used; ${budget.remaining} available; ${budget.reserved} reserved${error ? '; balance could not be refreshed' : ''}` : loading ? 'Loading daily credits' : 'Daily credits unavailable';

  return <details ref={disclosure} className={`${styles.meter} ${className}`} data-stale={Boolean(error)}>
    <Tooltip content={label}><summary className={styles.summary} aria-label={label}>
      <span className={styles.label}>Used {error && <Icon name="alert" />}</span>
      <strong>{budget ? <>{budget.used}<span>/{budget.daily_budget}</span></> : loading ? '…' : '—'}</strong>
      <span className={styles.track} role={budget ? 'progressbar' : undefined} aria-label="Daily credits consumed or reserved" aria-valuemin={budget ? 0 : undefined} aria-valuemax={budget?.daily_budget} aria-valuenow={budget ? budget.used + budget.reserved : undefined} aria-valuetext={budget ? `${budget.used} used, ${budget.reserved} reserved, ${budget.remaining} available` : undefined}>
        {budget && <><i className={styles.used} style={{ width: `${used}%` }} /><i className={styles.reserved} style={{ width: `${reserved}%` }} /></>}
      </span>
      <Icon name="chevron" className={styles.chevron} />
    </summary></Tooltip>
    <div className={styles.popover}>
      <div className={styles.heading}><strong>Daily model credits</strong><span>Local user</span></div>
      {budget ? <>
        <dl className={styles.balance}>
          <div><dt>Used</dt><dd>{budget.used}</dd></div>
          <div><dt>Reserved</dt><dd>{budget.reserved}</dd></div>
          <div><dt>Available</dt><dd>{budget.remaining}</dd></div>
        </dl>
        <p>1 credit per hosted model call. Source searches and local ranking use no credits. Reservations cover model calls that may still run.</p>
        <p className={styles.resetTime}><Icon name="clock" /> Resets {resetTime}</p>
        <div className={styles.actions}>
          <Tooltip content={unconfirmedReset ? 'Retry the original reset safely using the same request key and original budget window.' : 'Start a fresh daily allowance. Previous calls and costs stay in Admin history.'}><button type="button" onClick={() => void reset()} disabled={resetPending || resetting || Boolean(error)}><Icon name={resetPending || resetting ? 'spinner' : 'refresh'} />{resetPending || resetting ? 'Resetting…' : unconfirmedReset ? 'Retry reset' : 'Reset today'}</button></Tooltip>
          <Link href="/admin"><Icon name="database" />Admin</Link>
        </div>
      </> : <p>{loading ? 'Loading your daily model allowance…' : 'The allowance could not be loaded. Confirm the backend is running, then retry.'}</p>}
      {error && <p className={styles.error} role="status">{budget ? 'Showing the last confirmed balance. ' : ''}{error}</p>}
      {resetError && <p className={styles.error} role="alert">{resetError}</p>}
      {unconfirmedReset && <p className={styles.error}>The reset response was not confirmed. Retry reset reuses the original request, even if the balance has changed, so it cannot create a second reset.</p>}
      {message && <p className={styles.success} role="status">{message}</p>}
      {(error || !budget && !loading) && <button className={styles.retry} type="button" onClick={() => void refreshEconomics()} disabled={refreshing}>{refreshing ? 'Refreshing…' : 'Refresh balance'}</button>}
    </div>
  </details>;
}
