/**
 * What was an episode? Jev reads it; code decides what to keep.
 *
 * One request per finished episode, four questions over the same state:
 *   - belongs (Choice): which of your channels or cards it served, or new work,
 *     not work, or unclear.
 *   - mode (Choice): building, researching, learning, communicating, …
 *   - focus (Score): against what you said the day was for — only when you said.
 *   - worth_card (Noul): a distinct new line of work worth its own card?
 *
 * Code does the counting Jev should not: minutes per page, what the engagement
 * counts say you were doing, the time of day. Your past confirmations and your own
 * notes on sites ride along, which is how its guesses become yours over time.
 *
 * Only scrubbed, stored fields are sent — the same ones you can see on the page.
 */

import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, like, lt, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { kanwatchDays, kanwatchEpisodes, kanwatchSites, kanwatchVisits } from '@/lib/db/schema';
import { askJev, isJevConfigured } from '@/lib/jev/client';
import { cardCandidates, loadAccess, type Access } from '@/lib/voice/resolveReference';
import { describeEngagement, localDate, partOfDay } from './episodes';
import { loadBoard } from './board';

export const MODES = {
  building: 'Making or changing something: writing code, editing a document or design, configuring a tool.',
  researching: 'Looking things up to answer a specific question or solve a specific problem.',
  learning: 'Studying a topic more broadly: courses, tutorials, long explanations.',
  communicating: 'Messages, chat, forums, comments, meetings.',
  planning: 'Organising work: boards, calendars, notes, to-do lists.',
  admin: 'Accounts, settings, forms, errands.',
  entertainment: 'Video, games, music or reading for fun.',
  shopping: 'Browsing or comparing things to buy.',
  news_social: 'News, feeds and social media.',
} as const;

export type ActivityMode = keyof typeof MODES;

type VisitRow = typeof kanwatchVisits.$inferSelect;

/** The pages of an episode, merged and ranked by time — what Jev (and the page) see. */
export function summarizePages(visits: VisitRow[], limit = 8) {
  const byPage = new Map<string, {
    key: string; site: string; path: string; title: string; heading: string; description: string; search: string;
    seconds: number; keystrokes: number; clicks: number; scrollDepth: number; mediaSeconds: number;
  }>();
  for (const v of visits) {
    if (v.isPrivate || !v.domain) continue;
    const key = pageKey(v);
    const page = byPage.get(key) ?? {
      key,
      site: v.domain, path: v.path ?? '/', title: v.title ?? '', heading: v.heading ?? '',
      description: v.description ?? '', search: v.searchQuery ?? '',
      seconds: 0, keystrokes: 0, clicks: 0, scrollDepth: 0, mediaSeconds: 0,
    };
    page.seconds += v.activeSeconds;
    page.keystrokes += v.keystrokes ?? 0;
    page.clicks += v.clicks ?? 0;
    page.scrollDepth = Math.max(page.scrollDepth, v.scrollDepth ?? 0);
    page.mediaSeconds += v.mediaSeconds ?? 0;
    if (!page.heading && v.heading) page.heading = v.heading;
    if (!page.search && v.searchQuery) page.search = v.searchQuery;
    byPage.set(key, page);
  }
  return [...byPage.values()]
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, limit)
    .map((p) => ({
      ...p,
      doing: describeEngagement({
        activeSeconds: p.seconds, keystrokes: p.keystrokes, clicks: p.clicks,
        scrollDepth: p.scrollDepth, mediaSeconds: p.mediaSeconds,
      }),
    }));
}

/** What makes two visits the same page: site, path and title. */
export function pageKey(v: { domain: string | null; path: string | null; title: string | null }): string {
  return `${v.domain}${v.path ?? ''}|${v.title ?? ''}`;
}

export type PageFocus = 'priority' | 'work' | 'not_work' | 'unclear';

/**
 * A stretch's focus on the day's priority, from its pages: the share of read time
 * spent on pages that served it. Unclear pages count neither way.
 */
