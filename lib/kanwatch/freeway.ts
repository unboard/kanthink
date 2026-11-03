/**
 * The Kanwatch Freeway: your days, one building each, along a road you drive down.
 *
 * Two reads. `freewayFor` is cheap and has no LLM in it: every day's size, what it
 * went into (the tiers of its building), the hours it was lit, and the billboards
 * between — each month's breakdown and the things you kept coming back to. A day's
 * board (`dayBoardFor`) is what you find inside its building: the day sorted into a
 * few columns of cards to process, written by Kan once and kept on the day.
 *
 * Only what Kanwatch already holds is used, read the way the day view reads it
 * (sessions.ts), so privacy.js stays the boundary: private time is counted, never
 * described.
 */

import { and, asc, desc, eq, gte, isNotNull, lt } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '@/lib/db';
import { cards, channels, columns, kanwatchDays, kanwatchEpisodes, kanwatchReads, users } from '@/lib/db/schema';
import { getLLMClientForUser } from '@/lib/ai/llm';
import { recordUsage } from '@/lib/usage';
import { loadAccess } from '@/lib/voice/resolveReference';
import { loadBoard } from './board';
import { localDate } from './episodes';
import { readingOf } from './sessions';
import { loadDaySessions, namesFor, type DayStory } from './story';

const DAY_MS = 86400_000;
/** How far back the road goes. */
const SPAN_DAYS = 120;

export interface FreewayTier { key: string; label: string; folder: string | null; minutes: number }
export interface FreewayDay {
  date: string;
  minutes: number;
  /** What the day went into, biggest first: the building's floors, bottom up. */
  tiers: FreewayTier[];
  /** The kind of work it mostly was: building, researching, learning… */
  mode: string | null;
  /** Active minutes in each hour of the day, 0–23. */
  hours: number[];
  headline: string | null;
  intention: string | null;
  board: { cards: number; sorted: number } | null;
}
export type Billboard =
  | { kind: 'month'; at: string; month: string; hours: number; days: number; top: { label: string; hours: number }[]; busiest: { date: string; hours: number } | null }
  | { kind: 'again'; at: string; label: string; days: number; hours: number; first: string; last: string }
  | { kind: 'read'; at: string; title: string; site: string | null; tldr: string; url: string };

const round1 = (n: number) => Math.round(n * 10) / 10;

