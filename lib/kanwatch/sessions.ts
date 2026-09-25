/**
 * How a day is read back: each stretch's "for" in one consistent form, and stretches
 * grouped into sessions.
 *
 * A stretch is 5–30 minutes of browsing; a morning of print-order admin is five or six
 * of them, which as a list reads like browser history with labels on. A session is
 * what you'd say you did: consecutive stretches for the same thing, with short gaps
 * and the odd private minute in between folded in.
 *
 * Pure: the day view, the day story and Kan's context all read days the same way.
 */

import type { kanwatchEpisodes, kanwatchVisits } from '@/lib/db/schema';
import { summarizePages } from './judge';

type EpisodeRow = typeof kanwatchEpisodes.$inferSelect;
type VisitRow = typeof kanwatchVisits.$inferSelect;

/** Consecutive stretches for the same thing within this gap are one session. */
export const SESSION_GAP_MS = 20 * 60 * 1000;

export interface Names {
  channel: Map<string, { name: string; folder: string | null }>;
  card: Map<string, string>;
}

export interface Reading {
  /** Groups stretches: `ch:<id>`, `label:<words>`, or not_work / new_work / unclear / private / unread. */
  key: string;
  /** Folder / Channel › Card, your own words, or a plain state. */
  label: string;
  folder: string | null;
  channelName: string | null;
  /** You said so, rather than Kan guessing. */
  decided: boolean;
  probability: number | null;
}

function channelLabel(names: Names, channelId: string | null): { label: string; folder: string | null; name: string } | null {
  if (!channelId) return null;
  const c = names.channel.get(channelId);
  if (!c) return null;
  return { label: c.folder ? `${c.folder} / ${c.name}` : c.name, folder: c.folder, name: c.name };
}

export function readingOf(e: EpisodeRow, pageCount: number, names: Names): Reading {
  const base = { folder: null, channelName: null, probability: null };
  if (e.verdict === 'not_work') return { ...base, key: 'not_work', label: e.label?.trim() || 'Not work', decided: true };
  if (e.verdict) {
    const ch = channelLabel(names, e.verdictChannelId);
    if (e.label?.trim()) {
      return { ...base, key: `label:${e.label.trim().toLowerCase()}`, label: e.label.trim(), folder: ch?.folder ?? null, channelName: ch?.name ?? null, decided: true };
    }
    if (ch) {
      const card = e.verdictCardId ? names.card.get(e.verdictCardId) : undefined;
      return { ...base, key: `ch:${e.verdictChannelId}`, label: card ? `${ch.label} › ${card}` : ch.label, folder: ch.folder, channelName: ch.name, decided: true };
    }
    return { ...base, key: 'label:work', label: 'Work', decided: true };
  }
  if (pageCount === 0 && e.privateSeconds > 0) return { ...base, key: 'private', label: 'Private', decided: true };
  if (!e.guessKind) return { ...base, key: 'unread', label: 'Not read yet', decided: false };

  const probability = e.guessProbability;
  switch (e.guessKind) {
    case 'area':
      return e.guessLabel
        ? { ...base, key: `label:${e.guessLabel.trim().toLowerCase()}`, label: e.guessLabel.trim(), decided: false, probability }
        : { ...base, key: 'unclear', label: 'Unclear', decided: false, probability };
    case 'channel':
    case 'card': {
      const ch = channelLabel(names, e.guessChannelId);
      if (!ch) return { ...base, key: 'unclear', label: 'Unclear', decided: false, probability };
      const card = e.guessCardId ? names.card.get(e.guessCardId) : undefined;
      return { key: `ch:${e.guessChannelId}`, label: card ? `${ch.label} › ${card}` : ch.label, folder: ch.folder, channelName: ch.name, decided: false, probability };
    }
    case 'new_work': return { ...base, key: 'new_work', label: 'Something new', decided: false, probability };
    case 'not_work': return { ...base, key: 'not_work', label: 'Not work', decided: false, probability };
    case 'private': return { ...base, key: 'private', label: 'Private', decided: true };
    default: return { ...base, key: 'unclear', label: 'Unclear', decided: false, probability };
  }
}

export interface Session {
  id: string;
  episodeIds: string[];
  startedAt: number;
  endedAt: number;
  activeSeconds: number;
  privateSeconds: number;
  reading: Reading;
  /** What you were doing, by time. `yours` when you set it. */
  modes: { mode: string; seconds: number; yours: boolean }[];
  live: boolean;
  /** Every stretch in it has your answer. */
  answered: boolean;
  focusScore: number | null;
  pages: ReturnType<typeof summarizePages>;
  basis: { notes: string[]; pastAnswers: number } | null;
  /** Media playing in another tab during the session: context, not attention. */
  alongside: { site: string; title: string; seconds: number }[];
}

