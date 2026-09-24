import { NextResponse } from 'next/server';
import { ensureSchema } from '@/lib/db/ensure-schema';
import { afterResponse } from '@/lib/afterResponse';
import { userFromBearer } from '@/lib/kanwatch/token';
import { ingestVisits, type IncomingVisit } from '@/lib/kanwatch/ingest';
import { judgePending } from '@/lib/kanwatch/judge';
import { judgePendingReads } from '@/lib/kanwatch/reads';

/**
 * POST /api/kanwatch/ingest — visits from the Kanwatch extension.
 *
 * Authenticated by the extension's own revocable token, not the session cookie, so
 * it works from the extension's background worker and grants nothing else.
 */
export async function POST(request: Request) {
  await ensureSchema();
  const userId = await userFromBearer(request.headers.get('authorization'));
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

  return NextResponse.json(result);
}
