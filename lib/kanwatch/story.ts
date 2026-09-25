/**
 * Kan's read on your day: what the browsing adds up to, in words.
 *
 * Chrome history can say which pages you opened. What it can't say is what the day
 * was: the main threads of work, how much real attention each got, what you read
 * that mattered, and what looks unfinished. That is what this writes, from the
 * sessions Kanwatch already understands, in one LLM call — plus a one-line summary
 * for each session, so the list below reads as things you did, not URLs you visited.
 *
 * Cached on the day. Rewritten when the day has changed and the last one is over ten
 * minutes old, or when you ask.
 */

import { and, desc, eq, gte, inArray, isNotNull, lt } from 'drizzle-orm';
import { db } from '@/lib/db';
import { cards, kanwatchDays, kanwatchEpisodes, kanwatchReads, kanwatchVisits, users } from '@/lib/db/schema';
import { getLLMClientForUser } from '@/lib/ai/llm';
import { recordUsage } from '@/lib/usage';
import { loadAccess } from '@/lib/voice/resolveReference';
import { loadBoard } from './board';
import { groupSessions, type Names, type Session } from './sessions';

const REWRITE_AFTER_MS = 10 * 60 * 1000;

export interface DayStory {
  headline: string;
  threads: { title: string; detail: string }[];
  looseEnds: string[];
  /** session id → one line on what you did in it */
  sessions: Record<string, string>;
  writtenAt: number;
  /** The day has moved on since this was written. */
  stale?: boolean;
}

function fnv(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16);
}

/** The names a day's readings need: channels with their folders, and cards. */
export async function namesFor(userId: string, cardIds: string[]): Promise<Names> {
  const access = await loadAccess(userId);
  const board = await loadBoard(userId, access);
  const cardRows = cardIds.length && access.readable.length
    ? await db.query.cards.findMany({ where: and(inArray(cards.id, cardIds), inArray(cards.channelId, access.readable)), columns: { id: true, title: true } })
    : [];
  return {
    channel: new Map(board.channels.map((c) => [c.id, { name: c.name, folder: c.folder }])),
    card: new Map(cardRows.map((c) => [c.id, c.title])),
  };
}

export async function loadDaySessions(userId: string, from: number, to: number) {
  const episodes = await db.query.kanwatchEpisodes.findMany({
    where: and(
      eq(kanwatchEpisodes.userId, userId),
      gte(kanwatchEpisodes.startedAt, new Date(from)),
      lt(kanwatchEpisodes.startedAt, new Date(to)),
    ),
  });
  const visits = episodes.length
    ? await db.query.kanwatchVisits.findMany({ where: inArray(kanwatchVisits.episodeId, episodes.map((e) => e.id)) })
    : [];
  const cardIds = [...new Set(episodes.flatMap((e) => [e.guessCardId, e.verdictCardId]).filter((x): x is string => !!x))];
  const names = await namesFor(userId, cardIds);
  return { episodes, visits, names, sessions: groupSessions(episodes, visits, names) };
}

function clockAt(ms: number, tz: number): string {
  const d = new Date(ms - tz * 60000);
  const h = d.getUTCHours();
  return `${((h + 11) % 12) + 1}:${String(d.getUTCMinutes()).padStart(2, '0')}${h < 12 ? 'am' : 'pm'}`;
}

