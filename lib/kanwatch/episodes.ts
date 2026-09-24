/**
 * Grouping visits into episodes — the unit Kanwatch judges and shows.
 *
 * Pure: no database, so the rules can be tested directly. A visit joins the open
 * episode when it starts within GAP of the episode's end and the episode has not
 * yet run MAX_SPAN; otherwise the open one closes and a new one starts. Idle time
 * is already cut out by the extension, so a gap here means you stepped away.
 */

/** Raw visits and page text are deleted after this many days. */
export const RETENTION_DAYS = 30;

export const GAP_MS = 5 * 60 * 1000;
export const MAX_SPAN_MS = 30 * 60 * 1000;

export interface VisitTiming {
  id: string;
  startedAt: number;
  endedAt: number;
  activeSeconds: number;
  isPrivate: boolean;
}

export interface EpisodeSpan {
  id: string;
  startedAt: number;
  endedAt: number;
  activeSeconds: number;
  privateSeconds: number;
  isNew: boolean;
}

export interface Assignment {
  episodes: EpisodeSpan[];
  /** visit id → episode id */
  visitEpisode: Map<string, string>;
  /** Episodes that must close: a later visit started a new one. */
  closed: string[];
}

export function assignEpisodes(
  visits: VisitTiming[],
  open: Omit<EpisodeSpan, 'isNew'> | null,
  newId: () => string,
): Assignment {
  const episodes = new Map<string, EpisodeSpan>();
  const visitEpisode = new Map<string, string>();
  const closed: string[] = [];
  let current: EpisodeSpan | null = open ? { ...open, isNew: false } : null;
  if (current) episodes.set(current.id, current);

  for (const v of [...visits].sort((a, b) => a.startedAt - b.startedAt)) {
    const joins =
      current &&
      v.startedAt - current.endedAt <= GAP_MS &&
      v.startedAt - current.startedAt < MAX_SPAN_MS;

    if (!joins) {
      if (current) closed.push(current.id);
      current = { id: newId(), startedAt: v.startedAt, endedAt: v.endedAt, activeSeconds: 0, privateSeconds: 0, isNew: true };
      episodes.set(current.id, current);
    }
    const ep = current!;
    ep.startedAt = Math.min(ep.startedAt, v.startedAt);
    ep.endedAt = Math.max(ep.endedAt, v.endedAt);
    ep.activeSeconds += v.activeSeconds;
    if (v.isPrivate) ep.privateSeconds += v.activeSeconds;
    visitEpisode.set(v.id, ep.id);
  }

  return { episodes: [...episodes.values()], visitEpisode, closed };
}

export interface Engagement {
  activeSeconds: number;
  keystrokes: number;
  clicks: number;
  scrollDepth: number;
  mediaSeconds: number;
}

/** What someone was doing on a page, from counts alone. */
export function describeEngagement(e: Engagement): 'typing' | 'watching or listening' | 'reading' | 'browsing' {
  const minutes = Math.max(e.activeSeconds / 60, 0.25);
  if (e.keystrokes / minutes >= 15) return 'typing';
  if (e.mediaSeconds >= e.activeSeconds * 0.5 && e.mediaSeconds > 20) return 'watching or listening';
  if (e.scrollDepth >= 40) return 'reading';
  return 'browsing';
}

/** Local calendar date for an instant, given the browser's getTimezoneOffset(). */
export function localDate(at: number, tzOffsetMinutes: number | null | undefined): string {
  return new Date(at - (tzOffsetMinutes ?? 0) * 60000).toISOString().slice(0, 10);
}

export function partOfDay(at: number, tzOffsetMinutes: number | null | undefined): string {
  const hour = new Date(at - (tzOffsetMinutes ?? 0) * 60000).getUTCHours();
  if (hour < 5) return 'late night';
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  if (hour < 21) return 'evening';
  return 'late evening';
}
