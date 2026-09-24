/**
 * From a page you read to an app.
 *
 * Kanwatch already knows when a page reads like an app idea, and whether it would
 * extend one of your existing apps. These are the two ways to act on that:
 *
 *   - buildAppFromRead: a card made from the page (TL;DR, your take, the link and an
 *     excerpt) becomes the brief, an app is created on it, and the first build starts.
 *     The build notifies you when it lands, like any build you walk away from.
 *   - extendAppFromRead: the idea goes into that app's own thread. Nothing is rebuilt
 *     until you press Update app there — building an existing app stays an explicit act.
 *
 * Shared by the Kanwatch page, voice mode and the main chat, so "yes, build it" works
 * wherever Kan asked.
 */

import { and, asc, desc, eq, gte, isNotNull, like, or, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '@/lib/db';
import { cards, columns, kanwatchReads, playgroundApps } from '@/lib/db/schema';
import { inColumnBucket } from '@/lib/db/cardBuckets';
import { afterResponse } from '@/lib/afterResponse';
import { getOrCreateQuickSaveChannel } from '@/lib/inbox/quickSaveChannel';
import { resolveAppForAutomatedBuild } from '@/lib/playground/appRecord';
import { generatePlaygroundApp } from '@/lib/playground/generateApp';
import { loadAccess } from '@/lib/voice/resolveReference';

type ReadRow = typeof kanwatchReads.$inferSelect;

export class BuildError extends Error {}

/** The card a page becomes: enough of the page to brief a build, and where it came from. */
function briefFor(read: ReadRow, reflection?: string | null, withExcerpt = false): string {
  const excerpt = withExcerpt && read.text ? read.text.slice(0, 2500) : '';
  return [
    read.tldr,
    read.why ? `**Why it matters:** ${read.why}` : '',
    reflection ? `**My take:** ${reflection}` : '',
    excerpt ? `**From the page:**\n\n> ${excerpt.replace(/\n+/g, '\n> ')}` : '',
    `[${read.domain ?? 'Open the page'}](${read.url})`,
  ].filter(Boolean).join('\n\n');
}

/** Make a card from a page in a channel the user can edit. */
export async function cardFromRead(
  userId: string,
  read: ReadRow,
  channelId: string,
  opts: { reflection?: string | null; withExcerpt?: boolean } = {},
): Promise<{ cardId: string; channelId: string }> {
  const access = await loadAccess(userId);
  if (!access.writable.has(channelId)) throw new BuildError('You can’t add cards to that channel.');
  const cols = await db.query.columns.findMany({ where: eq(columns.channelId, channelId), orderBy: [asc(columns.position)] });
  const col = cols.find((c) => c.isAiTarget) ?? cols[0];
  if (!col) throw new BuildError('That channel has no columns.');
  const last = await db.query.cards.findFirst({
    where: inColumnBucket(col.id, 'active'),
    orderBy: [desc(cards.position)],
    columns: { position: true },
  });
  const now = new Date();
  const cardId = nanoid();
  await db.insert(cards).values({
    id: cardId,
    channelId,
    columnId: col.id,
    title: (read.title || read.domain || 'Saved page').slice(0, 200),
    messages: [{
      id: nanoid(),
      type: 'note',
      content: briefFor(read, opts.reflection ?? read.reflection, opts.withExcerpt),
      createdAt: now.toISOString(),
    }] as typeof cards.$inferInsert.messages,
    source: 'manual',
    position: (last?.position ?? -1) + 1,
    createdAt: now,
    updatedAt: now,
  });
  return { cardId, channelId };
}

async function loadRead(userId: string, readId: string): Promise<ReadRow> {
  const read = await db.query.kanwatchReads.findFirst({
    where: and(eq(kanwatchReads.id, readId), eq(kanwatchReads.userId, userId)),
  });
  if (!read) throw new BuildError('That page isn’t in Kanwatch any more.');
  return read;
}

/** The app a read relates to, if the user can still edit it. */
async function relatedApp(userId: string, read: ReadRow) {
  if (!read.relatedAppId) return null;
  const app = await db.query.playgroundApps.findFirst({ where: eq(playgroundApps.id, read.relatedAppId) });
  if (!app || app.isArchived) return null;
  const access = await loadAccess(userId);
  return access.writable.has(app.channelId) ? app : null;
}

/**
 * Build a new app from a page. The card goes in `channelId` if given, else the channel
 * of the app it relates to, else Kan Bookmarks.
 */
export async function buildAppFromRead(userId: string, readId: string, channelId?: string) {
  const read = await loadRead(userId, readId);
  if (read.appId) {
    const existing = await db.query.playgroundApps.findFirst({ where: eq(playgroundApps.id, read.appId) });
    if (existing && !existing.isArchived) {
      return { channelId: existing.channelId, cardId: existing.cardId, appId: existing.id, alreadyBuilt: true };
    }
  }
  const target = channelId
    ?? (await relatedApp(userId, read))?.channelId
    ?? (await getOrCreateQuickSaveChannel(userId)).channel.id;

  const { cardId } = await cardFromRead(userId, read, target, { withExcerpt: true });
  const app = await resolveAppForAutomatedBuild({ cardId, userId, title: read.title?.slice(0, 60) || undefined });
  if (!app) throw new BuildError('Couldn’t create an app on that card.');

  await db.update(kanwatchReads)
    .set({ verdict: 'saved', cardId, appId: app.id, updatedAt: new Date() })
    .where(eq(kanwatchReads.id, read.id));

  // Minutes of work: let it run past the response, and say so when it lands.
  afterResponse(async () => {
    await generatePlaygroundApp(
      { appId: app.id, prompt: 'Build an app from this card and its thread.', notifyWhenDone: true },
      { user: { id: userId } },
      { skipPreflight: true },
    );
  });

  return { channelId: target, cardId, appId: app.id, alreadyBuilt: false };
}

/** Put the idea into the related app's thread; the user presses Update app there. */
export async function extendAppFromRead(userId: string, readId: string) {
  const read = await loadRead(userId, readId);
  const app = await relatedApp(userId, read);
  if (!app) throw new BuildError('That app isn’t available to add to.');

  const now = new Date();
  const note = {
    id: nanoid(),
    type: 'note' as const,
    content: `An idea from something I read, to consider for this app:\n\n**${read.title || read.domain}**\n\n${briefFor(read, read.reflection)}`,
    createdAt: now.toISOString(),
  };
  const messages = [...((app.messages ?? []) as unknown[]), note] as typeof playgroundApps.$inferInsert.messages;
  await db.update(playgroundApps).set({ messages, updatedAt: now }).where(eq(playgroundApps.id, app.id));
  await db.update(kanwatchReads)
    .set({ verdict: 'saved', updatedAt: now })
    .where(eq(kanwatchReads.id, read.id));

  return { channelId: app.channelId, cardId: app.cardId, appId: app.id, appTitle: app.title };
}

/** For voice and chat: the app-idea page the user means, by a few words of it. */
export async function findAppIdeaRead(userId: string, words: string): Promise<ReadRow | null> {
  const since = new Date(Date.now() - 14 * 86400000);
  const terms = words.split(/\s+/).filter((w) => w.length >= 3).slice(0, 5);
  const base = and(eq(kanwatchReads.userId, userId), gte(kanwatchReads.lastSeenAt, since), isNotNull(kanwatchReads.tldr));
  const rows = await db.query.kanwatchReads.findMany({
    where: terms.length
      ? and(base, or(...terms.flatMap((t) => [like(kanwatchReads.title, `%${t}%`), like(kanwatchReads.tldr, `%${t}%`), like(kanwatchReads.domain, `%${t}%`)])))
      : base,
    orderBy: [desc(sql`coalesce(${kanwatchReads.appIdea}, 0)`), desc(kanwatchReads.lastSeenAt)],
    limit: 1,
  });
  return rows[0] ?? null;
}
