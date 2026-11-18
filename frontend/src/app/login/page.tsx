import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import AuthPanel from '@/components/auth-panel';
import { readAuthSession } from '@/lib/auth-server';
import { safeAuthNext } from '@/lib/auth-client';
export const metadata: Metadata = { title: 'Sign in · Research Scout', referrer: 'strict-origin' };
export const dynamic = 'force-dynamic';
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeAuthNext((await searchParams).next);
  const session = await readAuthSession();
  if (session?.enabled && session.authenticated) redirect(next);
  return <AuthPanel next={next} />;
}
