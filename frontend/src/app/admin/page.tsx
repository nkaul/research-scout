import type { Metadata } from 'next';
import EconomicsAdmin from '@/components/economics-admin';
import AuthUnavailable from '@/components/auth-unavailable';
import { guardedSession } from '@/lib/auth-server';

export const metadata: Metadata = {
  title: 'Model economics · Research Scout Admin',
  description: 'Review daily model credits, invocation usage and local accounting history.',
};

export const dynamic = 'force-dynamic';
export default async function AdminPage() {
  const session = await guardedSession('/admin');
  if (!session) return <AuthUnavailable />;
  return <EconomicsAdmin />;
}