export async function freewayFor(userId: string) {
  const since = new Date(Date.now() - SPAN_DAYS * DAY_MS);
  const [episodes, dayRows, reads] = await Promise.all([
    db.query.kanwatchEpisodes.findMany({
      where: and(eq(kanwatchEpisodes.userId, userId), gte(kanwatchEpisodes.startedAt, since)),
      columns: {
        id: true, startedAt: true, activeSeconds: true, privateSeconds: true, tzOffsetMinutes: true, guessKind: true, guessChannelId: true,
        guessCardId: true, guessLabel: true, guessProbability: true, verdict: true, verdictChannelId: true, verdictCardId: true, label: true,
        activityMode: true, verdictMode: true,
      },
      orderBy: [asc(kanwatchEpisodes.startedAt)],
    }),
    db.query.kanwatchDays.findMany({ where: eq(kanwatchDays.userId, userId), columns: { date: true, intention: true, story: true, board: true } }),
    db.query.kanwatchReads.findMany({
      where: and(eq(kanwatchReads.userId, userId), gte(kanwatchReads.lastSeenAt, since), isNotNull(kanwatchReads.tldr)),
      columns: { title: true, domain: true, tldr: true, url: true, worth: true, lastSeenAt: true, verdict: true },
      orderBy: [desc(kanwatchReads.worth)],
      limit: 40,
    }),
  ]);
  const names = await namesFor(userId, [...new Set(episodes.flatMap((e) => [e.guessCardId, e.verdictCardId]).filter((x): x is string => !!x))]);

  // Two channels called "Work" read as one; their folder tells them apart.
  const nameCount = new Map<string, number>();
  for (const c of names.channel.values()) nameCount.set(c.name, (nameCount.get(c.name) ?? 0) + 1);
  const dupNames = new Set([...nameCount].filter(([, n]) => n > 1).map(([n]) => n));

  type Acc = { minutes: number; tiers: Map<string, FreewayTier>; modes: Map<string, number>; hours: number[] };
  const byDay = new Map<string, Acc>();
  for (const e of episodes) {
    const tz = e.tzOffsetMinutes ?? 0;
    const date = localDate(+e.startedAt, tz);
    const acc = byDay.get(date) ?? { minutes: 0, tiers: new Map(), modes: new Map(), hours: Array(24).fill(0) };
    byDay.set(date, acc);
    const mins = e.activeSeconds / 60;
    acc.minutes += mins;
    acc.hours[new Date(+e.startedAt - tz * 60000).getUTCHours()] += mins;
    const pub = (e.activeSeconds - e.privateSeconds) / 60;
    // Private time adds to the day's size, but never says what it was.
    const r = readingOf(e as typeof kanwatchEpisodes.$inferSelect, pub > 0 ? 1 : 0, names);
    const key = r.key === 'unread' || r.key === 'unclear' ? 'other' : r.key;
    const label = key === 'other' ? 'Other' : r.channelName ? (r.folder && dupNames.has(r.channelName) ? `${r.folder} ${r.channelName}` : r.channelName) : r.label;
    const t = acc.tiers.get(key) ?? { key, label, folder: r.folder, minutes: 0 };
    t.minutes += mins;
    acc.tiers.set(key, t);
    const mode = e.verdictMode ?? e.activityMode;
    if (mode && pub > 0) acc.modes.set(mode, (acc.modes.get(mode) ?? 0) + pub);
  }

  const rowOf = new Map(dayRows.map((d) => [d.date, d]));
  const days: FreewayDay[] = [...byDay].sort(([a], [b]) => a.localeCompare(b)).map(([date, a]) => {
    const row = rowOf.get(date);
    const story = row?.story ? (JSON.parse(row.story) as DayStory) : null;
    const board = row?.board ? (JSON.parse(row.board) as DayBoard) : null;
    const tiers = [...a.tiers.values()].filter((t) => t.minutes >= 4).sort((x, y) => y.minutes - x.minutes);
    // Small pieces fold into one, so a building has a few clear floors.
    const kept = tiers.slice(0, 4);
    const rest = tiers.slice(4).reduce((n, t) => n + t.minutes, 0);
    if (rest >= 4) {
      const other = kept.find((t) => t.key === 'other');
      if (other) other.minutes += rest; else kept.push({ key: 'other', label: 'Other', folder: null, minutes: rest });
    }
    return {
      date,
      minutes: Math.round(a.minutes),
      tiers: kept.map((t) => ({ ...t, minutes: Math.round(t.minutes) })),
      mode: [...a.modes].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null,
      hours: a.hours.map((h) => Math.round(h)),
      headline: story?.headline ?? null,
      intention: row?.intention ?? null,
      board: board ? { cards: board.cards.length, sorted: board.cards.filter((c) => c.state !== 'open').length } : null,
    };
  }).filter((d) => d.minutes >= 10);

  return { days, billboards: billboardsFor(days, reads.filter((r) => r.verdict !== 'dismissed')) };
}

/**
 * What goes up beside the road: each month's breakdown where the month starts, and
 * between them the threads you kept returning to and the reads worth another look,
 * each standing by the day it belongs to. No more than one every few days, so they
 * stay worth reading.
 */