export function focusFromPages(pages: { seconds: number; focus: PageFocus | null }[]): number | null {
  let on = 0, counted = 0;
  for (const p of pages) {
    if (!p.focus || p.focus === 'unclear') continue;
    counted += p.seconds;
    if (p.focus === 'priority') on += p.seconds;
  }
  return counted > 0 ? Math.round((on / counted) * 100) : null;
}

/** Below this, Jev's pick for a page is shown as unclear rather than as an answer. */
const PAGE_CONFIDENCE = 0.4;

const minutes = (s: number) => {
  const m = Math.max(1, Math.round(s / 60));
  return `${m} minute${m === 1 ? '' : 's'}`;
};

export async function judgeEpisode(episodeId: string, access?: Access): Promise<void> {
  const ep = await db.query.kanwatchEpisodes.findFirst({ where: eq(kanwatchEpisodes.id, episodeId) });
  if (!ep || ep.status === 'judged') return;
  // An episode still in progress gets a live read; it stays open, and gets a final
  // read once it ends.
  const nextStatus = ep.status === 'open' ? ('open' as const) : ('judged' as const);
  const now = new Date();
  const visits = await db.query.kanwatchVisits.findMany({
    where: eq(kanwatchVisits.episodeId, ep.id),
    orderBy: [asc(kanwatchVisits.startedAt)],
  });
  const pages = summarizePages(visits);

  // Nothing but private time: there is nothing to read, and nothing is sent.
  if (pages.length === 0) {
    await db.update(kanwatchEpisodes)
      .set({ status: nextStatus, guessKind: 'private', domains: '[]', judgedAt: now, updatedAt: now })
      .where(eq(kanwatchEpisodes.id, ep.id));
    return;
  }
  const siteList = [...new Set(pages.map((p) => p.site))];

  const reach = access ?? (await loadAccess(ep.userId));
  const date = localDate(ep.startedAt.getTime(), ep.tzOffsetMinutes);

  const searchText = pages.map((p) => [p.title, p.heading, p.search].join(' ')).join(' ').slice(0, 1000);
  const [board, cardShortlist, day, sites, history] = await Promise.all([
    loadBoard(ep.userId, reach),
    reach.readable.length ? cardCandidates(searchText, reach, {}) : Promise.resolve([]),
    db.query.kanwatchDays.findFirst({ where: eq(kanwatchDays.id, `${ep.userId}:${date}`) }),
    db.query.kanwatchSites.findMany({
      where: and(eq(kanwatchSites.userId, ep.userId), inArray(kanwatchSites.domain, siteList)),
    }),
    db.query.kanwatchEpisodes.findMany({
      where: and(eq(kanwatchEpisodes.userId, ep.userId), isNotNull(kanwatchEpisodes.verdict)),
      orderBy: [desc(kanwatchEpisodes.startedAt)],
      limit: 8,
    }),
  ]);
  const cards = cardShortlist.slice(0, 15);
  const channelRows = board.channels.slice(0, 25);

  // Areas in the user's own words ("MyCreativeShop · template manufacturing"). Once
  // named, an area is a choice like any channel, so it can be recognised next time.
  const named = await db.query.kanwatchEpisodes.findMany({
    where: and(
      eq(kanwatchEpisodes.userId, ep.userId),
      eq(kanwatchEpisodes.verdict, 'corrected'),
      isNotNull(kanwatchEpisodes.label),
      gte(kanwatchEpisodes.startedAt, new Date(Date.now() - 60 * 86400000)),
    ),
    columns: { label: true, verdictChannelId: true },
  });
  const areaCounts = new Map<string, { label: string; channelId: string | null; n: number }>();
  for (const r of named) {
    const key = r.label!.trim().toLowerCase();
    const cur = areaCounts.get(key) ?? { label: r.label!.trim(), channelId: r.verdictChannelId, n: 0 };
    cur.n += 1;
    areaCounts.set(key, cur);
  }
  const areas = [...areaCounts.values()].sort((a, b) => b.n - a.n).slice(0, 12);

  // What the user said about these exact sites before — the most direct thing they
  // have taught it, and what makes a correction on one visit carry to the next.
  const siteAnswers = await db.query.kanwatchEpisodes.findMany({
    where: and(
      eq(kanwatchEpisodes.userId, ep.userId),
      isNotNull(kanwatchEpisodes.verdict),
      or(...siteList.map((site) => like(kanwatchEpisodes.domains, `%"${site}"%`))),
    ),
    orderBy: [desc(kanwatchEpisodes.startedAt)],
    limit: 30,
  });

  // The user's own past answers, as examples of what this kind of browsing turned out to be.
  const historyVisits = history.length
    ? await db.query.kanwatchVisits.findMany({ where: inArray(kanwatchVisits.episodeId, history.map((h) => h.id)) })
    : [];
  const channelName = new Map(channelRows.map((c) => [c.id, c.name]));
  const answerLabel = (h: typeof history[number]) => {
    const what = h.verdict === 'not_work' ? 'not work'
      : h.label || (h.verdictChannelId ? `work for ${channelName.get(h.verdictChannelId) ?? 'a channel'}` : 'work');
    return h.verdictMode ? `${what}, doing ${h.verdictMode}` : what;
  };

  const bySite = siteList.flatMap((site) => {
    const counts = new Map<string, number>();
    for (const h of siteAnswers) {
      if (!(h.domains ?? '').includes(`"${site}"`)) continue;
      const label = answerLabel(h);
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([it_was, times]) => ({ site, it_was, times }));
  });

  // What they told Kanwatch about focus on these sites, from moments they answered.
  const answeredVisits = await db.query.kanwatchVisits.findMany({
    where: and(
      eq(kanwatchVisits.userId, ep.userId),
      isNotNull(kanwatchVisits.focusVerdict),
      inArray(kanwatchVisits.domain, siteList),
      gte(kanwatchVisits.startedAt, new Date(Date.now() - 30 * 86400000)),
    ),
    columns: { domain: true, title: true, focus: true },
    orderBy: [desc(kanwatchVisits.startedAt)],
    limit: 60,
  });
  const focusAnswers = siteList.flatMap((site) => {
    const rows = answeredVisits.filter((v) => v.domain === site);
    if (!rows.length) return [];
    const on = rows.filter((v) => v.focus === 'priority');
    const off = rows.filter((v) => v.focus !== 'priority');
    return [{
      site,
      pages_they_said_served_their_priority: [...new Set(on.map((v) => v.title).filter(Boolean))].slice(0, 3),
      pages_they_said_did_not: [...new Set(off.map((v) => v.title).filter(Boolean))].slice(0, 3),
    }];
  });

  const examples = history.map((h) => ({
    pages: summarizePages(historyVisits.filter((v) => v.episodeId === h.id), 3).map((p) => p.title || p.site),
    it_was: answerLabel(h),
  })).filter((e) => e.pages.length > 0);

  const criteria: Record<string, Record<string, unknown> | string> = {};
  channelRows.forEach((c, i) => {
    criteria[`channel_${i + 1}`] = {
      channel: c.name,
      // The folder is often the clearest signal: a "Work" channel in a MyCreativeShop folder is MyCreativeShop work.
      ...(c.folder ? { in_folder: c.folder } : {}),
      about: c.description?.slice(0, 140) || undefined,
    };
  });
  cards.forEach((c, i) => {
    criteria[`card_${i + 1}`] = { card: c.title, in: c.where, ...(c.detail.summary ? { summary: c.detail.summary } : {}) };
  });
  areas.forEach((a, i) => {
    criteria[`area_${i + 1}`] = {
      area: a.label,
      described_by: 'the user, in their own words',
      ...(a.channelId && channelName.has(a.channelId) ? { in_channel: channelName.get(a.channelId) } : {}),
    };
  });
  criteria.new_work = 'Work toward something that none of the listed channels, cards or areas covers.';
  criteria.not_work = 'Not work: entertainment, errands, personal browsing.';
  criteria.unclear = 'Too little to tell what this was for.';

  const state = {
    episode: {
      length: minutes(ep.activeSeconds),
      when: partOfDay(ep.startedAt.getTime(), ep.tzOffsetMinutes),
      private_time: ep.privateSeconds > 0 ? minutes(ep.privateSeconds) : undefined,
      pages: pages.map((p) => ({
        site: p.site,
        path: p.path !== '/' ? p.path : undefined,
        title: p.title || undefined,
        heading: p.heading && p.heading !== p.title ? p.heading : undefined,
        about: p.description || undefined,
        searched_for: p.search || undefined,
        time: minutes(p.seconds),
        doing: p.doing,
      })),
    },
    todays_intention: day?.intention || undefined,
    their_notes_on_these_sites: sites.filter((s) => s.purpose || s.want).map((s) => ({
      site: s.domain, what_it_is_for_them: s.purpose || undefined,
      wants: s.want ? `${s.want} time here` : undefined,
    })),
    what_they_said_before_about_these_sites: bySite,
    // Their answers to Kanwatch's celebrations and nudges about these sites: whether
    // pages here served what they said the day was for. The most direct signal there is.
    their_answers_about_focus_on_these_sites: focusAnswers,
    how_they_labelled_past_browsing: examples,
  };

  const questions = {
    belongs: {
      type: 'choice' as const,
      instructions:
        'This is a stretch of someone\'s web browsing, grouped into `episode`. Which of their channels, cards or areas was it ' +
        'serving? Areas are ones they named themselves; prefer an area that matches over a card that only shares a word with ' +
        'the pages. Prefer a card when the pages are clearly about that card, a channel when they serve its broader goal. ' +
        'Their own words beat everything else: `what_they_said_before_about_these_sites` is what they answered for these ' +
        'same sites before, and `their_notes_on_these_sites` is how they describe them. Follow those unless the pages ' +
        'clearly show something different this time. `how_they_labelled_past_browsing` shows how they think about the rest.',
      criteria,
    },
    mode: {
      type: 'choice' as const,
      instructions:
        'What kind of activity was `episode` mostly? The `doing` field on each page says whether they were typing, reading or ' +
        'watching. If `what_they_said_before_about_these_sites` says what they were doing on these sites, that is how they see it.',
      criteria: MODES,
    },
    worth_card: {
      type: 'noul' as const,
      instructions: 'Is `episode` a distinct, deliberate line of work — something they would want tracked as its own card — rather than a quick lookup, a distraction or part of something ongoing?',
    },
    // Each page on its own. A stretch mixes things — nine minutes of support tickets
    // and three of a social feed — and one label for the whole stretch made the feed
    // "work" by association. What matters is whether each page served the day.
    ...Object.fromEntries(pages.map((p, i) => [`page_${i + 1}`, {
      type: 'choice' as const,
      instructions:
        `Judge page ${i + 1} of \`episode.pages\` on its own — ${p.site}${p.title ? ` "${p.title.slice(0, 120)}"` : ''} — ` +
        'not by the pages around it. Use common sense: social feeds, news, video, shopping and personal messages are not ' +
        'work, unless `their_notes_on_these_sites` or `what_they_said_before_about_these_sites` say this site is work for ' +
        'them, or the page itself is plainly about their work (a post they are writing, research for a task). ' +
        '`their_answers_about_focus_on_these_sites` is what they told you directly about pages like this; follow it.' +
        (day?.intention ? ' Work counts as `priority` only when it serves `todays_intention` directly or supports it.' : ''),
      criteria: {
        ...(day?.intention ? { priority: 'Working on, or directly supporting, what they said today is for.' } : {}),
        work: day?.intention ? 'Work, but not what they said today is for.' : 'Work of any kind.',
        not_work: 'Not work: feeds, news, entertainment, shopping, personal messages, errands.',
        unclear: 'Too little to tell.',
      },
    }])),
  };

  const result = await askJev(state, questions, { label: 'kanwatch episode', timeoutMs: 8000 });
  if (!result) return; // stays 'closed'; the next pass retries

  const belongs = result.answers.belongs;
  const pick = belongs.choice;
  const probability = Math.round((belongs.probabilities[pick] ?? 0) * 100);
  let guessKind: string = pick;
  let guessChannelId: string | null = null;
  let guessCardId: string | null = null;
  if (pick.startsWith('channel_')) {
    guessKind = 'channel';
    guessChannelId = channelRows[Number(pick.split('_')[1]) - 1]?.id ?? null;
  } else if (pick.startsWith('card_')) {
    const card = cards[Number(pick.split('_')[1]) - 1];
    guessKind = 'card';
    guessCardId = card?.id ?? null;
    guessChannelId = card?.channelId ?? null;
  }
  let guessLabel: string | null = null;
  if (pick.startsWith('area_')) {
    const area = areas[Number(pick.split('_')[1]) - 1];
    guessKind = 'area';
    guessLabel = area?.label ?? null;
    guessChannelId = area?.channelId ?? null;
  }
  // A weak pick is not a guess worth showing as one.
  if (probability < 35 && guessKind !== 'not_work') guessKind = 'unclear';

  // Each page's read, onto every visit that makes up that page.
  const answers = result.answers as unknown as Record<string, { choice: string; probabilities: Record<string, number> } | undefined>;
  const pageFocus = pages.map((p, i) => {
    const a = answers[`page_${i + 1}`];
    if (!a) return { seconds: p.seconds, focus: null };
    const sure = (a.probabilities[a.choice] ?? 0) >= PAGE_CONFIDENCE;
    return { seconds: p.seconds, focus: (sure ? a.choice : 'unclear') as PageFocus };
  });
  const byKey = new Map(pages.map((p, i) => [p.key, pageFocus[i].focus]));
  const writes = new Map<PageFocus, string[]>();
  for (const v of visits) {
    // Your own answer about a page is never read back over.
    if (v.isPrivate || !v.domain || v.focusVerdict) continue;
    const f = byKey.get(pageKey(v));
    if (f) writes.set(f, [...(writes.get(f) ?? []), v.id]);
  }
  for (const [f, ids] of writes) {
    await db.update(kanwatchVisits).set({ focus: f }).where(inArray(kanwatchVisits.id, ids));
  }
  // Where you answered for a page, your answer is what counts.
  const answered = new Map(visits.filter((v) => v.focusVerdict && v.focus).map((v) => [pageKey(v), v.focus as PageFocus]));
  const counted = pages.map((p, i) => ({ seconds: p.seconds, focus: answered.get(p.key) ?? pageFocus[i].focus }));
  const focusScore = day?.intention ? focusFromPages(counted) : null;

  const basis = {
    notes: sites.filter((s) => s.purpose).map((s) => s.domain),
    pastAnswers: bySite.reduce((n, b) => n + b.times, 0),
  };

  await db.update(kanwatchEpisodes).set({
    status: nextStatus,
    boardSig: board.signature,
    domains: JSON.stringify(siteList),
    basis: JSON.stringify(basis),
    guessKind,
    guessLabel,
    guessChannelId,
    guessCardId,
    guessProbability: probability,
    activityMode: result.answers.mode.choice,
    focusScore,
    worthCardProbability: Math.round(result.answers.worth_card.noul * 100),
    jevModel: result.model,
    judgedAt: now,
    updatedAt: now,
  }).where(eq(kanwatchEpisodes.id, ep.id));

  console.log('[jev-kanwatch]', JSON.stringify({
    pages: pages.length, guess: guessKind, p: probability, mode: result.answers.mode.choice, ms: result.latencyMs,
  }));
}

