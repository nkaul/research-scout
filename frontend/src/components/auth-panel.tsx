'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { authConfig, authPost, safeAuthNext, type AuthConfig, type AuthUser } from '@/lib/auth-client';
import GoogleSignIn from './google-sign-in';
import css from './auth-panel.module.css';

type Mode = 'login' | 'forgot' | 'reset' | 'account';
export default function AuthPanel({ mode = 'login', next = '/app', token = '', user }: { mode?: Mode; next?: string; token?: string; user?: AuthUser | null }) {
  const [config, setConfig] = useState<AuthConfig | null>(null), [load, setLoad] = useState(0);
  const [identifier, setIdentifier] = useState(''), [username, setUsername] = useState(''), [email, setEmail] = useState('');
  const [password, setPassword] = useState(''), [confirm, setConfirm] = useState(''), [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [complete, setComplete] = useState(false);
  const [identity, setIdentity] = useState(user || null);
  const destination = safeAuthNext(next);
  const setup = mode === 'login' && !!config?.setup_required;
  useEffect(() => {
    const controller = new AbortController();
    void authConfig(controller.signal).then(setConfig).catch(failure => { if (!controller.signal.aborted) setError(failure.message); });
    return () => controller.abort();
  }, [load]);
  useEffect(() => { if (mode === 'reset' && token) window.history.replaceState(null, '', '/reset-password'); }, [mode, token]);
  const refresh = () => { setError(''); setLoad(value => value + 1); };
  const heading = mode === 'forgot' ? 'Forgot your password?' : mode === 'reset' ? complete ? 'Password updated' : 'Choose a new password' : mode === 'account' ? 'Your account' : setup ? 'Create your workspace account' : 'Welcome back';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!config || busy) return;
    setError(''); setNotice('');
    if ((setup || mode === 'reset') && password !== confirm) { setError('The passwords do not match.'); return; }
    setBusy(true);
    try {
      if (mode === 'forgot') {
        await authPost('forgot-password', { identifier: identifier.trim() }, config.csrf_token); setComplete(true);
        setNotice(config.reset_delivery === 'smtp' ? 'If this account exists, check its email for password-reset instructions.' : 'If this account exists, reset instructions are available in the private local outbox on this computer.');
      } else if (mode === 'reset') {
        await authPost('reset-password', { token, password }, config.csrf_token); setPassword(''); setConfirm(''); setComplete(true);
        setNotice('Sign in with your new password to continue.');
      } else {
        await authPost(setup ? 'setup' : 'login', setup ? { username: username.trim(), email: email.trim(), password } : { identifier: identifier.trim(), password }, config.csrf_token);
        window.location.assign(destination);
      }
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Please try again.'); refreshAfterFailure(); }
    finally { setBusy(false); }
  }
  function refreshAfterFailure() { void authConfig().then(setConfig).catch(() => undefined); }
  async function google(credential: string) {
    if (!config || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await authPost<{ user: AuthUser }>('google', { credential, nonce: config.google_nonce }, config.csrf_token);
      if (mode === 'account') { setIdentity(result.user); setNotice('Google is connected. You can use Continue with Google next time.'); refreshAfterFailure(); }
      else window.location.assign(destination);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Google sign-in could not be completed.'); refreshAfterFailure(); }
    finally { setBusy(false); }
  }
  const passwordFields = <>
    <label className={css.field}>Password<span className={css.passwordRow}><input name="password" aria-label="Password" type={show ? 'text' : 'password'} autoComplete={setup || mode === 'reset' ? 'new-password' : 'current-password'} minLength={setup || mode === 'reset' ? 12 : 1} maxLength={256} required value={password} onChange={e => setPassword(e.target.value)} /><button className={css.secondary} type="button" aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show} onClick={() => setShow(value => !value)}>{show ? 'Hide' : 'Show'}</button></span></label>
    {(setup || mode === 'reset') && <><p className={css.muted}>Use at least 12 characters.</p><label className={css.field}>Confirm password<input name="confirm_password" type={show ? 'text' : 'password'} autoComplete="new-password" required minLength={12} maxLength={256} value={confirm} onChange={e => setConfirm(e.target.value)} /></label></>}
  </>;

  return <div className={css.shell}>
    <header className={css.header}><Link href="/" className={css.brand}><span className={css.mark}><svg viewBox="0 0 36 36" fill="none" aria-hidden="true"><circle cx="18" cy="18" r="12" stroke="currentColor"/><path d="m23 10-4 12-6 4 4-12 6-4Z" fill="currentColor"/><path d="M18 1v7m0 20v7M1 18h7m20 0h7" stroke="currentColor"/></svg></span>Research Scout</Link><Link href="/" className={css.homeLink}>Back to home</Link></header>
    <main className={css.grid}>
      <section className={css.intro}><p className={css.kicker}>A little curiosity goes a long way</p><h1>Keep your curiosity.<br /><span>Follow the evidence.</span></h1><p>Your research workspace brings papers, videos, datasets and repositories together, with the source context close at hand.</p><ul className={css.featureList}><li>Return to your research and saved projects.</li><li>Read source context alongside your results.</li><li>Keep control of AI refinement and usage.</li></ul></section>
      <section className={css.card} aria-labelledby="auth-title"><div className={css.cardHeading}><h2 id="auth-title">{heading}</h2><p>{mode === 'account' ? 'Manage sign-in for this local workspace.' : setup ? 'Set up the owner of this local Research Scout workspace.' : mode === 'login' ? 'Sign in to continue your research.' : mode === 'forgot' ? 'Enter your username or account email.' : 'Choose a password you haven’t used before.'}</p></div>
        {error && <div className={css.error} role="alert">{error}{!config && <button type="button" onClick={refresh}>Try again</button>}</div>}
        {notice && <div className={css.notice} role="status">{notice}</div>}
        {!config && !error && <p className={css.loading} role="status">Preparing secure sign-in…</p>}
        {config && !config.enabled && <div className={css.notice}>Authentication is disabled for this fixture workspace. <Link href="/app">Open the workspace</Link>.</div>}
        {config?.enabled && mode === 'account' && <><dl className={css.accountSummary}><dt>Username</dt><dd>{identity?.username}</dd><dt>Email</dt><dd>{identity?.email}</dd><dt>Google sign-in</dt><dd>{identity?.google_linked ? 'Connected' : 'Not connected'}</dd></dl><div className={css.accountActions}>{!identity?.google_linked && <><h3>Connect Google</h3><p>Link Google while signed in to this account.</p><GoogleSignIn clientId={config.google_client_id} nonce={config.google_nonce} disabled={busy} onCredential={google} /></>}<Link href="/forgot-password">Change or reset your password</Link><Link href="/app" className={css.primary}>Back to research</Link></div></>}
        {config?.enabled && mode !== 'account' && !complete && <form className={css.form} onSubmit={submit} aria-busy={busy}>
          {setup && <><label className={css.field}>Username<input name="username" autoComplete="username" required minLength={3} maxLength={64} pattern="[A-Za-z0-9._-]+" value={username} onChange={e => setUsername(e.target.value)} /></label><label className={css.field}>Email<input name="email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} /></label></>}
          {!setup && mode !== 'reset' && <label className={css.field}>Username or email<input name="identifier" autoComplete="username" required maxLength={254} value={identifier} onChange={e => setIdentifier(e.target.value)} /></label>}
          {mode !== 'forgot' && passwordFields}
          {mode === 'reset' && !token ? <p className={css.error}>This reset link is missing its token. Request a new link below.</p> : <button className={css.primary} type="submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'forgot' ? 'Send reset instructions' : mode === 'reset' ? 'Update password' : setup ? 'Create account and continue' : 'Sign in'}</button>}
        </form>}
        {mode === 'login' && config?.enabled && <><div className={css.links}>{!setup && <Link href="/forgot-password">Forgot password?</Link>}</div><div className={css.divider}>or continue with Google</div><div className={css.googleBox}><GoogleSignIn clientId={config.google_client_id} nonce={config.google_nonce} disabled={busy} onCredential={google} /></div></>}
        {(mode === 'forgot' || mode === 'reset') && <div className={css.links}><Link href="/login">Back to sign in</Link>{mode === 'reset' && <Link href="/forgot-password">Request another reset link</Link>}</div>}
        {mode === 'forgot' && config?.reset_delivery !== 'smtp' && <p className={css.muted}>Local password recovery is enabled. Reset instructions go to the private outbox configured for this computer.</p>}
        <p className={css.footer}>One owner · Your existing local research workspace</p>
      </section>
    </main>
  </div>;
}
