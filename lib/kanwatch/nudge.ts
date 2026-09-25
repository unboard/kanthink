/**
 * Moments: the nudges and the celebrations.
 *
 * Jev reads every page against the day's priority as it goes — on it, other work, or
 * not work. These walk back from what you're on now through those reads:
 *
 *   - start      you've settled into the priority (a few minutes on it)
 *   - milestone  25, 50, 90 minutes on it; a detour under a minute doesn't break the
 *                run, it's just counted
 *   - drift      ten minutes off it
 *
 * Every moment carries the visits it was judged from, so "Not accurate" can correct
 * exactly those pages — which is how the reads get better, and how you can see
 * whether Kan understands what you're doing.
 *
 * The extension decides whether to show one (switched on, not snoozed, not shown
 * before, drifts not too often, not about sites you've said count).
 */

import { and, eq, gte } from 'drizzle-orm';
import { db } from '@/lib/db';
import { kanwatchDays, kanwatchVisits } from '@/lib/db/schema';
import { GAP_MS, localDate } from './episodes';

/** Minutes off the priority before a nudge. */
export const DRIFT_MINUTES = 10;
/** Minutes on the priority before it counts as having started. */
export const START_MINUTES = 3;
/** Focus milestones, in minutes. */
export const MILESTONES = [25, 50, 90] as const;
/** An off-priority page shorter than this is a detour, not the end of a run. */
const DETOUR_SECONDS = 60;
/**
 * The moment has to be happening now. A visit is only recorded when you leave the
 * page or every five minutes on it, so the latest one can be this old while you're
 * still there.
 */
const LIVE_WITHIN_MS = 7 * 60 * 1000;
const LOOKBACK_MS = 2 * 60 * 60 * 1000;

export type MomentKind = 'start' | 'milestone' | 'drift';

export interface Moment {
  /** Stable for one run, so the extension never shows the same moment twice. */
  key: string;
  kind: MomentKind;
  title: string;
  message: string;
  sites: string[];
  minutes: number;
  /** The visits this was judged from — what "Not accurate" corrects. */
  visitIds: string[];
}

type VisitRow = Pick<typeof kanwatchVisits.$inferSelect,
  'id' | 'startedAt' | 'endedAt' | 'activeSeconds' | 'isPrivate' | 'isBackground' | 'domain' | 'focus'>;

/** Newest first, background media left out, and null when nothing is happening now. */
function recentOf(visits: VisitRow[], now: number): VisitRow[] | null {
  const recent = visits
    .filter((v) => !v.isBackground)
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  if (recent.length === 0 || now - recent[0].endedAt.getTime() > LIVE_WITHIN_MS) return null;
  return recent;
}

/** Pages that count neither way: private, unread, or too little to tell. */
const neutral = (v: VisitRow) => v.isPrivate || !v.domain || !v.focus || v.focus === 'unclear';

function sitesByTime(entries: Map<string, number>): string[] {
  return [...entries.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s);
}

function describeSites(sites: string[]): string {
  return sites.length === 1 ? sites[0] : `${sites[0]} and ${sites[1]}`;
}

/**
 * Pure: a drift nudge, if these visits call for one.
 *
 * Time on pages read as other work or not work adds up; a page on the priority ends
 * the run, and so does stepping away. Neutral pages are passed over.
 */
