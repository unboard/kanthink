/**
 * Moments: the points where what you're doing changes, relative to today's priority.
 *
 * Jev reads every page against the day's priority — on it, other work, or not work.
 * Moments are read off those pages, in sessions rather than unbroken runs, because
 * real work isn't unbroken: an editor, a dashboard, a support ticket and back again.
 *
 *   A session is time on the priority that hasn't been left for SESSION_BREAK. Short
 *   detours and gaps stay inside it; only a real stretch away ends it.
 *
 * Only two moments, both changes of direction, each asked as a yes/no question:
 *
 *   - start      Moving onto the priority — once per session, a few minutes in
 *   - drift      Moving away from it — 10 minutes off
 *
 * Milestones ("25 minutes in", "2 hours today") used to pop up too. A notification
 * that isn't about a change still reads as one, so they're gone.
 *
 * A change you told us about is not a change. Answering "No, I'm on it" relabels the
 * last ten minutes as the priority, which used to start a session — and the next
 * check-in celebrated it with the very sites you'd just been asked about. A session or
 * a drift that begins at a page you corrected is one you already know about.
 *
 * Every moment carries the visits it was judged from, so the "no" answer corrects
 * exactly those pages. The server lists what's due, most important first; the
 * extension shows the first it hasn't shown, one per check-in.
 */

import { and, eq, gte } from 'drizzle-orm';
import { db } from '@/lib/db';
import { kanwatchDays, kanwatchVisits } from '@/lib/db/schema';
import { GAP_MS, localDate } from './episodes';

/** Minutes off the priority before a nudge. */
export const DRIFT_MINUTES = 10;
/** Minutes on the priority before a session counts as started. */
export const START_MINUTES = 3;
/** This long without any time on the priority ends a session. */
export const SESSION_BREAK_MS = 20 * 60 * 1000;
/**
 * The moment has to be happening now. The page you're on is recorded every two
 * minutes, so the latest visit can be a few minutes old while you're still there.
 */
const LIVE_WITHIN_MS = 7 * 60 * 1000;

/** 'milestone' is no longer produced; it stays so answers already stored still parse. */
export type MomentKind = 'start' | 'milestone' | 'drift';

export interface Moment {
  /** Stable for one occurrence, so the extension never shows the same moment twice. */
  key: string;
  kind: MomentKind;
  /** A question, so the two buttons can be a plain yes and no. */
  title: string;
  message: string;
  /** [yes — the read was right, no — it was wrong]. */
  buttons: [string, string];
  sites: string[];
  minutes: number;
  /** The visits this was judged from — what answering "no" corrects. */
  visitIds: string[];
}

type VisitRow = Pick<typeof kanwatchVisits.$inferSelect,
  'id' | 'startedAt' | 'endedAt' | 'activeSeconds' | 'isPrivate' | 'isBackground' | 'domain' | 'focus'> &
  Partial<Pick<typeof kanwatchVisits.$inferSelect, 'focusVerdict'>>;

/** Pages that count neither way: private, unread, or too little to tell. */
const neutral = (v: VisitRow) => v.isPrivate || !v.domain || !v.focus || v.focus === 'unclear';

/** You said what this page was, in answer to a moment. */
const corrected = (v: VisitRow) => v.focusVerdict === 'corrected';

function sitesByTime(entries: Map<string, number>): string[] {
  return [...entries.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s);
}

function describeSites(sites: string[]): string {
  return sites.length === 1 ? sites[0] : `${sites[0]} and ${sites[1]}`;
}

const quote = (priority: string) => `“${priority.trim().slice(0, 80)}”`;

/**
 * Pure: the moment you moved away from the priority, if these visits show one.
 *
 * Walks back from now. Time on pages read as other work or not work adds up; a page
 * on the priority ends the run, and so does stepping away. Neutral pages are passed
 * over.
 */
export function pickNudge(visits: VisitRow[], priority: string | null | undefined, now = Date.now()): Moment | null {
  if (!priority?.trim()) return null;
  const recent = visits
    .filter((v) => !v.isBackground)
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  if (recent.length === 0 || now - recent[0].endedAt.getTime() > LIVE_WITHIN_MS) return null;

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
  // Starts at a page you said wasn't the priority: you've already told us.
  if (corrected(first)) return null;
  const sites = sitesByTime(bySite);
  return {
    // The run's oldest counted visit: the same drift keeps the same key as it grows.
    key: `drift:${first.id}`,
    kind: 'drift',
    title: 'Off your priority?',
    message: `The last ${minutes} minutes have mostly been ${describeSites(sites)}, not ${quote(priority)}.`,
    buttons: ['Yes, I’m off it', 'No, I’m on it'],
    sites: sites.slice(0, 5),
    minutes,
    visitIds: ids,
  };
}

