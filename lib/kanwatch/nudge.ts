/**
 * Moments: the nudges and the celebrations.
 *
 * Jev reads every page against the day's priority — on it, other work, or not work.
 * Moments are read off those pages, in sessions rather than unbroken runs, because
 * real work isn't unbroken: an editor, a dashboard, a support ticket and back again.
 *
 *   A session is time on the priority that hasn't been left for SESSION_BREAK. Short
 *   detours and gaps stay inside it; only a real stretch away ends it.
 *
 *   - start      You're on it / Back on it — once per session, a few minutes in
 *   - deep       25, 50, 90 minutes on the priority this session
 *   - clean      45 minutes of the session with no distraction (a not-work page
 *                longer than a glance). Other work isn't a distraction.
 *   - today      30 minutes, then 1–4 hours on the priority today
 *   - drift      10 minutes off the priority — the one worth interrupting for
 *
 * Every moment carries the visits it was judged from, so "Not accurate" corrects
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
/** Minutes on the priority in a session worth marking. */
export const SESSION_MILESTONES = [25, 50, 90] as const;
/** Minutes of a session without distraction worth marking. */
export const CLEAN_MINUTES = 45;
/** Minutes on the priority across the day worth marking. */
export const DAY_MILESTONES = [30, 60, 120, 180, 240] as const;
/** This long without any time on the priority ends a session. */
export const SESSION_BREAK_MS = 20 * 60 * 1000;
/** A not-work page shorter than this is a glance, not a distraction. */
const GLANCE_SECONDS = 60;
/**
 * The moment has to be happening now. The page you're on is recorded every two
 * minutes, so the latest visit can be a few minutes old while you're still there.
 */
const LIVE_WITHIN_MS = 7 * 60 * 1000;

export type MomentKind = 'start' | 'milestone' | 'drift';

export interface Moment {
  /** Stable for one occurrence, so the extension never shows the same moment twice. */
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

/** Pages that count neither way: private, unread, or too little to tell. */
const neutral = (v: VisitRow) => v.isPrivate || !v.domain || !v.focus || v.focus === 'unclear';

function sitesByTime(entries: Map<string, number>): string[] {
  return [...entries.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s);
}

function describeSites(sites: string[]): string {
  return sites.length === 1 ? sites[0] : `${sites[0]} and ${sites[1]}`;
}

const quote = (priority: string) => `“${priority.trim().slice(0, 80)}”`;

function hours(minutes: number): string {
  if (minutes < 60) return `${minutes} minutes`;
  const h = minutes / 60;
  return h === 1 ? '1 hour' : `${h} hours`;
}

/**
 * Pure: a drift nudge, if these visits call for one.
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
  const sites = sitesByTime(bySite);
  return {
    // The run's oldest counted visit: the same drift keeps the same key as it grows.
    key: `drift:${first.id}`,
    kind: 'drift',
    title: 'Still on today’s priority?',
    message: `Today is for ${quote(priority)}. The last ${minutes} minutes have mostly been ${describeSites(sites)}.`,
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
  /** When the session was last distracted, or its start. */
  cleanSince: number;
  ids: string[];
  sites: Map<string, number>;
}

/**
 * Pure: the celebrations due now, most important first. `visits` is the whole day,
 * so the day's total can be counted.
 */
