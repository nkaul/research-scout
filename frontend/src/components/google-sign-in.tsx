'use client';

import { useEffect, useRef, useState } from 'react';

type GoogleIdentity = {
  initialize: (config: { client_id: string; nonce: string; callback: (response: { credential: string }) => void; auto_select: boolean; ux_mode: 'popup' }) => void;
  renderButton: (element: HTMLElement, config: { theme: 'outline'; size: 'large'; shape: 'pill'; text: 'continue_with'; width: number }) => void;
  disableAutoSelect: () => void;
};
declare global { interface Window { google?: { accounts: { id: GoogleIdentity } } } }

let scriptPromise: Promise<void> | null = null;
function loadGoogle(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client'; script.async = true;
    script.id = 'research-scout-google-sign-in';
    script.onload = () => window.google?.accounts?.id ? resolve() : reject(new Error('Google sign-in could not load.'));
    script.onerror = () => { script.remove(); scriptPromise = null; reject(new Error('Google sign-in could not load. You can use your username and password.')); };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export default function GoogleSignIn({ clientId, nonce, disabled, onCredential }: {
  clientId: string | null; nonce: string; disabled?: boolean; onCredential: (credential: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null), callback = useRef(onCredential);
  const [error, setError] = useState('');
  callback.current = onCredential;
  useEffect(() => {
    if (!clientId) return;
    let active = true;
    void loadGoogle().then(() => {
      if (!active || !host.current || !window.google) return;
      host.current.replaceChildren();
      window.google.accounts.id.initialize({ client_id: clientId, nonce, auto_select: false, ux_mode: 'popup', callback: response => { if (active) callback.current(response.credential); } });
      window.google.accounts.id.renderButton(host.current, { theme: 'outline', size: 'large', shape: 'pill', text: 'continue_with', width: Math.max(200, Math.min(360, host.current.clientWidth)) });
    }).catch(failure => { if (active) setError(failure.message); });
    return () => { active = false; };
  }, [clientId, nonce]);
  if (!clientId) return <p>Google sign-in is being set up. Username and password sign-in is available.</p>;
  return <div aria-busy={disabled} style={{ opacity: disabled ? .65 : 1, pointerEvents: disabled ? 'none' : undefined }}>
    <div ref={host} style={{ minHeight: 44, width: '100%' }} aria-label="Continue with Google" />
    {error && <p role="alert">{error}</p>}
  </div>;
}
