import { NextResponse } from 'next/server';
import { ensureSchema } from '@/lib/db/ensure-schema';
import { afterResponse } from '@/lib/afterResponse';
import { userFromBearer } from '@/lib/kanwatch/token';
import { ingestVisits, type IncomingVisit } from '@/lib/kanwatch/ingest';
import { inheritFocus, judgeCurrent, judgePending } from '@/lib/kanwatch/judge';
import { judgePendingReads } from '@/lib/kanwatch/reads';
import { momentsFor } from '@/lib/kanwatch/nudge';

/**
 * POST /api/kanwatch/ingest — visits from the Kanwatch extension.
 *
 * Authenticated by the extension's own revocable token, not the session cookie, so
 * it works from the extension's background worker and grants nothing else.
 */
export async function POST(request: Request) {
  await ensureSchema();
  // Uploads carry the extension's version; one without it predates the header.
  const userId = await userFromBearer(request.headers.get('authorization'), request.headers.get('x-kanwatch-version'));
  if (!userId) return NextResponse.json({ error: 'Invalid or revoked Kanwatch key' }, { status: 401 });

  let body: { visits?: IncomingVisit[]; tzOffsetMinutes?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Bad JSON' }, { status: 400 });
  }
  if (!Array.isArray(body.visits)) return NextResponse.json({ error: 'Missing visits' }, { status: 400 });

  const tz = Number.isFinite(body.tzOffsetMinutes) ? Math.max(-840, Math.min(840, Math.round(body.tzOffsetMinutes!))) : null;
  const result = await ingestVisits(userId, body.visits, tz);

  // Finished episodes get read in the background, so the day view is ready when opened.
  afterResponse(async () => {
    await Promise.all([judgePending(userId, 5), judgePendingReads(userId, 3)]);
  });

  // Moments have to be about now. Pages seen earlier today take their read at once;
  // anything new in the stretch you're in is read before deciding, not after. A
  // check-in with nothing in it is the extension starting up, not a moment.
  let moments: Awaited<ReturnType<typeof momentsFor>> = [];
  if (result.stored > 0) {
    await inheritFocus(userId, new Date(Date.now() - 24 * 60 * 60 * 1000)).catch(() => 0);
    await Promise.race([judgeCurrent(userId).catch(() => {}), new Promise((r) => setTimeout(r, 6000))]);
    moments = await momentsFor(userId, tz).catch(() => []);
  }
  const moment = moments[0] ?? null;

  // `moment` and `nudge` are for extensions from before the list.
  return NextResponse.json({ ...result, moments, moment, nudge: moment?.kind === 'drift' ? moment : null });
}