/**
 * What played alongside each session, by overlap in time. Sessions are ordered; a
 * background play that spans two sessions counts toward each for the part it overlaps.
 */
export function attachBackground(sessions: Session[], background: VisitRow[]): Session[] {
  return sessions.map((s) => {
    const by = new Map<string, { site: string; title: string; seconds: number }>();
    for (const b of background) {
      if (!b.domain) continue;
      const overlap = Math.min(s.endedAt, b.endedAt.getTime()) - Math.max(s.startedAt, b.startedAt.getTime());
      if (overlap < 30000) continue;
      const key = `${b.domain}|${b.title ?? ''}`;
      const cur = by.get(key) ?? { site: b.domain, title: b.title ?? '', seconds: 0 };
      cur.seconds += Math.round(overlap / 1000);
      by.set(key, cur);
    }
    return { ...s, alongside: [...by.values()].sort((a, b) => b.seconds - a.seconds).slice(0, 3) };
  });
}

export function groupSessions(episodes: EpisodeRow[], visits: VisitRow[], names: Names): Session[] {
  const sorted = [...episodes].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  const visitsOf = new Map<string, VisitRow[]>();
  for (const v of visits) if (v.episodeId) visitsOf.set(v.episodeId, [...(visitsOf.get(v.episodeId) ?? []), v]);

  const sessions: (Session & { _visits: VisitRow[]; _focus: [number, number] })[] = [];
  for (const e of sorted) {
    const own = visitsOf.get(e.id) ?? [];
    const pageCount = own.filter((v) => !v.isPrivate && v.domain).length;
    const reading = readingOf(e, pageCount, names);
    const last = sessions[sessions.length - 1];
    const gapOk = last && e.startedAt.getTime() - last.endedAt <= SESSION_GAP_MS;
    // A private-only stretch between two stretches of the same session doesn't break it.
    const joins = gapOk && (reading.key === last.reading.key || reading.key === 'private');

    let s = joins ? last : null;
    if (!s) {
      s = {
        id: e.id, episodeIds: [], startedAt: e.startedAt.getTime(), endedAt: e.endedAt.getTime(),
        activeSeconds: 0, privateSeconds: 0, reading, modes: [], live: false, answered: true,
        focusScore: null, pages: [], basis: null, alongside: [], _visits: [], _focus: [0, 0],
      };
      sessions.push(s);
    }
    s.episodeIds.push(e.id);
    s.endedAt = Math.max(s.endedAt, e.endedAt.getTime());
    s.activeSeconds += e.activeSeconds;
    s.privateSeconds += e.privateSeconds;
    s.live = s.live || e.status === 'open';
    if (reading.key !== 'private') {
      s.answered = s.answered && !!e.verdict;
      // Least certain guess speaks for the session.
      if (reading.probability !== null && (s.reading.probability === null || reading.probability < s.reading.probability)) {
        s.reading = { ...s.reading, probability: reading.probability };
      }
    }
    const mode = e.verdictMode ?? e.activityMode;
    const pub = e.activeSeconds - e.privateSeconds;
    if (mode && pub > 0) {
      const m = s.modes.find((x) => x.mode === mode);
      if (m) { m.seconds += pub; m.yours = m.yours || !!e.verdictMode; }
      else s.modes.push({ mode, seconds: pub, yours: !!e.verdictMode });
    }
    if (e.focusScore !== null && pub > 0) { s._focus[0] += e.focusScore * pub; s._focus[1] += pub; }
    if (e.basis) {
      try {
        const b = JSON.parse(e.basis) as { notes: string[]; pastAnswers: number };
        s.basis = {
          notes: [...new Set([...(s.basis?.notes ?? []), ...b.notes])],
          pastAnswers: Math.max(s.basis?.pastAnswers ?? 0, b.pastAnswers),
        };
      } catch { /* old rows */ }
    }
    s._visits.push(...own);
  }

  return sessions.map(({ _visits, _focus, ...s }) => ({
    ...s,
    modes: s.modes.sort((a, b) => b.seconds - a.seconds),
    focusScore: _focus[1] > 0 ? Math.round(_focus[0] / _focus[1]) : null,
    pages: summarizePages(_visits, 8),
    answered: s.answered && s.reading.key !== 'unread',
  }));
}
