import { redirect } from 'next/navigation';
import LandingPage from '@/components/landing-page';
import { authQueryString, readAuthSession } from '@/lib/auth-server';

export const dynamic = 'force-dynamic';
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  // Existing saved-research bookmarks retain their query and selection.
  if (['search', 'conversation', 'run', 'q'].some(key => params[key])) redirect('/app' + authQueryString(params));
  const session = await readAuthSession();
  return <LandingPage authenticated={!!session?.authenticated} />;
}
