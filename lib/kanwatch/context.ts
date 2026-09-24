/**
 * What Kan knows about your browsing, in conversation.
 *
 * Voice and text chat get a short summary of the day — what it's for, where the time
 * went, what you're on right now, and the pages that were worth a look — plus rules
 * for how to hold it. The rules matter more than the data: this is the most personal
 * thing Kan knows, so it is background, like a colleague who knows how your day has
 * gone. It is never a monitor, never a scold, and never raised just because it's there.
 *
 * Admin-only while Kanwatch is, and empty for anyone with no Kanwatch data.
 */

import { and, desc, eq, gte, inArray, isNotNull, like, lt, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { cards, channels, kanwatchDays, kanwatchEpisodes, kanwatchReads, kanwatchSites, kanwatchVisits, playgroundApps } from '@/lib/db/schema';
import { loadAccess } from '@/lib/voice/resolveReference';
import { summarizePages } from './judge';
import { localDate } from './episodes';

const DAY_MS = 86400000;

const MODE_WORDS: Record<string, string> = {
  building: 'building', researching: 'researching', learning: 'learning', communicating: 'communicating',
  planning: 'planning', admin: 'admin', entertainment: 'entertainment', shopping: 'shopping', news_social: 'news and social',
};

function spoken(seconds: number): string {
  const m = Math.round(seconds / 60);
  if (m < 2) return 'a minute or so';
  if (m < 55) return `${m} minutes`;
  const h = Math.round((m / 60) * 2) / 2;
  return `${h === 1 ? 'an hour' : `${h} hours`}`;
}

/** The browser's offset, as recorded on the user's most recent episode. */
async function recentOffset(userId: string): Promise<number | null | undefined> {
  const latest = await db.query.kanwatchEpisodes.findFirst({
    where: and(eq(kanwatchEpisodes.userId, userId), gte(kanwatchEpisodes.startedAt, new Date(Date.now() - 7 * DAY_MS))),
    orderBy: [desc(kanwatchEpisodes.startedAt)],
    columns: { tzOffsetMinutes: true },
  });
  return latest ? latest.tzOffsetMinutes ?? 0 : undefined;
}

/** Local-day bounds (ms) for a YYYY-MM-DD date in the given browser offset. */
function boundsOf(date: string, tz: number): { from: number; to: number } {
  const [y, m, d] = date.split('-').map(Number);
  const from = Date.UTC(y, m - 1, d) + tz * 60000;
  return { from, to: from + DAY_MS };
}

interface DaySummary {
  date: string;
  intention: string | null;
  activeSeconds: number;
  privateSeconds: number;
  notWorkSeconds: number;
  areas: { name: string; seconds: number }[];
  modes: { mode: string; seconds: number }[];
  now: { area: string | null; mode: string | null; pages: string[] } | null;
  stretches: { from: number; to: number; area: string; pages: string[] }[];
  worth: { title: string; site: string; tldr: string; nudge: string | null; answered: boolean; appIdea: boolean; relatedApp: string | null; built: boolean }[];
  wants: { site: string; want: string; seconds: number }[];
}

async function summarizeDay(userId: string, date: string, tz: number): Promise<DaySummary | null> {
  const { from, to } = boundsOf(date, tz);
  const episodes = await db.query.kanwatchEpisodes.findMany({
    where: and(
      eq(kanwatchEpisodes.userId, userId),
      gte(kanwatchEpisodes.startedAt, new Date(from)),
      lt(kanwatchEpisodes.startedAt, new Date(to)),
    ),
    orderBy: [kanwatchEpisodes.startedAt],
  });
  if (episodes.length === 0) return null;

  const access = await loadAccess(userId);
  const cardIds = [...new Set(episodes.flatMap((e) => [e.guessCardId, e.verdictCardId]).filter((x): x is string => !!x))];
  const [channelRows, cardRows, day, visits, reads, siteRows] = await Promise.all([
    access.readable.length
      ? db.query.channels.findMany({ where: inArray(channels.id, access.readable), columns: { id: true, name: true } })
      : Promise.resolve([]),
    cardIds.length && access.readable.length
      ? db.query.cards.findMany({ where: and(inArray(cards.id, cardIds), inArray(cards.channelId, access.readable)), columns: { id: true, title: true } })
      : Promise.resolve([]),
    db.query.kanwatchDays.findFirst({ where: eq(kanwatchDays.id, `${userId}:${date}`) }),
    db.query.kanwatchVisits.findMany({ where: inArray(kanwatchVisits.episodeId, episodes.map((e) => e.id)) }),
    db.query.kanwatchReads.findMany({
      where: and(
        eq(kanwatchReads.userId, userId),
        gte(kanwatchReads.lastSeenAt, new Date(from)),
        lt(kanwatchReads.lastSeenAt, new Date(to)),
        isNotNull(kanwatchReads.tldr),
      ),
      columns: { text: false },
      orderBy: [desc(kanwatchReads.lastSeenAt)],
      limit: 6,
    }),
    db.query.kanwatchSites.findMany({ where: and(eq(kanwatchSites.userId, userId), isNotNull(kanwatchSites.want)) }),
  ]);
  const channelName = new Map(channelRows.map((c) => [c.id, c.name]));
  const cardTitle = new Map(cardRows.map((c) => [c.id, c.title]));
  const relatedIds = [...new Set(reads.map((r) => r.relatedAppId).filter((x): x is string => !!x))];
  const appTitles = new Map(
    (relatedIds.length
      ? await db.query.playgroundApps.findMany({ where: inArray(playgroundApps.id, relatedIds), columns: { id: true, title: true } })
      : []
    ).map((a) => [a.id, a.title]),
  );

  const areaOf = (e: (typeof episodes)[number]): string | null => {
    if (e.verdict === 'not_work' || (!e.verdict && e.guessKind === 'not_work')) return 'not work';
    const chan = e.verdict ? e.verdictChannelId : e.guessChannelId;
    const card = e.verdict ? e.verdictCardId : e.guessCardId;
    if (card && cardTitle.has(card)) return `${channelName.get(chan ?? '') ?? 'a channel'} › ${cardTitle.get(card)}`;
    if (chan && channelName.has(chan)) return channelName.get(chan)!;
    if (e.verdict && e.label) return e.label;
    if (!e.verdict && e.guessKind === 'area' && e.guessLabel) return e.guessLabel;
    if (e.guessKind === 'new_work') return 'something new (not on any board yet)';
    return null;
  };

  const areas = new Map<string, number>();
  const modes = new Map<string, number>();
  let active = 0, priv = 0, notWork = 0;
  for (const e of episodes) {
    active += e.activeSeconds;
    priv += e.privateSeconds;
    const pub = e.activeSeconds - e.privateSeconds;
    const area = areaOf(e);
    if (area === 'not work') notWork += pub;
    else if (area && pub > 0) areas.set(area.split(' › ')[0], (areas.get(area.split(' › ')[0]) ?? 0) + pub);
    const mode = e.verdictMode ?? e.activityMode;
    if (mode && pub > 0) modes.set(mode, (modes.get(mode) ?? 0) + pub);
  }

  const pagesOf = (id: string, n: number) =>
    summarizePages(visits.filter((v) => v.episodeId === id), n).map((p) => (p.title ? `${p.title} (${p.site})` : p.site));

  const open = episodes.find((e) => e.status === 'open' && Date.now() - e.endedAt.getTime() < 10 * 60000);

  const siteSeconds = new Map<string, number>();
  for (const v of visits) if (!v.isPrivate && v.domain) siteSeconds.set(v.domain, (siteSeconds.get(v.domain) ?? 0) + v.activeSeconds);

  return {
    date,
    intention: day?.intention || null,
    activeSeconds: active,
    privateSeconds: priv,
    notWorkSeconds: notWork,
    areas: [...areas.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, seconds]) => ({ name, seconds })),
    modes: [...modes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([mode, seconds]) => ({ mode, seconds })),
    now: open ? { area: areaOf(open), mode: open.verdictMode ?? open.activityMode, pages: pagesOf(open.id, 2) } : null,
    stretches: episodes
      .filter((e) => e.activeSeconds - e.privateSeconds >= 120)
      .map((e) => ({ from: e.startedAt.getTime(), to: e.endedAt.getTime(), area: areaOf(e) ?? 'unclear', pages: pagesOf(e.id, 2) })),
    worth: reads.filter((r) => r.verdict !== 'dismissed').map((r) => ({
      title: r.title || r.url,
      site: r.domain ?? '',
      tldr: (r.tldr ?? '').slice(0, 260),
      nudge: r.nudge,
      answered: !!(r.reflection || r.verdict),
      appIdea: r.nudgeKind === 'app',
      relatedApp: r.relatedAppId ? appTitles.get(r.relatedAppId) ?? null : null,
      built: !!r.appId,
    })),
    wants: siteRows
      .map((s) => ({ site: s.domain, want: s.want!, seconds: siteSeconds.get(s.domain) ?? 0 }))
      .filter((s) => s.want !== 'right' && s.seconds >= 10 * 60),
  };
}