export function pickCelebrations(visits: VisitRow[], priority: string | null | undefined, now = Date.now(), date = ''): Moment[] {
  if (!priority?.trim()) return [];
  const ordered = visits
    .filter((v) => !v.isBackground && v.startedAt.getTime() <= now)
    .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());

  let session: Session | null = null;
  let sessions = 0;
  let daySeconds = 0;
  for (const v of ordered) {
    if (neutral(v)) continue;
    if (v.focus === 'priority') {
      daySeconds += v.activeSeconds;
      if (!session || v.startedAt.getTime() - session.lastPriorityEnd > SESSION_BREAK_MS) {
        session = { first: v, seconds: 0, lastPriorityEnd: 0, cleanSince: v.startedAt.getTime(), ids: [], sites: new Map() };
        sessions++;
      }
      session.seconds += v.activeSeconds;
      session.lastPriorityEnd = v.endedAt.getTime();
      session.ids.push(v.id);
      session.sites.set(v.domain!, (session.sites.get(v.domain!) ?? 0) + v.activeSeconds);
    } else if (session && v.focus === 'not_work' && v.activeSeconds >= GLANCE_SECONDS) {
      session.cleanSince = v.endedAt.getTime();
    }
  }

  // Only a session you're still in: on the priority within the last few minutes.
  if (!session || now - session.lastPriorityEnd > LIVE_WITHIN_MS) return [];

  const what = quote(priority);
  const sites = sitesByTime(session.sites);
  const minutes = Math.round(session.seconds / 60);
  const base = { sites: sites.slice(0, 5), visitIds: session.ids.slice(-300) };
  const due: Moment[] = [];

  if (minutes >= START_MINUTES) {
    due.push({
      ...base,
      key: `start:${session.first.id}`,
      kind: 'start',
      title: sessions === 1 ? 'You’re on it' : 'Back on it',
      message: sessions === 1
        ? `Started on ${what} — ${describeSites(sites)}. Way to go.`
        : `Back on ${what} — ${describeSites(sites)}. Nice.`,
      minutes,
    });
  }

  const deep = [...SESSION_MILESTONES].reverse().find((m) => minutes >= m);
  if (deep) {
    due.push({
      ...base,
      key: `deep:${session.first.id}:${deep}`,
      kind: 'milestone',
      title: deep >= 90 ? `${deep} minutes deep` : deep >= 50 ? `Deep session: ${deep} minutes` : `${deep} minutes in`,
      message: deep >= 90
        ? `${minutes} minutes on ${what} this session. That’s a long stretch — a short break keeps the next one sharp.`
        : `${minutes} minutes on ${what} this session. Keep going.`,
      minutes,
    });
  }

  const clean = Math.floor((now - session.cleanSince) / 60000);
  if (clean >= CLEAN_MINUTES && minutes >= START_MINUTES) {
    due.push({
      ...base,
      key: `clean:${session.first.id}:${session.cleanSince}`,
      kind: 'milestone',
      title: `${CLEAN_MINUTES} minutes, no distractions`,
      message: `Nothing pulled you off ${what} for ${clean} minutes. That’s focus.`,
      minutes,
    });
  }

  const dayMinutes = Math.round(daySeconds / 60);
  const day = [...DAY_MILESTONES].reverse().find((m) => dayMinutes >= m);
  if (day) {
    due.push({
      ...base,
      key: `today:${date || localDate(now, 0)}:${day}`,
      kind: 'milestone',
      title: `${hours(day)} on it today`,
      message: `${hours(day)} on ${what} today. ${day >= 120 ? 'A real day’s work.' : 'Building up.'}`,
      minutes: dayMinutes,
    });
  }

  return due;
}

/**
 * Everything due now, most important first: drift, then the start of a session, then
 * milestones.
 */
export function pickMoments(visits: VisitRow[], priority: string | null | undefined, now = Date.now(), date = ''): Moment[] {
  const drift = pickNudge(visits, priority, now);
  return [...(drift ? [drift] : []), ...pickCelebrations(visits, priority, now, date)];
}

export async function momentsFor(userId: string, tzOffsetMinutes: number | null): Promise<Moment[]> {
  const now = Date.now();
  const date = localDate(now, tzOffsetMinutes);
  const day = await db.query.kanwatchDays.findFirst({
    where: eq(kanwatchDays.id, `${userId}:${date}`),
    columns: { intention: true },
  });
  if (!day?.intention?.trim()) return [];
  // The whole local day, for the day's total.
  const [y, m, d] = date.split('-').map(Number);
  const dayStart = Date.UTC(y, m - 1, d) + (tzOffsetMinutes ?? 0) * 60000;
  const visits = await db.query.kanwatchVisits.findMany({
    where: and(eq(kanwatchVisits.userId, userId), gte(kanwatchVisits.startedAt, new Date(dayStart))),
    columns: { id: true, startedAt: true, endedAt: true, activeSeconds: true, isPrivate: true, isBackground: true, domain: true, focus: true },
  });
  return pickMoments(visits, day.intention, now, date);
}

/**
 * What a page becomes when you say a moment got it wrong. A celebration was wrong
 * that these pages served the priority; a drift nudge was wrong that they didn't.
 * On a celebration Kan can't know what they were instead, so they count neither way.
 */
export function correctedFocus(kind: MomentKind): 'priority' | 'unclear' {
  return kind === 'drift' ? 'priority' : 'unclear';
}
