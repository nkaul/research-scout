import type { Metadata } from 'next';
import AuthPanel from '@/components/auth-panel';
import AuthUnavailable from '@/components/auth-unavailable';
import { guardedSession } from '@/lib/auth-server';
export const metadata: Metadata = { title: 'Your account · Research Scout', referrer: 'strict-origin' };
export const dynamic = 'force-dynamic';
export default async function AccountPage() {
  const session = await guardedSession('/account');
  if (!session) return <AuthUnavailable />;
  return <AuthPanel mode="account" user={session.user} />;
}
