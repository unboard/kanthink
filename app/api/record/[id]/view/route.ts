import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { recordings, recordingViews } from '@/lib/db/schema';
import { ensureSchema } from '@/lib/db/ensure-schema';

export const runtime = 'nodejs';

/**
 * Record one view of a shared recording.
 *
 * Called from the client on the watch page rather than from the server render,
 * deliberately: link unfurlers (Slack, iMessage, Twitter) and prefetchers fetch
 * the HTML but never run scripts, so counting server-side would report views
 * that nobody watched. This undercounts anyone with JS off, which is the right
 * side to err on for a number the owner is going to quote to someone.
 *
 * Public by design — the whole point is counting people who aren't signed in.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await ensureSchema();
  const { id } = await params;

  const [rec] = await db
    .select({ ownerId: recordings.ownerId })
    .from(recordings)
    .where(eq(recordings.id, id))
    .limit(1);
  if (!rec) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const session = await auth();

  // Host only — see the referrerHost column comment.
  let referrerHost: string | null = null;
  const referrer = request.headers.get('referer');
  if (referrer) {
    try {
      referrerHost = new URL(referrer).host || null;
    } catch {
      referrerHost = null;
    }
  }

  await db.insert(recordingViews).values({
    recordingId: id,
    isOwner: session?.user?.id === rec.ownerId,
    referrerHost,
  });

  return NextResponse.json({ ok: true });
}
