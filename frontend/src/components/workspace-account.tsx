'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { authConfig, authPost, type AuthSession } from '@/lib/auth-client';
import styles from './workspace-account.module.css';

export default function WorkspaceAccount() {
  const [session, setSession] = useState<AuthSession | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const details = useRef<HTMLDetailsElement>(null), panelId = useId();
  useEffect(() => {
    let active = true;
    const check = () => { void fetch('/api/auth/session', { cache: 'no-store' }).then(r => { if (!r.ok) throw new Error(); return r.json(); }).then((value: AuthSession) => {
      if (!active) return; setSession(value);
      if (value.enabled && !value.authenticated) window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
    }).catch(() => undefined); };
    check(); const timer = window.setInterval(check, 60000); window.addEventListener('scout:authentication-required', check);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('scout:authentication-required', check); };
  }, []);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && details.current?.open) { details.current.open = false; details.current.querySelector('summary')?.focus(); }
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, []);
  if (!session?.enabled || !session.authenticated) return null;
  async function logout() {
    setBusy(true); setError('');
    try { const config = await authConfig(); await authPost('logout', {}, config.csrf_token); window.google?.accounts.id.disableAutoSelect(); window.location.assign('/'); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not sign out.'); setBusy(false); }
  }
  return <details ref={details} className={styles.control} data-workspace-account="">
    <summary className={styles.trigger} aria-label="Account and sign out" aria-description={`Signed in as ${session.user?.username}`} aria-controls={panelId} title={`Account: ${session.user?.username}`}>
      <span className={styles.avatar} aria-hidden="true">{session.user?.username.slice(0, 1).toUpperCase()}</span>
      <span className={styles.username}>{session.user?.username}</span>
      <svg className={styles.chevron} viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
    </summary>
    <div className={styles.panel} id={panelId}>
      <strong>{session.user?.username}</strong><span>{session.user?.email}</span>
      <Link href="/account">Account and sign-in options</Link>
      <Link href="/">Research Scout home</Link>
      <button type="button" disabled={busy} onClick={() => void logout()}>{busy ? 'Signing out…' : 'Sign out'}</button>
      {error && <p role="alert">{error}</p>}
    </div>
  </details>;
}
