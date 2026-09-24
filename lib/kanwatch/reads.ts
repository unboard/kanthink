/**
 * Pages worth a look: what a public page you read was about, and whether it deserves
 * a nudge.
 *
 * Two stages, cheapest first:
 *   1. Jev reads every eligible page — what kind of thing it is (work learning,
 *      entertainment, news…), whether it's about your work, whether it's worth coming
 *      back to, whether it bears on Kanthink, whether it's an app idea. It learns from
 *      what you saved and dismissed before, so "X is entertainment, but this thread is
 *      work education" comes from the page and from you, not a site rule.
 *   2. Only pages Jev thinks are worth it go to an LLM, which writes the TL;DR and one
 *      nudge: consider it for Kanthink, build it as an app, come back to it, or just
 *      "what did you think?".
 *
 * Which pages may be read at all is decided in extensions/kanwatch/privacy.js, by the
 * extension and again here.
 */

import { and, desc, eq, inArray, isNotNull, lt, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { channels, kanwatchReads, kanwatchSites, users } from '@/lib/db/schema';
import { askJev, isJevConfigured } from '@/lib/jev/client';
import { getLLMClientForUser } from '@/lib/ai/llm';
import { recordUsage } from '@/lib/usage';
import { loadAccess } from '@/lib/voice/resolveReference';
import { isPrivateTitle, isPrivateUrl, publicUrlOf, readablePageKind, scrubPageText, scrubText } from '@/extensions/kanwatch/privacy.js';
import { RETENTION_DAYS } from './episodes';

/** Reading for less than this isn't reading, unless you asked Kan to read the page. */
const MIN_READ_SECONDS = 30;
/** Above this (0–100) on worth, Kanthink fit or app idea, a page earns a TL;DR and a nudge. */
const NUDGE_AT = 60;

const KANTHINK_ABOUT =
  'Kanthink is an AI-assisted Kanban app: channels and cards that an assistant named Kan helps create and organise, ' +
  'automations called shrooms, voice mode, card chat, apps generated from cards, and Kanwatch (browsing-time insight).';

export const READ_CATEGORIES = {
  work_learning: 'Learning something useful for their work: building products, software, AI, design, marketing, business or money.',
  general_learning: 'Learning about something unrelated to their work.',
  reference: 'Looking something up: documentation, a spec, a how-to.',
  news: 'News or current events.',
  entertainment: 'Entertainment, humour or leisure.',
  social_chatter: 'Social posting with little substance.',
  shopping: 'Products or deals.',
} as const;

export interface IncomingRead {
  url: string;
  title?: string;
  text?: string;
  ogType?: string;
  manual?: boolean;
}

/**
 * Store (or add time to) a page read. Re-applies the privacy rules: a page the rules
 * would not read is dropped here whatever the extension sent.
 */
export async function recordRead(userId: string, read: IncomingRead, seconds: number, at: Date) {
  const url = typeof read.url === 'string' ? read.url.slice(0, 1000) : '';
  if (!url || isPrivateUrl(url) || isPrivateTitle(read.title)) return;
  const kind = readablePageKind(url, read.ogType ?? '') ?? (read.manual ? 'page' : null);
  if (!kind) return;
  const link = publicUrlOf(url);
  if (!link) return;

  const text = scrubPageText(read.text ?? '');
  const title = scrubText(read.title, 200);
  const domain = new URL(link).hostname.replace(/^www\./, '');

  const existing = await db.query.kanwatchReads.findFirst({
    where: and(eq(kanwatchReads.userId, userId), eq(kanwatchReads.url, link)),
  });
  if (existing) {
    // A much fuller read of the page (a long thread that loaded more) is worth re-reading.
    const grew = text.length > (existing.text?.length ?? 0) + 500;
    await db.update(kanwatchReads).set({
      seconds: existing.seconds + Math.max(0, Math.round(seconds)),
      lastSeenAt: at,
      manual: existing.manual || !!read.manual,
      ...(grew ? { text, status: 'pending' as const } : {}),
      ...(read.manual && existing.status === 'judged' && !existing.tldr ? { status: 'pending' as const } : {}),
      updatedAt: new Date(),
    }).where(eq(kanwatchReads.id, existing.id));
    return;
  }
  await db.insert(kanwatchReads).values({
    userId, url: link, domain, title, kind, text,
    seconds: Math.max(0, Math.round(seconds)),
    manual: !!read.manual,
    firstSeenAt: at, lastSeenAt: at,
  }).onConflictDoNothing();
}

/** Page text is part of the detailed record; it expires with it. The TL;DR stays. */
export async function expireReadText(userId: string) {
  await db.update(kanwatchReads)
    .set({ text: null })
    .where(and(
      eq(kanwatchReads.userId, userId),
      isNotNull(kanwatchReads.text),
      lt(kanwatchReads.lastSeenAt, new Date(Date.now() - RETENTION_DAYS * 86400000)),
    ));
}

type ReadRow = typeof kanwatchReads.$inferSelect;

function nudgeKindFor(r: { worth: number; kanthinkFit: number; appIdea: number }): 'kanthink' | 'app' | 'revisit' | 'reflect' {
  if (r.kanthinkFit >= NUDGE_AT && r.kanthinkFit >= r.appIdea) return 'kanthink';
  if (r.appIdea >= NUDGE_AT) return 'app';
  if (r.worth >= NUDGE_AT) return 'revisit';
  return 'reflect';
}

const NUDGE_GUIDE: Record<string, string> = {
  kanthink: 'Ask whether this should shape Kanthink, naming the specific idea from the page that might apply.',
  app: 'Ask whether this should become an app they build, naming the app in a short phrase.',
  revisit: 'Say in one line why it is worth coming back to.',
  reflect: 'Ask what they thought of it, pointing at the page\'s central claim.',
};

export async function judgeRead(read: ReadRow): Promise<void> {
  const [access, sites, saved, dismissed, user] = await Promise.all([
    loadAccess(read.userId),
    read.domain
      ? db.query.kanwatchSites.findFirst({ where: and(eq(kanwatchSites.userId, read.userId), eq(kanwatchSites.domain, read.domain)) })
      : Promise.resolve(undefined),
    db.query.kanwatchReads.findMany({
      where: and(eq(kanwatchReads.userId, read.userId), eq(kanwatchReads.verdict, 'saved')),
      columns: { title: true, category: true, reflection: true },
      orderBy: [desc(kanwatchReads.updatedAt)],
      limit: 10,
    }),
    db.query.kanwatchReads.findMany({
      where: and(eq(kanwatchReads.userId, read.userId), eq(kanwatchReads.verdict, 'dismissed')),
      columns: { title: true, domain: true },
      orderBy: [desc(kanwatchReads.updatedAt)],
      limit: 15,
    }),
    db.query.users.findFirst({ where: eq(users.id, read.userId), columns: { name: true } }),
  ]);
  const channelRows = access.readable.length
    ? await db.query.channels.findMany({
        where: inArray(channels.id, access.readable),
        columns: { name: true, description: true },
        orderBy: [desc(channels.updatedAt)],
        limit: 20,
      })
    : [];

  const minutes = Math.max(1, Math.round(read.seconds / 60));
  const state = {
    page: {
      site: read.domain,
      kind: read.kind,
      title: read.title || undefined,
      text: (read.text ?? '').slice(0, 4000) || undefined,
      time_spent: `${minutes} minute${minutes === 1 ? '' : 's'}`,
      they_asked_kan_to_read_it: read.manual || undefined,
    },
    the_person: {
      their_channels: channelRows.map((c) => (c.description ? `${c.name}: ${c.description.slice(0, 100)}` : c.name)),
      their_note_on_this_site: sites?.purpose || undefined,
      pages_they_saved_before: saved.map((s) => s.title).filter(Boolean),
      pages_they_said_were_not_interesting: dismissed.map((d) => d.title || d.domain).filter(Boolean),
    },
    kanthink: KANTHINK_ABOUT,
  };

  const result = await askJev(state, {
    category: {
      type: 'choice',
      instructions: 'What is `page` mainly? Judge this page itself, not its site: a thread on a social site can be serious work learning.',
      criteria: READ_CATEGORIES,
    },
    about_work: {
      type: 'noul',
      instructions: 'Is `page` about the kind of work `the_person` does, going by `their_channels`?',
    },
    worth: {
      type: 'score',
      instructions:
        'How worth coming back to is `page` for `the_person`? They value what resembles `pages_they_saved_before` and ' +
        'not what resembles `pages_they_said_were_not_interesting`.',
      criteria: ['Not worth coming back to', 'Mildly interesting', 'Worth saving and revisiting'],
    },
    kanthink_fit: {
      type: 'noul',
      instructions: 'Does `page` contain an idea, technique or lesson that could directly improve `kanthink`?',
    },
    app_idea: {
      type: 'noul',
      instructions: 'Does `page` describe or suggest a product that could be built as a small standalone app?',
    },
  }, { label: 'kanwatch read', timeoutMs: 8000 });
  if (!result) return; // stays pending; retried on the next pass

  const scores = {
    worth: Math.round((result.answers.worth.score / 2) * 100),
    kanthinkFit: Math.round(result.answers.kanthink_fit.noul * 100),
    appIdea: Math.round(result.answers.app_idea.noul * 100),
  };
  const judged = {
    status: 'judged' as const,
    category: result.answers.category.choice,
    aboutWork: Math.round(result.answers.about_work.noul * 100),
    ...scores,
    jevModel: result.model,
    updatedAt: new Date(),
  };

  const deserves = read.manual || scores.worth >= NUDGE_AT || scores.kanthinkFit >= NUDGE_AT || scores.appIdea >= NUDGE_AT;
  console.log('[jev-read]', JSON.stringify({ kind: read.kind, category: judged.category, ...scores, nudge: deserves, ms: result.latencyMs }));
  if (!deserves || !read.text) {
    await db.update(kanwatchReads).set(judged).where(eq(kanwatchReads.id, read.id));
    return;
  }

  // Stage two: words. Only for the few pages that earned them.
  const nudgeKind = nudgeKindFor(scores);
  const firstName = user?.name?.split(/\s+/)[0] || 'them';
  let written: { tldr?: string; why?: string; nudge?: string } = {};
  try {
    const { client, source } = await getLLMClientForUser(read.userId, undefined, 'automations');
    if (client) {
      const res = await client.complete([
        {
          role: 'system',
          content:
            `You are Kan, the assistant in Kanthink. ${firstName} read a page; you summarise it for them and ask one short question. ` +
            'Reply with JSON only: {"tldr": "2–3 plain sentences on what the page says", ' +
            '"why": "one line on why it matters to them, given their work", "nudge": "one question to them, under 25 words"}. ' +
            `For the nudge: ${NUDGE_GUIDE[nudgeKind]} No preamble, no markdown.`,
        },
        {
          role: 'user',
          content: JSON.stringify({
            page: { site: read.domain, title: read.title, text: (read.text ?? '').slice(0, 6000) },
            their_channels: state.the_person.their_channels,
            kanthink: KANTHINK_ABOUT,
          }),
        },
      ]);
      if (source === 'owner') await recordUsage(read.userId, 'kanwatch');
      const match = res.content.match(/\{[\s\S]*\}/);
      if (match) written = JSON.parse(match[0]);
    }
  } catch (err) {
    console.warn('[kanwatch] read summary failed', err instanceof Error ? err.message : err);
  }

  await db.update(kanwatchReads).set({
    ...judged,
    tldr: typeof written.tldr === 'string' ? written.tldr.slice(0, 800) : null,
    why: typeof written.why === 'string' ? written.why.slice(0, 300) : null,
    nudge: typeof written.nudge === 'string' ? written.nudge.slice(0, 300) : null,
    nudgeKind,
  }).where(eq(kanwatchReads.id, read.id));
}

/** Read the pages waiting to be read: enough time spent, or asked for. */
export async function judgePendingReads(userId: string, limit = 6): Promise<number> {
  if (!isJevConfigured()) return 0;
  const pending = await db.query.kanwatchReads.findMany({
    where: and(
      eq(kanwatchReads.userId, userId),
      eq(kanwatchReads.status, 'pending'),
      or(eq(kanwatchReads.manual, true), sql`${kanwatchReads.seconds} >= ${MIN_READ_SECONDS}`),
    ),
    orderBy: [desc(kanwatchReads.lastSeenAt)],
    limit,
  });
  for (let i = 0; i < pending.length; i += 3) {
    await Promise.all(pending.slice(i, i + 3).map((r) => judgeRead(r).catch((err) => {
      console.warn('[kanwatch] read judge failed', r.id, err instanceof Error ? err.message : err);
    })));
  }
  return pending.length;
}
