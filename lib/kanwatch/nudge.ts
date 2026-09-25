/**
 * A nudge when the browsing drifts from what you said today is for.
 *
 * Jev already scores the stretch in progress against the day's priority every couple
 * of minutes. This reads those scores back when the extension checks in, and says
 * "nudge" only when the drift is sustained, recent, and not private — the extension
 * decides whether to show it (switched on, not snoozed, not shown too recently).
 *
 * Only "unrelated" counts. "Loosely related or supporting" is often how real work
 * looks from outside, and a nudge you learn to ignore is worse than none.
 */

import { and, desc, eq, gte } from 'drizzle-orm';
import { db } from '@/lib/db';
import { kanwatchDays, kanwatchEpisodes } from '@/lib/db/schema';
import { localDate } from './episodes';

/** Minutes of unrelated browsing before a nudge. */
export const DRIFT_MINUTES = 10;
/** The drift has to still be happening: its latest stretch ended this recently. */
const LIVE_WITHIN_MS = 4 * 60 * 1000;
const LOOKBACK_MS = 45 * 60 * 1000;

export interface Nudge {
  /** Stable for one run of drift, so the extension never shows the same one twice. */
  key: string;
  title: string;
  message: string;
  sites: string[];
  minutes: number;
}

type EpisodeRow = typeof kanwatchEpisodes.$inferSelect;

/**
 * Pure: the nudge these episodes call for, if any. Walks back from the latest stretch
 * while each one was read as unrelated, adding up its public (non-private) time.
 */
export function pickNudge(episodes: EpisodeRow[], priority: string | null | undefined, now = Date.now()): Nudge | null {
  if (!priority?.trim()) return null;
  const recent = [...episodes].sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  if (recent.length === 0 || now - recent[0].endedAt.getTime() > LIVE_WITHIN_MS) return null;

  let seconds = 0;
  const sites: string[] = [];
  const run: EpisodeRow[] = [];
  for (const e of recent) {
    // Not read yet: skip over it only if it is the one still being browsed.
    if (e.focusScore === null) {
      if (run.length === 0 && e === recent[0]) continue;
      break;
    }
    // Anything you've answered yourself is yours to judge, not ours.
    if (e.verdict && e.verdict !== 'not_work') break;
    if (e.focusScore > 0 || e.guessKind === 'private') break;
    seconds += Math.max(0, e.activeSeconds - e.privateSeconds);
    run.push(e);
    try {
      for (const s of JSON.parse(e.domains ?? '[]') as string[]) if (!sites.includes(s)) sites.push(s);
    } catch { /* old rows */ }
  }

  const minutes = Math.round(seconds / 60);
  if (run.length === 0 || minutes < DRIFT_MINUTES || sites.length === 0) return null;

  const where = sites.length === 1 ? sites[0] : `${sites[0]} and ${sites[1]}`;
  return {
    // The run's first stretch: the same drift keeps the same key as it grows.
    key: run[run.length - 1].id,
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
  const episodes = await db.query.kanwatchEpisodes.findMany({
    where: and(eq(kanwatchEpisodes.userId, userId), gte(kanwatchEpisodes.endedAt, new Date(now - LOOKBACK_MS))),
    orderBy: [desc(kanwatchEpisodes.startedAt)],
    limit: 6,
  });
  return pickNudge(episodes, day.intention, now);
}
