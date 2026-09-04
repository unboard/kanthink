import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { playgroundApps } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { requirePermission, PermissionError } from '@/lib/api/permissions';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ appId: string }>;
}

/**
 * Lightweight GET used by the app drawer to poll for generation completion when
 * the original /api/playground/generate fetch dies (mobile screen-off, tab
 * suspension, network blip). Returns enough of the app to reconcile local state
 * with whatever the server-side Gemini call produced.
 *
 * The generate route's DB write happens regardless of whether the client is
 * still connected — Vercel functions complete on their own — so by the time
 * the user comes back to their phone the work is usually done.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { appId } = await params;

  // Two-step on purpose. This is polled every few seconds for the length of a
  // build, and the app row carries the whole generated source — shipping that on
  // every tick moved tens of kilobytes per poll to tell the client "not yet".
  // Read the counter first; fetch the payload only on the tick that changed.
  const since = Number(req.nextUrl.searchParams.get('since') ?? '-1');
  const head = await db.query.playgroundApps.findFirst({
    where: eq(playgroundApps.id, appId),
    columns: { id: true, channelId: true, generationCount: true, updatedAt: true },
  });
  if (!head) {
    return NextResponse.json({ error: 'App not found' }, { status: 404 });
  }

  // An app row carries its whole generated source, so reading one needs the same
  // access as viewing the channel it lives in — being signed in is not enough.
  try {
    await requirePermission(head.channelId, session.user.id, 'view');
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }

  if (Number.isFinite(since) && head.generationCount <= since) {
    return NextResponse.json({ generationCount: head.generationCount, pending: true });
  }

  const app = await db.query.playgroundApps.findFirst({ where: eq(playgroundApps.id, appId) });
  return NextResponse.json({ app, generationCount: head.generationCount });
}