const LIVE_READ_EVERY_MS = 2 * 60 * 1000;

/**
 * Pages you've already been on today, read the moment they arrive: the editor you
 * keep going back to was judged an hour ago, and nothing about it changed. New pages
 * wait for Jev. Your own answers win over Jev's reads.
 */
export async function inheritFocus(userId: string, since: Date): Promise<number> {
  const today = await db.query.kanwatchVisits.findMany({
    where: and(eq(kanwatchVisits.userId, userId), gte(kanwatchVisits.startedAt, since), eq(kanwatchVisits.isPrivate, false)),
    columns: { id: true, domain: true, path: true, title: true, focus: true, focusVerdict: true, startedAt: true },
    orderBy: [asc(kanwatchVisits.startedAt)],
  });
  const known = new Map<string, { focus: string; yours: boolean }>();
  const writes = new Map<string, string[]>();
  for (const v of today) {
    if (!v.domain) continue;
    const key = pageKey(v);
    if (v.focus) {
      const prev = known.get(key);
      if (!prev || !prev.yours || v.focusVerdict) known.set(key, { focus: v.focus, yours: !!v.focusVerdict });
      continue;
    }
    const from = known.get(key);
    if (from) writes.set(from.focus, [...(writes.get(from.focus) ?? []), v.id]);
  }
  let n = 0;
  for (const [focus, ids] of writes) {
    await db.update(kanwatchVisits).set({ focus: focus as PageFocus }).where(inArray(kanwatchVisits.id, ids));
    n += ids.length;
  }
  return n;
}

