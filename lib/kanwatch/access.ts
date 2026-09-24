import { auth } from '@/lib/auth';
import { ensureSchema } from '@/lib/db/ensure-schema';

/**
 * The signed-in user, if Kanwatch is open to them.
 *
 * Admin-only while it is being tried out: browsing data is the most revealing thing
 * Kanthink would hold, so it opens to others only once it has earned that.
 */
export async function kanwatchUser(): Promise<string | null> {
  const session = await auth();
  if (!session?.user?.id || !session.user.isAdmin) return null;
  await ensureSchema();
  return session.user.id;
}