function clockAt(ms: number, tz: number): string {
  const d = new Date(ms - tz * 60000);
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')}${h < 12 ? 'am' : 'pm'}`;
}

function describeDay(s: DaySummary, label: string, tz: number, detail: boolean): string {
  const lines: string[] = [];
  lines.push(`${label} (${s.date}):`);
  lines.push(`- What the day is for, in their words: ${s.intention ? `"${s.intention}"` : 'not set'}`);
  lines.push(`- Active in the browser: ${spoken(s.activeSeconds)}${s.privateSeconds ? `, of which ${spoken(s.privateSeconds)} private (time only — nothing is known about it)` : ''}${s.notWorkSeconds ? `; ${spoken(s.notWorkSeconds)} was not work` : ''}.`);
  if (s.areas.length) lines.push(`- Where the work time went: ${s.areas.map((a) => `${a.name} (${spoken(a.seconds)})`).join(', ')}.`);
  if (s.modes.length) lines.push(`- Mostly: ${s.modes.map((m) => MODE_WORDS[m.mode] ?? m.mode).join(', ')}.`);
  if (s.now) lines.push(`- Right now: ${s.now.area ?? 'unclear'}${s.now.mode ? `, ${MODE_WORDS[s.now.mode] ?? s.now.mode}` : ''}${s.now.pages.length ? ` — ${s.now.pages.join('; ')}` : ''}.`);
  if (s.wants.length) lines.push(`- Sites they said they want ${s.wants.map((w) => `${w.want} of: ${w.site} (${spoken(w.seconds)} today)`).join('; ')}.`);
  if (detail && s.stretches.length) {
    lines.push('- Stretches of the day:');
    for (const st of s.stretches.slice(-12)) lines.push(`  - ${clockAt(st.from, tz)}–${clockAt(st.to, tz)}: ${st.area}${st.pages.length ? ` — ${st.pages.join('; ')}` : ''}`);
  }
  if (s.worth.length) {
    lines.push('- Pages they read that Kanwatch flagged as worth a look:');
    for (const w of s.worth) {
      const app = w.appIdea
        ? w.built
          ? ' [App idea — already being built.]'
          : ` [App idea${w.relatedApp ? `; it could fit their existing "${w.relatedApp}" app` : '; new, no overlap with their apps'}.]`
        : '';
      lines.push(`  - "${w.title}" (${w.site}): ${w.tldr}${app}${w.nudge ? ` Open question for them: ${w.nudge}${w.answered ? ' (they have already responded)' : ''}` : ''}`);
    }
  }
  return lines.join('\n');
}