/**
 * Read the stretch you're in right now, if it has pages no one has read yet. Used
 * before deciding a moment, so a celebration is about what you're doing rather than
 * what you were doing a check-in ago.
 */
export async function judgeCurrent(userId: string): Promise<void> {
  if (!isJevConfigured()) return;
  const open = await db.query.kanwatchEpisodes.findFirst({
    where: and(eq(kanwatchEpisodes.userId, userId), eq(kanwatchEpisodes.status, 'open')),
  });
  if (!open) return;
  const unread = await db.query.kanwatchVisits.findFirst({
    where: and(eq(kanwatchVisits.episodeId, open.id), eq(kanwatchVisits.isPrivate, false), isNull(kanwatchVisits.focus)),
    columns: { id: true },
  });
  if (unread) await judgeEpisode(open.id);
}

/**
 * Read what needs reading: finished episodes not yet judged, and the episode in
 * progress if it has grown since its last live read (at most every two minutes).
 */
export async function judgePending(userId: string, limit = 10): Promise<number> {
  if (!isJevConfigured()) return 0;
  const pending = await db.query.kanwatchEpisodes.findMany({
    where: and(
      eq(kanwatchEpisodes.userId, userId),
      or(
        eq(kanwatchEpisodes.status, 'closed'),
        and(
          eq(kanwatchEpisodes.status, 'open'),
          gte(kanwatchEpisodes.activeSeconds, 45),
          sql`${kanwatchEpisodes.updatedAt} > coalesce(${kanwatchEpisodes.judgedAt}, 0)`,
          or(
            sql`${kanwatchEpisodes.judgedAt} is null`,
            lt(kanwatchEpisodes.judgedAt, new Date(Date.now() - LIVE_READ_EVERY_MS)),
          ),
        ),
      ),
    ),
    orderBy: [asc(kanwatchEpisodes.startedAt)],
    limit,
  });
  if (pending.length === 0) return 0;
  const access = await loadAccess(userId);
  // A few at a time: TypeSafe rate-limits bursts, and a day's backlog is small.
  for (let i = 0; i < pending.length; i += 3) {
    await Promise.all(pending.slice(i, i + 3).map((ep) => judgeEpisode(ep.id, access).catch((err) => {
      console.warn('[kanwatch] judge failed', ep.id, err instanceof Error ? err.message : err);
    })));
  }
  return pending.length;
}

/**
 * After the user teaches something about a site — a correction, a note, a "more or
 * less" — re-read the recent episodes on that site that they haven't answered, so
 * the lesson shows up straight away rather than only on tomorrow's browsing.
 */
export async function rereadSites(userId: string, sites: string[], exceptEpisodeId?: string) {
  if (sites.length === 0) return;
  const since = new Date(Date.now() - 36 * 60 * 60 * 1000);
  const touched = await db.query.kanwatchEpisodes.findMany({
    where: and(
      eq(kanwatchEpisodes.userId, userId),
      gte(kanwatchEpisodes.startedAt, since),
      sql`${kanwatchEpisodes.verdict} is null`,
      or(...sites.map((site) => like(kanwatchEpisodes.domains, `%"${site}"%`))),
    ),
    columns: { id: true, status: true },
  });
  for (const e of touched) {
    if (e.id === exceptEpisodeId) continue;
    await db.update(kanwatchEpisodes)
      .set(e.status === 'judged' ? { status: 'closed' } : { judgedAt: null })
      .where(eq(kanwatchEpisodes.id, e.id));
  }
}
