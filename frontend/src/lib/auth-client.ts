export type AuthUser = { id: string; username: string; email: string; google_linked: boolean };
export type AuthSession = { enabled: boolean; authenticated: boolean; user: AuthUser | null };
export type AuthConfig = {
  enabled: boolean;
  setup_required: boolean;
  google_client_id: string | null;
  csrf_token: string;
  google_nonce: string;
  reset_delivery?: 'local_outbox' | 'smtp';
};

let mutationCsrf: Promise<string> | null = null;
export function invalidateAuthCsrf() { mutationCsrf = null; }
export function authCsrfToken(): Promise<string> {
  mutationCsrf ??= authConfig().then(config => config.csrf_token).catch(error => { mutationCsrf = null; throw error; });
  return mutationCsrf;
}

export function safeAuthNext(value?: string | null): string {
  // A valid UTF-8 question can expand considerably when URL-encoded twice.
  if (!value || value.length > 16384 || /[\\\u0000-\u0020]/.test(value)) return '/app';
  try {
    const url = new URL(value, 'http://scout.local');
    if (url.origin !== 'http://scout.local' || !['/app', '/admin', '/account'].includes(url.pathname)) return '/app';
    return url.pathname + url.search;
  } catch { return '/app'; }
}

export async function authConfig(signal?: AbortSignal): Promise<AuthConfig> {
  const response = await fetch('/api/auth/config', { cache: 'no-store', credentials: 'same-origin', signal });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body || typeof body.enabled !== 'boolean') throw new Error('The sign-in service is unavailable. Please try again.');
  return body;
}

export async function authPost<T>(path: string, body: unknown, csrf: string): Promise<T> {
  const response = await fetch(`/api/auth/${path}`, {
    method: 'POST', credentials: 'same-origin', cache: 'no-store',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof result?.detail === 'string' ? result.detail : 'This request could not be completed. Please try again.');
  // Account linking rotates the cookie without a full-page navigation.
  if (typeof result?.csrf_token === 'string') mutationCsrf = Promise.resolve(result.csrf_token);
  return result as T;
}
