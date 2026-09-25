/**
 * A nudge when the browsing drifts from what you said today is for.
 *
 * Jev reads every page against the day's priority as it goes — on it, other work,
 * or not work. This walks back from what you're on now through those reads and says
 * "nudge" only when the time off the priority is sustained, recent and not private.
 * The extension decides whether to show it (switched on, not snoozed, not shown too
 * recently, not about sites you've said count).
 *
 * Pages, not stretches: a stretch is a mix, and scoring it as a whole let a social
 * feed hide inside a work session.
 */

import { and, eq, gte } from 'drizzle-orm';
import { db } from '@/lib/db';
import { kanwatchDays, kanwatchVisits } from '@/lib/db/schema';
import { GAP_MS, localDate } from './episodes';

/** Minutes off the priority before a nudge. */
export const DRIFT_MINUTES = 10;
/**
 * The drift has to still be happening. A visit is only recorded when you leave the
 * page or every five minutes on it, so the latest one can be this old while you're
 * still there.
 */
const LIVE_WITHIN_MS = 7 * 60 * 1000;
const LOOKBACK_MS = 60 * 60 * 1000;

export interface Nudge {
  /** Stable for one run of drift, so the extension never shows the same one twice. */
  key: string;
  title: string;
  message: string;
  sites: string[];
  minutes: number;
}

type VisitRow = Pick<typeof kanwatchVisits.$inferSelect,
  'id' | 'startedAt' | 'endedAt' | 'activeSeconds' | 'isPrivate' | 'isBackground' | 'domain' | 'focus'>;

/**
 * Pure: the nudge these visits call for, if any.
 *
 * Walks back from the latest visit. Time on pages read as other work or not work
 * adds up; a page on the priority ends the run, and so does stepping away. Private
 * pages, unread pages and unclear ones are passed over — they count neither way.
 */
export function pickNudge(visits: VisitRow[], priority: string | null | undefined, now = Date.now()): Nudge | null {
  if (!priority?.trim()) return null;
  const recent = visits
    .filter((v) => !v.isBackground)
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  if (recent.length === 0 || now - recent[0].endedAt.getTime() > LIVE_WITHIN_MS) return null;

  const bySite = new Map<string, number>();
  let seconds = 0;
  let first: VisitRow | null = null;
  let after = recent[0];
  for (const v of recent) {
    if (after.startedAt.getTime() - v.endedAt.getTime() > GAP_MS) break;
    after = v;
    if (v.focus === 'priority') break;
    if (v.isPrivate || !v.domain || !v.focus || v.focus === 'unclear') continue;
    seconds += v.activeSeconds;
    bySite.set(v.domain, (bySite.get(v.domain) ?? 0) + v.activeSeconds);
    first = v;
  }

  const minutes = Math.round(seconds / 60);
  if (!first || minutes < DRIFT_MINUTES) return null;

  const sites = [...bySite.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s);
  const where = sites.length === 1 ? sites[0] : `${sites[0]} and ${sites[1]}`;
  return {
    // The run's oldest counted visit: the same drift keeps the same key as it grows.
    key: first.id,
    title: 'Still on today’s priority?',
    message: `Today is for “${priority.trim().slice(0, 80)}”. The last ${minutes} minutes have mostly been ${where}.`,
    sites: sites.slice(0, 5),
    minutes,
  };
}

export async function nudgeFor(userId: string, tzOffsetMinutes: number | null): Promise<Nudge | null> {
  const now = Date.now();
  const day = await db.query.kanwatchDays.findFirst({
    where: eq(kanwatchDays.id, `${userId}:${localDate(now, tzOffsetMinutes)}`),
    columns: { intention: true },
  });
  if (!day?.intention?.trim()) return null;
  const visits = await db.query.kanwatchVisits.findMany({
    where: and(eq(kanwatchVisits.userId, userId), gte(kanwatchVisits.startedAt, new Date(now - LOOKBACK_MS))),
    columns: { id: true, startedAt: true, endedAt: true, activeSeconds: true, isPrivate: true, isBackground: true, domain: true, focus: true },
  });
  return pickNudge(visits, day.intention, now);
}