export const KANWATCH_RULES = `This is background, like a colleague who knows how the user's day has gone. Use it to be more helpful, never to monitor them.

DO NOT:
- Open a conversation or a reply with it, recite it, or summarise their day unasked.
- Comment on how they spent their time, focus, or distraction unless they ask. Never judge, scold or praise their habits.
- Guess, ask about, or hint at what their private time was. Only its total is known.
- Mention a flagged page or its open question just because it is here.

DO use it:
- When they ask about their day, what they worked on, where time went, or how focused they were — answer plainly and kindly, in their own terms (their stated intention, their channels).
- When they ask what to work on next — weigh what the day is for against what they have already done.
- When they refer to something they read or watched ("that thread about agents", "the video earlier") — you know it from here.
- When the conversation is already on a subject one of the flagged pages covers — you may mention that page once, briefly, as something they read.
- If they ask whether you have anything for them, the open questions on flagged pages are what to offer.

ONE EXCEPTION, for app ideas they want to hear about:
- If a flagged page is marked as an app idea and has not been answered or built, you may offer it once in a conversation, on your own initiative — at a natural pause, or when they are open to ideas. Never as your opening line, and never twice.
- Offer it as a question: what the app would be, and whether it fits one of their existing apps or would be new. If they say yes, use __BUILD__ (new app, or add to the existing one).`;

