import { NextResponse } from 'next/server';
import { and, asc, desc, eq, gte, inArray, isNull, lt, ne } from 'drizzle-orm';
import { db } from '@/lib/db';
import { cards, channels, kanwatchDays, kanwatchEpisodes, kanwatchReads, kanwatchSites, kanwatchTokens, kanwatchVisits } from '@/lib/db/schema';
import { judgePendingReads } from '@/lib/kanwatch/reads';
import { kanwatchUser } from '@/lib/kanwatch/access';
import { closeStaleEpisodes } from '@/lib/kanwatch/ingest';
import { judgePending, summarizePages } from '@/lib/kanwatch/judge';
import { loadAccess } from '@/lib/voice/resolveReference';

const DAY_MS = 86400000;
const isDate = (d: string | null): d is string => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d);

/**
 * GET /api/kanwatch/day?date=YYYY-MM-DD&from=<ms>&to=<ms>
 *
 * One local day: its episodes (with pages and Jev's read), the intention, time per
 * site with your notes on each, and the six days before it for the week strip.
 * `from`/`to` are the day's bounds in the browser's own timezone.
 */
export async function GET(request: Request) {
  const userId = await kanwatchUser();
  if (!userId) return NextResponse.json({ error: 'Not available' }, { status: 403 });

  const url = new URL(request.url);
  const date = url.searchParams.get('date');
  const from = Number(url.searchParams.get('from'));
  const to = Number(url.searchParams.get('to'));
  if (!isDate(date) || !Number.isFinite(from) || !Number.isFinite(to) || to <= from || to - from > 2 * DAY_MS) {
    return NextResponse.json({ error: 'Bad range' }, { status: 400 });
  }

  // Bring the day up to date before showing it.
  await closeStaleEpisodes(userId);
  await Promise.all([judgePending(userId, 12), judgePendingReads(userId, 6)]);

  const [episodes, day, token, week] = await Promise.all([
    db.query.kanwatchEpisodes.findMany({
      where: and(
        eq(kanwatchEpisodes.userId, userId),
        gte(kanwatchEpisodes.startedAt, new Date(from)),
        lt(kanwatchEpisodes.startedAt, new Date(to)),
      ),
      orderBy: [asc(kanwatchEpisodes.startedAt)],
    }),
    db.query.kanwatchDays.findFirst({ where: eq(kanwatchDays.id, `${userId}:${date}`) }),
    db.query.kanwatchTokens.findFirst({
      where: and(eq(kanwatchTokens.userId, userId), isNull(kanwatchTokens.revokedAt)),
      orderBy: [desc(kanwatchTokens.createdAt)],
    }),
    db.query.kanwatchEpisodes.findMany({
      where: and(
        eq(kanwatchEpisodes.userId, userId),
        gte(kanwatchEpisodes.startedAt, new Date(from - 6 * DAY_MS)),
        lt(kanwatchEpisodes.startedAt, new Date(to)),
      ),
      columns: { startedAt: true, activeSeconds: true, privateSeconds: true, guessKind: true, verdict: true },
    }),
  ]);

  // Public pages read today. The page text itself is never sent to the browser.
  const reads = await db.query.kanwatchReads.findMany({
    where: and(
      eq(kanwatchReads.userId, userId),
      gte(kanwatchReads.lastSeenAt, new Date(from)),
      lt(kanwatchReads.lastSeenAt, new Date(to)),
    ),
    columns: { text: false },
    orderBy: [desc(kanwatchReads.lastSeenAt)],
  });

  const visits = episodes.length
    ? await db.query.kanwatchVisits.findMany({ where: inArray(kanwatchVisits.episodeId, episodes.map((e) => e.id)) })
    : [];

  // Names for everything Jev or the user pointed at — only if the user can still reach it.
  const access = await loadAccess(userId);
  const [channelRows, cardRows] = await Promise.all([
    access.readable.length
      ? db.query.channels.findMany({
          where: inArray(channels.id, access.readable),
          columns: { id: true, name: true },
          orderBy: [asc(channels.name)],
        })
      : Promise.resolve([]),
    (() => {
      const ids = [...new Set(episodes.flatMap((e) => [e.guessCardId, e.verdictCardId]).filter((x): x is string => !!x))];
      return ids.length && access.readable.length
        ? db.query.cards.findMany({
            where: and(inArray(cards.id, ids), inArray(cards.channelId, access.readable)),
            columns: { id: true, title: true, channelId: true },
          })
        : Promise.resolve([]);
    })(),
  ]);
  const channelName = new Map(channelRows.map((c) => [c.id, c.name]));
  const cardTitle = new Map(cardRows.map((c) => [c.id, c.title]));

  // Time per site across the day, for the sites panel.
  const siteSeconds = new Map<string, number>();
  for (const v of visits) {
    if (v.isPrivate || !v.domain) continue;
    siteSeconds.set(v.domain, (siteSeconds.get(v.domain) ?? 0) + v.activeSeconds);
  }
  const topSites = [...siteSeconds.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);

  // Kan's read on each site, from the episodes it appeared in: your answers first,
  // then Jev's reads. Shown as a hint where you haven't described the site yourself.
  const episodeSites = new Map(episodes.map((e) => [e.id, new Set(visits.filter((v) => v.episodeId === e.id && v.domain).map((v) => v.domain!))]));
  const readOf = (e: (typeof episodes)[number]): string | null => {
    if (e.verdict === 'not_work') return 'Not work';
    if (e.verdict) return (e.verdictCardId && cardTitle.get(e.verdictCardId)) || (e.verdictChannelId && channelName.get(e.verdictChannelId)) || e.label || null;
    if (e.guessKind === 'not_work') return 'Not work';
    if (e.guessKind === 'area') return e.guessLabel;
    if (e.guessKind === 'channel' || e.guessKind === 'card') {
      return (e.guessCardId && cardTitle.get(e.guessCardId)) || (e.guessChannelId && channelName.get(e.guessChannelId)) || null;
    }
    return null;
  };
  const kanThinks = (domain: string): string | null => {
    const counts = new Map<string, number>();
    for (const e of episodes) {
      if (!episodeSites.get(e.id)?.has(domain)) continue;
      const read = readOf(e);
      if (read) counts.set(read, (counts.get(read) ?? 0) + (e.verdict ? 3 : 1));
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  };
  const siteNotes = topSites.length
    ? await db.query.kanwatchSites.findMany({
        where: and(eq(kanwatchSites.userId, userId), inArray(kanwatchSites.domain, topSites.map(([d]) => d))),
      })
    : [];

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const start = from - (6 - i) * DAY_MS;
    const inDay = week.filter((e) => e.startedAt.getTime() >= start && e.startedAt.getTime() < start + DAY_MS);
    const sum = (pred: (e: (typeof week)[number]) => boolean) =>
      inDay.filter(pred).reduce((s, e) => s + e.activeSeconds, 0);
    const notWork = (e: (typeof week)[number]) => e.verdict === 'not_work' || (!e.verdict && e.guessKind === 'not_work');
    return {
      start,
      activeSeconds: sum(() => true),
      notWorkSeconds: sum(notWork),
      privateSeconds: inDay.reduce((s, e) => s + e.privateSeconds, 0),
    };
  });

  return NextResponse.json({
    date,
    intention: day?.intention ?? '',
    extension: token
      ? {
          connected: true,
          lastSeenAt: token.lastUsedAt?.getTime() ?? null,
          // The extension uploads every minute while you browse; quiet for 5 means it isn't.
          fresh: !!token.lastUsedAt && Date.now() - token.lastUsedAt.getTime() < 5 * 60 * 1000,
        }
      : { connected: false },
    channels: channelRows,
    // Areas the user has named before, offered when they correct a stretch.
    areas: await (async () => {
      const rows = await db.query.kanwatchEpisodes.findMany({
        where: and(eq(kanwatchEpisodes.userId, userId), eq(kanwatchEpisodes.verdict, 'corrected')),
        columns: { label: true },
        orderBy: [desc(kanwatchEpisodes.updatedAt)],
        limit: 200,
      });
      return [...new Set(rows.map((r) => r.label?.trim()).filter((l): l is string => !!l))].slice(0, 30);
    })(),
    episodes: episodes.map((e) => ({
      id: e.id,
      startedAt: e.startedAt.getTime(),
      endedAt: e.endedAt.getTime(),
      activeSeconds: e.activeSeconds,
      privateSeconds: e.privateSeconds,
      status: e.status,
      guess: e.guessKind
        ? {
            kind: e.guessKind,
            channelId: e.guessChannelId && channelName.has(e.guessChannelId) ? e.guessChannelId : null,
            channelName: e.guessChannelId ? channelName.get(e.guessChannelId) ?? null : null,
            cardId: e.guessCardId && cardTitle.has(e.guessCardId) ? e.guessCardId : null,
            cardTitle: e.guessCardId ? cardTitle.get(e.guessCardId) ?? null : null,
            probability: e.guessProbability,
            label: e.guessLabel,
          }
        : null,
      mode: e.verdictMode ?? e.activityMode,
      modeIsYours: !!e.verdictMode,
      focusScore: e.focusScore,
      worthCard: e.worthCardProbability,
      verdict: e.verdict,
      verdictChannelId: e.verdictChannelId,
      verdictChannelName: e.verdictChannelId ? channelName.get(e.verdictChannelId) ?? null : null,
      verdictCardTitle: e.verdictCardId ? cardTitle.get(e.verdictCardId) ?? null : null,
      label: e.label,
      live: e.status === 'open',
      basis: (() => {
        try { return e.basis ? JSON.parse(e.basis) as { notes: string[]; pastAnswers: number } : null; } catch { return null; }
      })(),
      pages: summarizePages(visits.filter((v) => v.episodeId === e.id), 6).map((p) => ({
        site: p.site, path: p.path, title: p.title, heading: p.heading, search: p.search,
        seconds: p.seconds, doing: p.doing,
      })),
    })),
    sites: topSites.map(([domain, seconds]) => {
      const note = siteNotes.find((n) => n.domain === domain);
      return { domain, seconds, want: note?.want ?? null, purpose: note?.purpose ?? '', kanThinks: kanThinks(domain) };
    }),
    week: weekDays,
    reads: {
      // Everything read today, by what Jev made of it.
      counts: reads.reduce<Record<string, number>>((acc, r) => {
        const key = r.status === 'judged' ? r.category ?? 'other' : 'reading';
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      }, {}),
      total: reads.length,
      // The ones worth a look: Jev thought so, and an LLM wrote them up.
      worthALook: reads
        .filter((r) => r.tldr && r.verdict !== 'dismissed')
        .sort((a, b) => Math.max(b.worth ?? 0, b.kanthinkFit ?? 0, b.appIdea ?? 0) - Math.max(a.worth ?? 0, a.kanthinkFit ?? 0, a.appIdea ?? 0))
        .map((r) => ({
          id: r.id, url: r.url, domain: r.domain, title: r.title, kind: r.kind, seconds: r.seconds,
          category: r.category, tldr: r.tldr, why: r.why, nudge: r.nudge, nudgeKind: r.nudgeKind,
          verdict: r.verdict, reflection: r.reflection, cardId: r.cardId, manual: r.manual,
          scores: { worth: r.worth, kanthink: r.kanthinkFit, app: r.appIdea },
        })),
      // Read, judged, not written up: shown compactly so nothing Kan saw is hidden.
      others: reads
        .filter((r) => !r.tldr && r.verdict !== 'dismissed')
        .slice(0, 30)
        .map((r) => ({ id: r.id, url: r.url, domain: r.domain, title: r.title, category: r.category, seconds: r.seconds, status: r.status })),
    },
  });
}