function minutes(s: number): string {
  const m = Math.max(1, Math.round(s / 60));
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

export async function storyFor(
  userId: string,
  date: string,
  from: number,
  to: number,
  opts: { refresh?: boolean } = {},
): Promise<DayStory | null> {
  const [{ episodes, sessions }, day, reads, user] = await Promise.all([
    loadDaySessions(userId, from, to),
    db.query.kanwatchDays.findFirst({ where: eq(kanwatchDays.id, `${userId}:${date}`) }),
    db.query.kanwatchReads.findMany({
      where: and(
        eq(kanwatchReads.userId, userId),
        gte(kanwatchReads.lastSeenAt, new Date(from)),
        lt(kanwatchReads.lastSeenAt, new Date(to)),
        isNotNull(kanwatchReads.tldr),
      ),
      columns: { id: true, title: true, domain: true, tldr: true, nudgeKind: true },
      orderBy: [desc(kanwatchReads.lastSeenAt)],
      limit: 6,
    }),
    db.query.users.findFirst({ where: eq(users.id, userId), columns: { name: true } }),
  ]);

  const worthTelling = sessions.filter((s) => s.activeSeconds - s.privateSeconds >= 90);
  if (worthTelling.length === 0) return null;

  const signature = fnv([
    day?.intention ?? '',
    ...sessions.map((s) => `${s.id}:${s.endedAt}:${s.reading.key}:${s.answered}`),
    ...reads.map((r) => r.id),
  ].join('|'));

  const cached = day?.story ? (JSON.parse(day.story) as DayStory) : null;
  const writtenAt = day?.storyAt?.getTime() ?? 0;
  if (cached && !opts.refresh) {
    if (day?.storySig === signature) return cached;
    if (Date.now() - writtenAt < REWRITE_AFTER_MS) return { ...cached, stale: true };
  }

  const tz = episodes[0]?.tzOffsetMinutes ?? 0;
  const firstName = user?.name?.split(/\s+/)[0] || 'them';
  const input = {
    what_the_day_was_for: day?.intention || null,
    sessions: worthTelling.map((s: Session) => ({
      id: s.id,
      when: `${clockAt(s.startedAt, tz)}–${clockAt(s.endedAt, tz)}`,
      active: minutes(s.activeSeconds - s.privateSeconds),
      for: s.reading.label,
      doing: s.modes.map((m) => m.mode),
      pages: s.pages.slice(0, 6).map((p) => ({
        site: p.site,
        title: p.title || undefined,
        searched: p.search || undefined,
        how: `${p.doing}, ${minutes(p.seconds)}`,
      })),
    })),
    private_time: minutes(sessions.reduce((n, s) => n + s.privateSeconds, 0)),
    pages_worth_a_look: reads.map((r) => ({ title: r.title, site: r.domain, tldr: r.tldr, app_idea: r.nudgeKind === 'app' || undefined })),
  };

  let story: DayStory | null = null;
  try {
    const { client, source } = await getLLMClientForUser(userId, undefined, 'automations');
    if (!client) return cached;
    const res = await client.complete([
      {
        role: 'system',
        content:
          `You are Kan, writing ${firstName}'s own record of their day from what their browser saw. Second person, plain, specific. ` +
          'Say what the time actually went into — name the real work from page titles (e.g. "print orders in MCS Admin"), not just sites. ' +
          'Rules: no judgment, praise or productivity advice; never speculate about private time; only mention what the day was for as a plain comparison, if it was set. ' +
          'Loose ends must be concrete and drawn from the data (a page they kept returning to, a search they did not follow up, a long read that ended abruptly) — or none. ' +
          'Reply with JSON only: {"headline": "one sentence on the day", ' +
          '"threads": [{"title": "2–5 words", "detail": "one sentence with the specifics and time"}] (2–4 of them, largest first), ' +
          '"loose_ends": ["short sentence"] (0–2), ' +
          '"sessions": {"<session id>": "one line on what they did in that session, under 14 words, no time or site names unless essential"}}.',
      },
      { role: 'user', content: JSON.stringify(input) },
    ]);
    if (source === 'owner') await recordUsage(userId, 'kanwatch');
    const match = res.content.match(/\{[\s\S]*\}/);
    if (match) {
      const raw = JSON.parse(match[0]) as { headline?: string; threads?: { title?: string; detail?: string }[]; loose_ends?: string[]; sessions?: Record<string, string> };
      story = {
        headline: String(raw.headline ?? '').slice(0, 300),
        threads: (raw.threads ?? []).slice(0, 4).map((t) => ({ title: String(t.title ?? '').slice(0, 60), detail: String(t.detail ?? '').slice(0, 300) })),
        looseEnds: (raw.loose_ends ?? []).slice(0, 2).map((l) => String(l).slice(0, 200)),
        sessions: Object.fromEntries(Object.entries(raw.sessions ?? {}).map(([k, v]) => [k, String(v).slice(0, 160)])),
        writtenAt: Date.now(),
      };
    }
  } catch (err) {
    console.warn('[kanwatch] day story failed', err instanceof Error ? err.message : err);
  }
  if (!story) return cached;

  const now = new Date();
  await db.insert(kanwatchDays)
    .values({ id: `${userId}:${date}`, userId, date, story: JSON.stringify(story), storySig: signature, storyAt: now, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: kanwatchDays.id, set: { story: JSON.stringify(story), storySig: signature, storyAt: now, updatedAt: now } });
  return story;
}