/**
 * The Kanwatch block for a system prompt, or '' when there is nothing to say.
 * `lookup` names the tool or action the model can use for more.
 */
export async function buildKanwatchContext(
  userId: string,
  opts: { tzOffsetMinutes?: number | null; lookup: string; build: string },
): Promise<string> {
  const recorded = await recentOffset(userId);
  if (recorded === undefined) return ''; // no Kanwatch activity this week
  const tz = opts.tzOffsetMinutes ?? recorded ?? 0;
  const today = localDate(Date.now(), tz);
  const summary = await summarizeDay(userId, today, tz);

  const body = summary
    ? describeDay(summary, 'Today', tz, false)
    : 'Today: nothing recorded yet.';

  return `\n\n## KANWATCH — the user's day in their browser (private; reference only)

${KANWATCH_RULES.replace('__BUILD__', opts.build)}

For anything not below — another day, the stretches of a day in detail, or finding a page they read by topic — use ${opts.lookup}.

${body}`;
}

/**
 * The lookup behind the voice tool and the text action: one day in detail, or pages
 * read on a topic in the last 30 days.
 */
export async function kanwatchLookup(userId: string, args: { date?: string; query?: string; tzOffsetMinutes?: number | null }): Promise<string> {
  const recorded = await recentOffset(userId);
  const tz = args.tzOffsetMinutes ?? recorded ?? 0;

  const query = (args.query ?? '').trim().slice(0, 80);
  if (query) {
    const words = query.split(/\s+/).filter((w) => w.length >= 3).slice(0, 5);
    const matches = words.length
      ? await db.query.kanwatchReads.findMany({
          where: and(
            eq(kanwatchReads.userId, userId),
            gte(kanwatchReads.lastSeenAt, new Date(Date.now() - 30 * DAY_MS)),
            or(...words.flatMap((w) => [
              like(kanwatchReads.title, `%${w}%`),
              like(kanwatchReads.tldr, `%${w}%`),
              like(kanwatchReads.domain, `%${w}%`),
            ])),
          ),
          columns: { text: false },
          orderBy: [desc(kanwatchReads.lastSeenAt)],
          limit: 8,
        })
      : [];
    if (matches.length === 0) return `No pages matching "${query}" in the last 30 days of Kanwatch.`;
    return `Pages matching "${query}" from the last 30 days:\n` + matches.map((r) => {
      const when = r.lastSeenAt ? localDate(r.lastSeenAt.getTime(), tz) : '';
      return `- "${r.title || r.url}" (${r.domain}, ${when})${r.tldr ? `: ${r.tldr}` : ''}${r.reflection ? ` Their take: ${r.reflection}` : ''}`;
    }).join('\n');
  }

  const today = localDate(Date.now(), tz);
  const raw = (args.date ?? 'today').trim().toLowerCase();
  const date = raw === 'today' ? today
    : raw === 'yesterday' ? localDate(Date.now() - DAY_MS, tz)
    : /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw
    : today;
  const summary = await summarizeDay(userId, date, tz);
  if (!summary) return `Kanwatch has nothing recorded for ${date}.`;
  return describeDay(summary, date === today ? 'Today' : date, tz, true);
}