export function pickNudge(visits: VisitRow[], priority: string | null | undefined, now = Date.now()): Moment | null {
  if (!priority?.trim()) return null;
  const recent = recentOf(visits, now);
  if (!recent) return null;

  const bySite = new Map<string, number>();
  const ids: string[] = [];
  let seconds = 0;
  let first: VisitRow | null = null;
  let after = recent[0];
  for (const v of recent) {
    if (after.startedAt.getTime() - v.endedAt.getTime() > GAP_MS) break;
    after = v;
    if (v.focus === 'priority') break;
    if (neutral(v)) continue;
    seconds += v.activeSeconds;
    bySite.set(v.domain!, (bySite.get(v.domain!) ?? 0) + v.activeSeconds);
    ids.push(v.id);
    first = v;
  }

  const minutes = Math.round(seconds / 60);
  if (!first || minutes < DRIFT_MINUTES) return null;
  const sites = sitesByTime(bySite);
  return {
    // The run's oldest counted visit: the same drift keeps the same key as it grows.
    key: `drift:${first.id}`,
    kind: 'drift',
    title: 'Still on today’s priority?',
    message: `Today is for “${priority.trim().slice(0, 80)}”. The last ${minutes} minutes have mostly been ${describeSites(sites)}.`,
    sites: sites.slice(0, 5),
    minutes,
    visitIds: ids,
  };
}

/**
 * Pure: a celebration, if these visits have earned one — the start of work on the
 * priority, or the biggest milestone the current run has reached.
 */
export function pickCelebration(visits: VisitRow[], priority: string | null | undefined, now = Date.now()): Moment | null {
  if (!priority?.trim()) return null;
  const recent = recentOf(visits, now);
  if (!recent) return null;

  const bySite = new Map<string, number>();
  const ids: string[] = [];
  let seconds = 0;
  let detours = 0;
  let first: VisitRow | null = null;
  let after = recent[0];
  for (const v of recent) {
    if (after.startedAt.getTime() - v.endedAt.getTime() > GAP_MS) break;
    after = v;
    if (neutral(v)) continue;
    if (v.focus === 'priority') {
      seconds += v.activeSeconds;
      bySite.set(v.domain!, (bySite.get(v.domain!) ?? 0) + v.activeSeconds);
      ids.push(v.id);
      first = v;
      continue;
    }
    // A glance elsewhere is a detour; anything longer is where the run began.
    if (v.activeSeconds < DETOUR_SECONDS) { detours++; continue; }
    break;
  }

  const minutes = Math.round(seconds / 60);
  if (!first || minutes < START_MINUTES) return null;

  const what = `“${priority.trim().slice(0, 80)}”`;
  const sites = sitesByTime(bySite);
  const reached = [...MILESTONES].reverse().find((m) => minutes >= m);
  if (!reached) {
    return {
      key: `start:${first.id}`,
      kind: 'start',
      title: 'You’re on it',
      message: `Started on ${what} — ${describeSites(sites)}. Nice.`,
      sites: sites.slice(0, 5),
      minutes,
      visitIds: ids,
    };
  }
  const clean = detours === 0 ? 'without drifting' : `with ${detours} quick detour${detours === 1 ? '' : 's'}`;
  return {
    key: `deep:${first.id}:${reached}`,
    kind: 'milestone',
    title: reached >= 90 ? `${reached} minutes deep` : reached >= 50 ? `Deep session: ${reached} minutes` : `${reached} minutes, focused`,
    message: reached >= 90
      ? `${minutes} minutes on ${what}, ${clean}. That’s a long stretch — a short break keeps the next one sharp.`
      : `${minutes} minutes on ${what}, ${clean}. Keep going.`,
    sites: sites.slice(0, 5),
    minutes,
    visitIds: ids,
  };
}

/** Drift outranks a celebration: it's the one worth interrupting for. */
export function pickMoment(visits: VisitRow[], priority: string | null | undefined, now = Date.now()): Moment | null {
  return pickNudge(visits, priority, now) ?? pickCelebration(visits, priority, now);
}

export async function momentFor(userId: string, tzOffsetMinutes: number | null): Promise<Moment | null> {
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
  return pickMoment(visits, day.intention, now);
}

/**
 * What a page becomes when you say a moment got it wrong. A celebration was wrong
 * that these pages served the priority; a drift nudge was wrong that they didn't.
 * On a celebration Kan can't know what they were instead, so they count neither way.
 */
export function correctedFocus(kind: MomentKind): 'priority' | 'unclear' {
  return kind === 'drift' ? 'priority' : 'unclear';
}
