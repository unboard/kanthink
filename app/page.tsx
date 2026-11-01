import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import Home from './HomeClient';

/**
 * The admin lives in Kan City, so home sends them there before anything renders
 * (no flash of the old home). /?home keeps this page, for the city's "The board" link.
 */
export default async function HomePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  if (!('home' in q)) {
    const session = await auth().catch(() => null);
    if (session?.user?.isAdmin) redirect('/prototypes/kan/city');
  }
  return <Home />;
}
