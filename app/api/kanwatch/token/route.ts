import { NextResponse } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { kanwatchTokens } from '@/lib/db/schema';
import { kanwatchUser } from '@/lib/kanwatch/access';
import { issueToken } from '@/lib/kanwatch/token';

/**
 * POST /api/kanwatch/token — a new key for the extension. Any existing key is
 * revoked first, so there is only ever one live key and "reconnect" is also
 * "cut off whatever had the old one". The token is returned once and never again.
 */
export async function POST() {
  const userId = await kanwatchUser();
  if (!userId) return NextResponse.json({ error: 'Not available' }, { status: 403 });
  await revokeAll(userId);
  const token = await issueToken(userId);
  return NextResponse.json({ token });
}

/** DELETE /api/kanwatch/token — disconnect: the extension's key stops working immediately. */
export async function DELETE() {
  const userId = await kanwatchUser();
  if (!userId) return NextResponse.json({ error: 'Not available' }, { status: 403 });
  await revokeAll(userId);
  return NextResponse.json({ ok: true });
}

async function revokeAll(userId: string) {
  await db.update(kanwatchTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(kanwatchTokens.userId, userId), isNull(kanwatchTokens.revokedAt)));
}
