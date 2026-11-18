import type { Metadata } from 'next';
import AuthPanel from '@/components/auth-panel';
export const metadata: Metadata = { title: 'Choose a password · Research Scout', referrer: 'no-referrer' };
export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const token = (await searchParams).token || '';
  return <AuthPanel mode="reset" token={token} />;
}