function billboardsFor(days: FreewayDay[], reads: { title: string | null; domain: string | null; tldr: string | null; url: string; worth: number | null; lastSeenAt: Date | null }[]): Billboard[] {
  const out: Billboard[] = [];
  const months = new Map<string, FreewayDay[]>();
  for (const d of days) months.set(d.date.slice(0, 7), [...(months.get(d.date.slice(0, 7)) ?? []), d]);
  for (const [m, list] of months) {
    const by = new Map<string, { label: string; minutes: number }>();
    for (const d of list) for (const t of d.tiers) {
      if (t.key === 'other' || t.key === 'private' || t.key === 'not_work') continue;
      const cur = by.get(t.key) ?? { label: t.label, minutes: 0 };
      cur.minutes += t.minutes;
      by.set(t.key, cur);
    }
    const busiest = [...list].sort((a, b) => b.minutes - a.minutes)[0];
    out.push({
      kind: 'month', at: list[0].date,
      month: new Date(`${m}-01T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
      hours: round1(list.reduce((n, d) => n + d.minutes, 0) / 60), days: list.length,
      top: [...by.values()].sort((a, b) => b.minutes - a.minutes).slice(0, 4).map((t) => ({ label: t.label, hours: round1(t.minutes / 60) })),
      busiest: busiest ? { date: busiest.date, hours: round1(busiest.minutes / 60) } : null,
    });
  }

  // Threads you came back to on many days, each placed on the day it last came up.
  const seen = new Map<string, { label: string; dates: string[]; minutes: number }>();
  for (const d of days) for (const t of d.tiers) {
    if (t.key === 'other' || t.key === 'private' || t.key === 'not_work') continue;
    const cur = seen.get(t.key) ?? { label: t.label, dates: [], minutes: 0 };
    cur.dates.push(d.date);
    cur.minutes += t.minutes;
    seen.set(t.key, cur);
  }
  const candidates: Billboard[] = [
    // Something on most days is just the job; coming back to it isn't news.
    ...[...seen.values()].filter((s) => s.dates.length >= 4 && s.dates.length <= days.length * 0.6).sort((a, b) => b.dates.length - a.dates.length).slice(0, 10).map((s) => ({
      kind: 'again' as const, at: s.dates[Math.floor(s.dates.length / 2)], label: s.label, days: s.dates.length, hours: round1(s.minutes / 60),
      first: s.dates[0], last: s.dates[s.dates.length - 1],
    })),
    ...reads.filter((r) => (r.worth ?? 0) >= 60 && r.tldr && r.lastSeenAt).slice(0, 10).map((r) => ({
      kind: 'read' as const, at: localDate(+r.lastSeenAt!, 0), title: r.title ?? r.url, site: r.domain, tldr: r.tldr!, url: r.url,
    })),
  ];
  // Spaced out: never two within three days of each other, nor on a month's first day.
  const index = new Map(days.map((d, i) => [d.date, i]));
  const taken = new Set(out.map((b) => index.get(b.at) ?? -99));
  for (const c of candidates.sort((a, b) => a.at.localeCompare(b.at))) {
    const i = nearestIndex(days, c.at);
    if (i < 0 || [...taken].some((t) => Math.abs(t - i) < 3)) continue;
    taken.add(i);
    out.push({ ...c, at: days[i].date });
  }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

function nearestIndex(days: FreewayDay[], date: string) {
  let best = -1, gap = Infinity;
  days.forEach((d, i) => { const g = Math.abs(Date.parse(d.date) - Date.parse(date)); if (g < gap) { gap = g; best = i; } });
  return gap <= 3 * DAY_MS ? best : -1;
}

// ---------- Inside a day ----------

export interface DayCard {
  id: string;
  columnId: string;
  title: string;
  body: string;
  kind: 'work' | 'read' | 'loose_end' | 'idea';
  minutes: number | null;
  /** Where Kan thinks it belongs, if anywhere. */
  channelId: string | null;
  url: string | null;
  state: 'open' | 'sent' | 'done' | 'dropped';
  sentTo?: { channelId: string; cardId: string; name: string };
  /** The column it came from, for putting it back. */
  home?: string;
}
export interface DayBoard {
  headline: string;
  columns: { id: string; name: string; hint: string }[];
  cards: DayCard[];
  writtenAt: number;
}
/** Where handled cards go, so a cleared day has one full room and the rest empty. */
export const SORTED = 'sorted';

function boundsOf(date: string, tz: number) {
  const from = Date.parse(`${date}T00:00:00Z`) + tz * 60000;
  return { from, to: from + DAY_MS };
}

/** The day's board, written once from the day and kept. */
export async function dayBoardFor(userId: string, date: string, opts: { refresh?: boolean } = {}): Promise<DayBoard | null> {
  const id = `${userId}:${date}`;
  const row = await db.query.kanwatchDays.findFirst({ where: eq(kanwatchDays.id, id) });
  if (row?.board && !opts.refresh) return JSON.parse(row.board) as DayBoard;

  const probe = await db.query.kanwatchEpisodes.findFirst({
    where: and(eq(kanwatchEpisodes.userId, userId), gte(kanwatchEpisodes.startedAt, new Date(Date.parse(`${date}T00:00:00Z`) - DAY_MS / 2))),
    columns: { tzOffsetMinutes: true },
    orderBy: [asc(kanwatchEpisodes.startedAt)],
  });
  const tz = probe?.tzOffsetMinutes ?? 0;
  const { from, to } = boundsOf(date, tz);
  const access = await loadAccess(userId);
  const [{ sessions }, board, reads, user] = await Promise.all([
    loadDaySessions(userId, from, to),
    loadBoard(userId, access),
    db.query.kanwatchReads.findMany({
      where: and(eq(kanwatchReads.userId, userId), gte(kanwatchReads.lastSeenAt, new Date(from)), lt(kanwatchReads.lastSeenAt, new Date(to)), isNotNull(kanwatchReads.tldr)),
      columns: { title: true, domain: true, tldr: true, url: true, nudge: true },
      orderBy: [desc(kanwatchReads.worth)],
      limit: 8,
    }),
    db.query.users.findFirst({ where: eq(users.id, userId), columns: { name: true } }),
  ]);
  const worth = sessions.filter((s) => s.activeSeconds - s.privateSeconds >= 90);
  if (worth.length === 0) return null;
  const story = row?.story ? (JSON.parse(row.story) as DayStory) : null;
  const minutes = (s: number) => Math.max(1, Math.round(s / 60));
  const writable = board.channels.filter((c) => access.writable.has(c.id));
  const input = {
    date,
    what_the_day_was_for: row?.intention || null,
    kans_read_of_the_day: story ? { headline: story.headline, threads: story.threads, loose_ends: story.looseEnds } : null,
    sessions: worth.map((s) => ({
      for: s.reading.label,
      channel_id: s.reading.key.startsWith('ch:') ? s.reading.key.slice(3) : null,
      minutes: minutes(s.activeSeconds - s.privateSeconds),
      doing: s.modes.map((m) => m.mode),
      pages: s.pages.slice(0, 6).map((p) => ({ site: p.site, title: p.title || undefined, searched: p.search || undefined, how: `${p.doing}, ${minutes(p.seconds)}m` })),
    })),
    reads_worth_a_look: reads.map((r) => ({ title: r.title, site: r.domain, url: r.url, tldr: r.tldr, nudge: r.nudge })),
    channels: writable.slice(0, 60).map((c) => ({ id: c.id, name: c.name, folder: c.folder, about: (c.description ?? '').slice(0, 120) || undefined })),
  };

  const firstName = user?.name?.split(/\s+/)[0] || 'them';
  let out: DayBoard | null = null;
  try {
    const { client, source } = await getLLMClientForUser(userId, undefined, 'automations');
    if (!client) return null;
    const ask = (extra: string) => client.complete([
      {
        role: 'system',
        content: extra +
          `You are Kan, turning one of ${firstName}'s days (as their browser saw it) into a small kanban board they can walk through and process: decide what to keep, send on to one of their channels, or let go. ` +
          'Make 2–4 columns named for this particular day (e.g. "MyPrintSite checkout", "Reading worth keeping", "Loose ends"), each with a one-line hint of what to do with its cards. Never a generic "To do / Done". ' +
          'Then 4–12 cards. Each is one concrete thing from the day: a piece of work (what got done or moved, named from page titles), a read worth keeping (with its url), a loose end (a search not followed up, a page returned to, something left half-done), or an idea the day suggests. ' +
          'Titles are short and specific. Bodies are 1–3 plain sentences in second person with the specifics (what, how long), never judgment or productivity advice. Never speculate about private time. ' +
          'For each card pick the channel it belongs in from `channels` (by id) when one clearly fits, else null. ' +
          'Reply with JSON only: {"headline": "one sentence on the day", "columns": [{"name": "...", "hint": "..."}], ' +
          '"cards": [{"column": <index into columns>, "title": "...", "body": "...", "kind": "work|read|loose_end|idea", "minutes": <number or null>, "channel_id": "<id or null>", "url": "<url or null>"}]}.',
      },
      { role: 'user', content: JSON.stringify(input) },
    ], { maxTokens: 6000 });
    let parsed = looseJson((await ask('')).content);
    if (source === 'owner') await recordUsage(userId, 'kanwatch');
    if (!parsed) parsed = looseJson((await ask('Your reply must be one valid JSON object: escape any double quotes inside strings. ')).content);
    if (parsed) {
      const raw = parsed as {
        headline?: string; columns?: { name?: string; hint?: string }[];
        cards?: { column?: number; title?: string; body?: string; kind?: string; minutes?: number | null; channel_id?: string | null; url?: string | null }[];
      };
      const cols = (raw.columns ?? []).slice(0, 4).map((c) => ({ id: nanoid(8), name: String(c.name ?? '').slice(0, 40) || 'The day', hint: String(c.hint ?? '').slice(0, 120) }));
      if (cols.length === 0) cols.push({ id: nanoid(8), name: 'The day', hint: 'What happened, to keep or let go' });
      const known = new Set(writable.map((c) => c.id));
      const urls = new Set(reads.map((r) => r.url));
      out = {
        headline: String(raw.headline ?? story?.headline ?? '').slice(0, 300),
        columns: [...cols, { id: SORTED, name: 'Sorted', hint: 'Sent on, done, or let go' }],
        cards: (raw.cards ?? []).slice(0, 12).filter((c) => c.title).map((c) => ({
          id: nanoid(10),
          columnId: cols[Math.min(cols.length - 1, Math.max(0, Math.round(Number(c.column) || 0)))].id,
          title: String(c.title).slice(0, 90),
          body: String(c.body ?? '').slice(0, 600),
          kind: (['work', 'read', 'loose_end', 'idea'].includes(String(c.kind)) ? c.kind : 'work') as DayCard['kind'],
          minutes: typeof c.minutes === 'number' && c.minutes > 0 ? Math.round(c.minutes) : null,
          channelId: c.channel_id && known.has(c.channel_id) ? c.channel_id : null,
          // Only links Kanwatch already has as public reads, never one made up.
          url: c.url && urls.has(c.url) ? c.url : null,
          state: 'open' as const,
        })),
        writtenAt: Date.now(),
      };
    }
  } catch (err) {
    console.warn('[freeway] day board failed', err instanceof Error ? err.message : err);
  }
  if (!out || out.cards.length === 0) return row?.board ? (JSON.parse(row.board) as DayBoard) : null;
  await saveBoard(userId, date, out);
  return out;
}

