import { NextResponse } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { kanwatchMoments, kanwatchVisits } from '@/lib/db/schema';
import { ensureSchema } from '@/lib/db/ensure-schema';
import { userFromBearer } from '@/lib/kanwatch/token';
import { correctedFocus, type MomentKind } from '@/lib/kanwatch/nudge';

/**
 * POST /api/kanwatch/moments — your answer to a moment, from the extension.
 *
 * { key, kind, verdict: 'right' | 'wrong', visitIds }
 *
 * "Right" is the yes button: it confirms the pages it was judged from. "Wrong" is the
 * no: it corrects them — "No, I'm not" on moving onto the priority makes them other
 * work, "No, I'm on it" on moving away makes them the priority — and marks them so
 * Jev never reads them back, and so the correction isn't itself taken as a change. Both are counted, which is how the
 * Kanwatch page can say how often Kan's read was right.
 */
const KINDS: MomentKind[] = ['start', 'milestone', 'drift'];

export async function POST(request: Request) {
  await ensureSchema();
  const userId = await userFromBearer(request.headers.get('authorization'), request.headers.get('x-kanwatch-version'));
  if (!userId) return NextResponse.json({ error: 'Invalid or revoked Kanwatch key' }, { status: 401 });

  const body = await request.json().catch(() => null) as { key?: unknown; kind?: unknown; verdict?: unknown; visitIds?: unknown } | null;
  const key = typeof body?.key === 'string' ? body.key.slice(0, 120) : '';
  const kind = KINDS.find((k) => k === body?.kind);
  const verdict = body?.verdict === 'right' || body?.verdict === 'wrong' ? body.verdict : null;
  const visitIds = Array.isArray(body?.visitIds)
    ? body.visitIds.filter((id): id is string => typeof id === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(id)).slice(0, 300)
    : [];
  if (!key || !kind || !verdict) return NextResponse.json({ error: 'key, kind and verdict are required' }, { status: 400 });

  const now = new Date();
  await db.insert(kanwatchMoments)
    .values({ id: `${userId}:${key}`, userId, kind, verdict, createdAt: now })
    .onConflictDoUpdate({ target: kanwatchMoments.id, set: { verdict } });

  if (visitIds.length) {
    // Only your own visits, whatever the request names.
    const mine = and(eq(kanwatchVisits.userId, userId), inArray(kanwatchVisits.id, visitIds));
    await db.update(kanwatchVisits)
      .set(verdict === 'wrong' ? { focus: correctedFocus(kind), focusVerdict: 'corrected' } : { focusVerdict: 'confirmed' })
      .where(mine);
  }

  return NextResponse.json({ ok: true });
}
