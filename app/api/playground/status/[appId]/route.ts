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
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { appId } = await params;
  const app = await db.query.playgroundApps.findFirst({ where: eq(playgroundApps.id, appId) });
  if (!app) {
    return NextResponse.json({ error: 'App not found' }, { status: 404 });
  }

  // An app row carries its whole generated source, so reading one needs the same
  // access as viewing the channel it lives in — being signed in is not enough.
  try {
    await requirePermission(app.channelId, session.user.id, 'view');
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }

  return NextResponse.json({ app });
}
