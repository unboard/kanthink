import { NextResponse } from 'next/server';
import { and, eq, gte, inArray, lt } from 'drizzle-orm';
import { db } from '@/lib/db';
import { kanwatchDays, kanwatchEpisodes, kanwatchSites, kanwatchVisits } from '@/lib/db/schema';
import { kanwatchUser } from '@/lib/kanwatch/access';

/**
 * DELETE /api/kanwatch/data            — everything Kanwatch holds about you
 * DELETE /api/kanwatch/data?from=&to=  — one day (bounds in your timezone, ms)
 *
 * Deleting everything also removes day intentions and site notes. The extension
 * key is left alone; disconnect it separately if you want recording to stop.
 */
export async function DELETE(request: Request) {
  const userId = await kanwatchUser();
  if (!userId) return NextResponse.json({ error: 'Not available' }, { status: 403 });

  const url = new URL(request.url);
  const from = Number(url.searchParams.get('from'));
  const to = Number(url.searchParams.get('to'));

  if (url.searchParams.has('from')) {
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
      return NextResponse.json({ error: 'Bad range' }, { status: 400 });
    }
    const episodes = await db.query.kanwatchEpisodes.findMany({
      where: and(
        eq(kanwatchEpisodes.userId, userId),
        gte(kanwatchEpisodes.startedAt, new Date(from)),
        lt(kanwatchEpisodes.startedAt, new Date(to)),
      ),
      columns: { id: true },
    });
    const ids = episodes.map((e) => e.id);
    if (ids.length) {
      await db.delete(kanwatchVisits).where(and(eq(kanwatchVisits.userId, userId), inArray(kanwatchVisits.episodeId, ids)));
      await db.delete(kanwatchEpisodes).where(and(eq(kanwatchEpisodes.userId, userId), inArray(kanwatchEpisodes.id, ids)));
    }
    return NextResponse.json({ ok: true, deletedEpisodes: ids.length });
  }

  await db.delete(kanwatchVisits).where(eq(kanwatchVisits.userId, userId));
  await db.delete(kanwatchEpisodes).where(eq(kanwatchEpisodes.userId, userId));
  await db.delete(kanwatchDays).where(eq(kanwatchDays.userId, userId));
  await db.delete(kanwatchSites).where(eq(kanwatchSites.userId, userId));
  return NextResponse.json({ ok: true });
}