interface Session {
  first: VisitRow;
  /** Seconds on the priority in this session. */
  seconds: number;
  lastPriorityEnd: number;
  ids: string[];
  sites: Map<string, number>;
}

/**
 * Pure: the moment you moved onto the priority, if you're a few minutes into a session
 * that began since you were last on it. `visits` is the whole day, so sessions can be
 * told apart.
 */
export function pickStart(visits: VisitRow[], priority: string | null | undefined, now = Date.now()): Moment | null {
  if (!priority?.trim()) return null;
  const ordered = visits
    .filter((v) => !v.isBackground && v.startedAt.getTime() <= now)
    .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());

  let session: Session | null = null;
  let sessions = 0;
  for (const v of ordered) {
    if (neutral(v) || v.focus !== 'priority') continue;
    if (!session || v.startedAt.getTime() - session.lastPriorityEnd > SESSION_BREAK_MS) {
      session = { first: v, seconds: 0, lastPriorityEnd: 0, ids: [], sites: new Map() };
      sessions++;
    }
    session.seconds += v.activeSeconds;
    session.lastPriorityEnd = v.endedAt.getTime();
    session.ids.push(v.id);
    session.sites.set(v.domain!, (session.sites.get(v.domain!) ?? 0) + v.activeSeconds);
  }

  // Only a session you're still in: on the priority within the last few minutes.
  if (!session || now - session.lastPriorityEnd > LIVE_WITHIN_MS) return null;
  // Began with pages you said were the priority: the change was your answer, not you.
  if (corrected(session.first)) return null;
  const minutes = Math.round(session.seconds / 60);
  if (minutes < START_MINUTES) return null;

  const sites = sitesByTime(session.sites);
  return {
    key: `start:${session.first.id}`,
    kind: 'start',
    title: sessions === 1 ? 'On your priority?' : 'Back on your priority?',
    message: `The last ${minutes} minutes on ${describeSites(sites)} look like ${quote(priority)}.`,
    buttons: ['Yes, I’m on it', 'No, I’m not'],
    sites: sites.slice(0, 5),
    minutes,
    visitIds: session.ids.slice(-300),
  };
}

/** Everything due now, most important first: moving away, then moving onto it. */
export function pickMoments(visits: VisitRow[], priority: string | null | undefined, now = Date.now()): Moment[] {
  return [pickNudge(visits, priority, now), pickStart(visits, priority, now)]
    .filter((m): m is Moment => m !== null);
}

export async function momentsFor(userId: string, tzOffsetMinutes: number | null): Promise<Moment[]> {
  const now = Date.now();
  const date = localDate(now, tzOffsetMinutes);
  const day = await db.query.kanwatchDays.findFirst({
    where: eq(kanwatchDays.id, `${userId}:${date}`),
    columns: { intention: true },
  });
  if (!day?.intention?.trim()) return [];
  // The whole local day, so sessions can be told apart.
  const [y, m, d] = date.split('-').map(Number);
  const dayStart = Date.UTC(y, m - 1, d) + (tzOffsetMinutes ?? 0) * 60000;
  const visits = await db.query.kanwatchVisits.findMany({
    where: and(eq(kanwatchVisits.userId, userId), gte(kanwatchVisits.startedAt, new Date(dayStart))),
    columns: { id: true, startedAt: true, endedAt: true, activeSeconds: true, isPrivate: true, isBackground: true, domain: true, focus: true, focusVerdict: true },
  });
  return pickMoments(visits, day.intention, now);
}

/**
 * What a page becomes when you answer "no". "No, I'm on it" to a drift: these pages
 * were the priority. "No, I'm not" to a start: they weren't — counted as other work,
 * which is off the priority without calling it a distraction.
 */
export function correctedFocus(kind: MomentKind): 'priority' | 'work' {
  return kind === 'drift' ? 'priority' : 'work';
}
