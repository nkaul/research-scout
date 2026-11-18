import ResearchWorkspace from '@/components/research-workspace';
import AuthUnavailable from '@/components/auth-unavailable';
import { authQueryString, guardedSession } from '@/lib/auth-server';

export const dynamic = 'force-dynamic';
export default async function WorkspacePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = authQueryString(await searchParams);
  const session = await guardedSession('/app' + query);
  if (!session) return <AuthUnavailable />;
  return <ResearchWorkspace />;
}