/**
 * PUT /api/kanwatch/day — { date, intention, from, to }: what the day is meant to be
 * about. Its episodes are read again, since focus was scored against the old one.
 */
export async function PUT(request: Request) {
  const userId = await kanwatchUser();
  if (!userId) return NextResponse.json({ error: 'Not available' }, { status: 403 });
  const { date, intention, from, to } = await request.json().catch(() => ({}));
  if (!isDate(date ?? null)) return NextResponse.json({ error: 'Bad date' }, { status: 400 });
  const text = String(intention ?? '').trim().slice(0, 300);
  const id = `${userId}:${date}`;
  const now = new Date();
  await db.insert(kanwatchDays)
    .values({ id, userId, date, intention: text, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: kanwatchDays.id, set: { intention: text, updatedAt: now } });

  if (Number.isFinite(from) && Number.isFinite(to) && to > from && to - from <= 2 * DAY_MS) {
    await db.update(kanwatchEpisodes)
      .set({ status: 'closed', updatedAt: now })
      .where(and(
        eq(kanwatchEpisodes.userId, userId),
        eq(kanwatchEpisodes.status, 'judged'),
        ne(kanwatchEpisodes.guessKind, 'private'),
        gte(kanwatchEpisodes.startedAt, new Date(from)),
        lt(kanwatchEpisodes.startedAt, new Date(to)),
      ));
  }

  return NextResponse.json({ ok: true });
}
