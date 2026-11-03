/**
 * The end of a Kanwatch day: once a day is over, Kan writes its read on it (the day
 * story) and the board you'll find inside its building on the Freeway. Each is
 * written once and kept; nothing here rewrites a day that already has one.
 */

import { and, desc, eq, gte, isNotNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { kanwatchDays, kanwatchEpisodes, kanwatchTokens } from '@/lib/db/schema';
import { localDate } from './episodes';
import { storyFor } from './story';
import { dayBoardFor } from './freeway';

const DAY_MS = 86400_000;
/** Days this far back still get written, in case a run was missed. */
const LOOK_BACK = 3;

export async function writeFinishedDays(): Promise<{ written: string[] }> {
  const owners = await db.selectDistinct({ userId: kanwatchTokens.userId }).from(kanwatchTokens).where(isNotNull(kanwatchTokens.lastUsedAt));
  const written: string[] = [];
  for (const { userId } of owners) {
    const latest = await db.query.kanwatchEpisodes.findFirst({ where: eq(kanwatchEpisodes.userId, userId), orderBy: [desc(kanwatchEpisodes.startedAt)], columns: { tzOffsetMinutes: true } });
    const tz = latest?.tzOffsetMinutes ?? 0;
    const today = localDate(Date.now(), tz);
    const rows = await db.query.kanwatchDays.findMany({
      where: and(eq(kanwatchDays.userId, userId), gte(kanwatchDays.date, localDate(Date.now() - LOOK_BACK * DAY_MS, tz))),
      columns: { date: true, story: true, board: true },
    });
    const have = new Map(rows.map((r) => [r.date, r]));
    for (let back = 1; back <= LOOK_BACK; back++) {
      const date = localDate(Date.now() - back * DAY_MS, tz);
      if (date >= today) continue;
      const row = have.get(date);
      if (row?.story && row?.board) continue;
      const from = Date.parse(`${date}T00:00:00Z`) + tz * 60000;
      const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(kanwatchEpisodes)
        .where(and(eq(kanwatchEpisodes.userId, userId), gte(kanwatchEpisodes.startedAt, new Date(from)), sql`${kanwatchEpisodes.startedAt} < ${Math.floor((from + DAY_MS) / 1000)}`));
      if (!Number(n)) continue;
      try {
        if (!row?.story) await storyFor(userId, date, from, from + DAY_MS);
        if (!row?.board) await dayBoardFor(userId, date);
        written.push(`${userId}:${date}`);
      } catch (err) {
        console.warn('[kanwatch] end of day failed', date, err instanceof Error ? err.message : err);
      }
    }
  }
  return { written };
}
