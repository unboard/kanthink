/**
 * Which card, task or channel does the user mean?
 *
 * The live voice model is handed ids, but it often passes back a spoken phrase
 * instead — "the dog walker thing", "that launch card", a title half-mangled by
 * speech-to-text. This turns that phrase into one item, or into a short question.
 *
 * The split: code builds a shortlist of things the user can actually reach, Jev
 * picks one (always with a "none of these" option), and the probability margin
 * decides whether to act, ask, or say nothing matched. Jev never sees anything
 * outside `access.readable`, so it can only ever choose among the caller's own items.
 *
 * Returns null when Jev is unavailable, so the caller can fall back to plain
 * title matching.
 */

import { and, desc, eq, inArray, like, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { cards, channels, columns, tasks } from '@/lib/db/schema';
import { getUserChannels } from '@/lib/api/permissions';
import { askJev, isJevConfigured } from '@/lib/jev/client';

/** The channels a caller can reach, and which of them they can change. */
export interface Access {
  readable: string[];
  writable: Set<string>;
}

export async function loadAccess(userId: string): Promise<Access> {
  const reachable = await getUserChannels(userId);
  return {
    readable: reachable.map((c) => c.channelId),
    writable: new Set(reachable.filter((c) => c.role !== 'viewer').map((c) => c.channelId)),
  };
}

export type ReferenceKind = 'card' | 'task' | 'channel';

export interface ResolveContext {
  /** The last few spoken turns, oldest first — what makes "it" and "the other one" resolvable. */
  recentTurns?: Array<{ role: 'user' | 'kan'; text: string }>;
  /** Cards made earlier in this conversation. */
  sessionCardIds?: string[];
}

export interface Candidate {
  id: string;
  title: string;
  /** Where it lives, for a spoken disambiguation question: "Work › Doing". */
  where: string;
}

export type Resolution =
  | { status: 'resolved'; id: string; title: string }
  | { status: 'ambiguous'; options: Candidate[] }
  | { status: 'none' };

const MAX_CANDIDATES = 40;

// Words that carry no signal about *which* item — "move the card about taxes"
// should search for taxes, not card.
const STOPWORDS = new Set([
  'the', 'a', 'an', 'my', 'our', 'that', 'this', 'those', 'these', 'one', 'thing', 'stuff',
  'card', 'cards', 'task', 'tasks', 'channel', 'channels', 'board', 'app', 'about', 'for',
  'with', 'from', 'and', 'into', 'called', 'named', 'other', 'it', 'on', 'in', 'of', 'to',
]);

export function searchWords(reference: string): string[] {
  return [...new Set(
    reference
      .toLowerCase()
      .split(/[^a-z0-9']+/)
      .filter((w) => w.length >= 3 && !STOPWORDS.has(w)),
  )].slice(0, 6);
}

function ago(date: Date | null | undefined): string | undefined {
  if (!date) return undefined;
  const minutes = Math.round((Date.now() - new Date(date).getTime()) / 60000);
  if (minutes < 2) return 'just now';
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 36) return `${hours} hours ago`;
  return `${Math.round(hours / 24)} days ago`;
}

export interface Described extends Candidate {
  /** What Jev sees for this option. */
  detail: Record<string, unknown>;
  channelId?: string;
}

async function channelNames(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await db.query.channels.findMany({
    where: inArray(channels.id, [...new Set(ids)]),
    columns: { id: true, name: true },
  });
  return new Map(rows.map((r) => [r.id, r.name]));
}

/** The cards a phrase could plausibly mean: word matches, this conversation's cards, and recent ones. */
export async function cardCandidates(reference: string, access: Access, ctx: ResolveContext): Promise<Described[]> {
  const inReach = inArray(cards.channelId, access.readable);
  const words = searchWords(reference);
  const cols = { id: true, title: true, channelId: true, columnId: true, summary: true, updatedAt: true, isArchived: true } as const;

  const [byWords, fromSession, recent] = await Promise.all([
    words.length > 0
      ? db.query.cards.findMany({
          where: and(inReach, or(...words.map((w) => like(cards.title, `%${w}%`)))),
          columns: cols,
          orderBy: [desc(cards.updatedAt)],
          limit: 20,
        })
      : Promise.resolve([]),
    ctx.sessionCardIds?.length
      ? db.query.cards.findMany({ where: and(inReach, inArray(cards.id, ctx.sessionCardIds.slice(-10))), columns: cols })
      : Promise.resolve([]),
    // A misheard name ("voice for a crime") shares no words with its title, so the
    // recent cards are what give Jev the right one to pick. Titles are cheap; be generous.
    db.query.cards.findMany({ where: and(inReach, eq(cards.isArchived, false)), columns: cols, orderBy: [desc(cards.updatedAt)], limit: 25 }),
  ]);

  const session = new Set(ctx.sessionCardIds ?? []);
  const seen = new Set<string>();
  const rows = [...fromSession, ...byWords, ...recent].filter((r) => !seen.has(r.id) && seen.add(r.id)).slice(0, MAX_CANDIDATES);

  const colIds = rows.map((r) => r.columnId).filter((c): c is string => !!c);
  const [chNames, colRows] = await Promise.all([
    channelNames(rows.map((r) => r.channelId)),
    colIds.length ? db.query.columns.findMany({ where: inArray(columns.id, colIds), columns: { id: true, name: true } }) : Promise.resolve([]),
  ]);
  const colNames = new Map(colRows.map((c) => [c.id, c.name]));

  return rows.map((r) => {
    const channel = chNames.get(r.channelId) ?? '';
    const column = r.columnId ? colNames.get(r.columnId) : undefined;
    return {
      id: r.id,
      title: r.title,
      channelId: r.channelId,
      where: column ? `${channel} › ${column}` : channel,
      detail: {
        title: r.title,
        channel,
        column,
        summary: r.summary ? r.summary.slice(0, 160) : undefined,
        last_touched: ago(r.updatedAt),
        archived: r.isArchived || undefined,
        made_in_this_conversation: session.has(r.id) || undefined,
      },
    };
  });
}

async function taskCandidates(reference: string, access: Access): Promise<Described[]> {
  const inReach = inArray(tasks.channelId, access.readable);
  const words = searchWords(reference);
  const cols = { id: true, title: true, channelId: true, cardId: true, status: true, updatedAt: true } as const;

  const [byWords, recent] = await Promise.all([
    words.length > 0
      ? db.query.tasks.findMany({
          where: and(inReach, or(...words.map((w) => like(tasks.title, `%${w}%`)))),
          columns: cols,
          orderBy: [desc(tasks.updatedAt)],
          limit: 20,
        })
      : Promise.resolve([]),
    db.query.tasks.findMany({ where: inReach, columns: cols, orderBy: [desc(tasks.updatedAt)], limit: 25 }),
  ]);

  const seen = new Set<string>();
  const rows = [...byWords, ...recent].filter((r) => !seen.has(r.id) && seen.add(r.id)).slice(0, MAX_CANDIDATES);

  const cardIds = rows.map((r) => r.cardId).filter((c): c is string => !!c);
  const [chNames, parentCards] = await Promise.all([
    channelNames(rows.map((r) => r.channelId)),
    cardIds.length ? db.query.cards.findMany({ where: inArray(cards.id, cardIds), columns: { id: true, title: true } }) : Promise.resolve([]),
  ]);
  const cardTitles = new Map(parentCards.map((c) => [c.id, c.title]));

  return rows.map((r) => {
    const channel = chNames.get(r.channelId) ?? '';
    const onCard = r.cardId ? cardTitles.get(r.cardId) : undefined;
    return {
      id: r.id,
      title: r.title,
      where: onCard ? `on "${onCard}" in ${channel}` : channel,
      detail: {
        title: r.title,
        on_card: onCard,
        channel,
        status: r.status ?? 'not_started',
        last_touched: ago(r.updatedAt),
      },
    };
  });
}

async function channelCandidates(access: Access): Promise<Described[]> {
  const rows = await db.query.channels.findMany({
    where: inArray(channels.id, access.readable),
    columns: { id: true, name: true, description: true, updatedAt: true },
    orderBy: [desc(channels.updatedAt)],
    limit: MAX_CANDIDATES,
  });
  return rows.map((r) => ({
    id: r.id,
    title: r.name,
    where: 'channel',
    detail: {
      name: r.name,
      description: r.description ? r.description.slice(0, 140) : undefined,
      last_touched: ago(r.updatedAt),
    },
  }));
}

// Decision thresholds. A clear winner acts; two close ones become a question.
const ACT_MIN = 0.55;
const ACT_MARGIN = 0.2;
const ASK_MIN = 0.15;
// Above this, Jev has a reason beyond the words themselves, and is trusted over a word-for-word tie.
const SURE = 0.9;

/**
 * Jev's distribution over the shortlist → act, ask, or nothing matched.
 * `ranked` is sorted by probability, highest first; `none` is the "none of these" mass.
 */
export function decide(ranked: Array<{ c: Candidate; p: number }>, none: number): Resolution {
  const [first, second] = ranked;
  if (first && first.p >= ACT_MIN && first.p - (second?.p ?? 0) >= ACT_MARGIN && first.p > none) {
    return { status: 'resolved', id: first.c.id, title: first.c.title };
  }
  if (none >= 0.5 || !first || first.p < ASK_MIN) return { status: 'none' };
  const options = ranked
    .filter((r) => r.p >= ASK_MIN)
    .slice(0, 3)
    .map((r) => ({ id: r.c.id, title: r.c.title, where: r.c.where }));
  return options.length === 1
    ? { status: 'resolved', id: options[0].id, title: options[0].title }
    : { status: 'ambiguous', options };
}

export async function resolveReference(
  kind: ReferenceKind,
  reference: string,
  access: Access,
  ctx: ResolveContext = {},
): Promise<Resolution | null> {
  if (!isJevConfigured()) return null;
  const phrase = reference.trim();
  if (!phrase || access.readable.length === 0) return { status: 'none' };

  const candidates =
    kind === 'card' ? await cardCandidates(phrase, access, ctx)
    : kind === 'task' ? await taskCandidates(phrase, access)
    : await channelCandidates(access);
  if (candidates.length === 0) return { status: 'none' };

  // An exact title needs no judgment, and skips a round trip.
  const exact = candidates.filter((c) => c.title.trim().toLowerCase() === phrase.toLowerCase());
  if (exact.length === 1) return { status: 'resolved', id: exact[0].id, title: exact[0].title };

  const keyed = new Map(candidates.map((c, i) => [`option_${i + 1}`, c]));
  const criteria: Record<string, Record<string, unknown> | string> = {};
  for (const [key, c] of keyed) criteria[key] = c.detail;
  criteria.none = `No ${kind} on the list is plausibly the one they mean.`;

  const result = await askJev(
    {
      what_the_user_said: phrase,
      recent_conversation: (ctx.recentTurns ?? []).slice(-4).map((t) => `${t.role === 'user' ? 'User' : 'Kan'}: ${t.text}`),
    },
    {
      target: {
        type: 'choice',
        instructions:
          `A user speaking to a voice assistant named a ${kind} on their Kanban board; \`what_the_user_said\` is ` +
          'the speech-to-text transcript of that name. Transcripts often mishear words as similar-sounding ones ' +
          '("invoice for Acme" can come out as "voice for a crime"), so judge by how the words sound and what they ' +
          'mean, not just exact spelling. Pronouns like "it" refer to `recent_conversation`. ' +
          `Which ${kind} do they mean? Pick \`none\` only if no ${kind} plausibly fits.`,
        criteria,
      },
    },
    { label: `resolve ${kind}` },
  );
  if (!result) return null;

  const probs = result.answers.target.probabilities;
  const ranked = [...keyed.entries()]
    .map(([key, c]) => ({ c, p: probs[key] ?? 0 }))
    .sort((a, b) => b.p - a.p);
  const none = probs.none ?? 0;
  let resolution = decide(ranked, none);

  // "Launch" when there is a launch checklist and a launch email: every word fits
  // both, so nothing in the phrase can separate them, whatever Jev leans toward.
  // Unless it is near-certain (from the conversation, say), ask.
  if (resolution.status === 'resolved' && (ranked[0]?.p ?? 0) < SURE) {
    const words = searchWords(phrase);
    const fitsAll = words.length > 0
      ? ranked.filter((r) => words.every((w) => r.c.title.toLowerCase().includes(w)))
      : [];
    if (fitsAll.length > 1 && fitsAll.some((r) => r.c.id === ranked[0].c.id)) {
      resolution = { status: 'ambiguous', options: fitsAll.slice(0, 3).map((r) => ({ id: r.c.id, title: r.c.title, where: r.c.where })) };
    }
  }

  // One line per resolution, so accuracy can be measured against what the user
  // did next (a correction right after a "resolved" is the signal to look for).
  console.log('[jev-resolve]', JSON.stringify({
    kind,
    phrase,
    outcome: resolution.status,
    picked: resolution.status === 'resolved' ? resolution.title : undefined,
    top: ranked.slice(0, 3).map((r) => [r.c.title, Number(r.p.toFixed(3))]),
    none: Number(none.toFixed(3)),
    candidates: candidates.length,
    model: result.model,
    ms: result.latencyMs,
  }));

  return resolution;
}

/** The spoken question for an ambiguous reference, phrased for the live model to relay. */
export function clarifyingInstruction(kind: ReferenceKind, phrase: string, options: Candidate[]): string {
  const listed = options.map((o) => `"${o.title}" (${o.where}, id ${o.id})`).join(' or ');
  return (
    `Not done yet — "${phrase}" could be more than one ${kind}: ${listed}. ` +
    'Ask the user which one in a single short question, then call the same action again with the id they pick.'
  );
}