/** The JSON object in a reply, forgiving the trailing commas and smart quotes models slip in. */
function looseJson(text: string): unknown | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  for (const t of [m[0], m[0].replace(/,\s*([\]}])/g, '$1').replace(/[“”]/g, '\\"')]) {
    try { return JSON.parse(t); } catch { /* try the next */ }
  }
  return null;
}

async function saveBoard(userId: string, date: string, board: DayBoard) {
  const now = new Date();
  const json = JSON.stringify(board);
  await db.insert(kanwatchDays)
    .values({ id: `${userId}:${date}`, userId, date, board: json, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: kanwatchDays.id, set: { board: json, updatedAt: now } });
}

const DATE_WORDS = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });

/**
 * Handle a card: send it on to a channel (a real card there, in its first column),
 * mark it done, let it go, or put it back. Handled cards move to Sorted.
 */
export async function actOnDayCard(
  userId: string,
  date: string,
  cardId: string,
  action: 'send' | 'done' | 'drop' | 'reopen',
  channelId?: string,
): Promise<{ board: DayBoard } | { error: string }> {
  const row = await db.query.kanwatchDays.findFirst({ where: eq(kanwatchDays.id, `${userId}:${date}`), columns: { board: true } });
  if (!row?.board) return { error: 'That day has no board yet.' };
  const board = JSON.parse(row.board) as DayBoard;
  const card = board.cards.find((c) => c.id === cardId);
  if (!card) return { error: 'That card isn’t here anymore.' };

  if (action === 'reopen') {
    card.state = 'open';
    card.columnId = card.home ?? board.columns[0].id;
    delete card.sentTo;
  } else {
    if (action === 'send') {
      const to = channelId ?? card.channelId;
      if (!to) return { error: 'Pick a channel to send it to.' };
      const access = await loadAccess(userId);
      if (!access.writable.has(to)) return { error: 'You can’t add cards there.' };
      const [ch, first] = await Promise.all([
        db.query.channels.findFirst({ where: eq(channels.id, to), columns: { name: true } }),
        db.query.columns.findFirst({ where: eq(columns.channelId, to), orderBy: [asc(columns.position)], columns: { id: true } }),
      ]);
      if (!ch || !first) return { error: 'That channel has no columns to put it in.' };
      const top = await db.query.cards.findFirst({ where: and(eq(cards.columnId, first.id), eq(cards.isArchived, false)), orderBy: [asc(cards.position)], columns: { position: true } });
      const user = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { name: true, image: true } });
      const id = nanoid();
      const now = new Date();
      const body = [card.body, card.url ? `[${card.url}](${card.url})` : '', `_From your day on ${DATE_WORDS(date)}, on the Kanwatch Freeway._`].filter(Boolean).join('\n\n');
      await db.insert(cards).values({
        id, channelId: to, columnId: first.id, title: card.title, position: (top?.position ?? 0) - 1, source: 'manual',
        messages: [{ id: nanoid(), type: 'note', content: body, authorId: userId, authorName: user?.name ?? 'You', authorImage: user?.image ?? undefined, createdAt: now.toISOString() }] as never,
        createdAt: now, updatedAt: now,
      });
      card.sentTo = { channelId: to, cardId: id, name: ch.name };
    }
    if (card.columnId !== SORTED) card.home = card.columnId;
    card.state = action === 'send' ? 'sent' : action === 'done' ? 'done' : 'dropped';
    card.columnId = SORTED;
  }
  await saveBoard(userId, date, board);
  return { board };
}
