import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { AuthSession } from './auth-client';
import { safeAuthNext } from './auth-client';

export async function readAuthSession(): Promise<AuthSession | null> {
  const cookieStore = await cookies();
  const session = cookieStore.get('scout_session');
  try {
    const base = (process.env.SCOUT_API_URL || 'http://127.0.0.1:8100').replace(/\/$/, '');
    const response = await fetch(`${base}/api/auth/session`, {
      cache: 'no-store', headers: session ? { Cookie: `scout_session=${encodeURIComponent(session.value)}` } : {},
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (typeof data.enabled !== 'boolean' || typeof data.authenticated !== 'boolean') return null;
    return data as AuthSession;
  } catch { return null; }
}

export async function guardedSession(next = '/app'): Promise<AuthSession | null> {
  const session = await readAuthSession();
  if (session?.enabled && !session.authenticated) redirect(`/login?next=${encodeURIComponent(safeAuthNext(next))}`);
  return session;
}

export function authQueryString(params: Record<string, string | string[] | undefined>): string {
  const result = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) value.forEach(item => result.append(key, item));
    else if (value !== undefined) result.set(key, value);
  }
  const query = result.toString();
  return query ? `?${query}` : '';
}
