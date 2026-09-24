/**
 * Receiving visits from the extension.
 *
 * The extension has already applied the privacy rules; they are applied again here
 * from scratch, so what is stored never depends on the client behaving. The full
 * URL never reaches the server at all — only the scrubbed domain and path.
 */

import { and, eq, inArray, lt } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '@/lib/db';
import { kanwatchEpisodes, kanwatchVisits } from '@/lib/db/schema';
import { isPrivateUrl, isPrivateTitle, scrubText, scrubUrl } from '@/extensions/kanwatch/privacy.js';
import { assignEpisodes, GAP_MS, RETENTION_DAYS } from './episodes';
import { expireReadText, recordRead, type IncomingRead } from './reads';

export { RETENTION_DAYS };
const MAX_VISITS_PER_BATCH = 300;
const MAX_VISIT_SECONDS = 4 * 60 * 60;

export interface IncomingVisit {
  id: string;
  startedAt: number;
  endedAt: number;
  activeSeconds: number;
  private?: boolean;
  domain?: string;
  path?: string;
  title?: string;
  heading?: string;
  description?: string;
  searchQuery?: string;
  keystrokes?: number;
  clicks?: number;
  scrollDepth?: number;
  mediaSeconds?: number;
  /** Page text, sent only for pages privacy.js allows to be read (public reading). */
  read?: IncomingRead;
}

const clampInt = (n: unknown, max: number) => Math.max(0, Math.min(max, Math.round(Number(n) || 0)));

/** Validate and re-apply the privacy rules. Returns null for anything malformed. */
type CleanVisit = Omit<typeof kanwatchVisits.$inferInsert, 'userId'>;

export function cleanVisit(v: IncomingVisit, now = Date.now()): CleanVisit | null {
  if (typeof v?.id !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(v.id)) return null;
  const startedAt = Number(v.startedAt);
  const endedAt = Number(v.endedAt);
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt) || endedAt < startedAt) return null;
  if (endedAt > now + 5 * 60 * 1000 || startedAt < now - RETENTION_DAYS * 86400000) return null;

  const span = Math.floor((endedAt - startedAt) / 1000);
  const activeSeconds = clampInt(v.activeSeconds, Math.min(span, MAX_VISIT_SECONDS));
  if (activeSeconds === 0) return null;

  const base = {
    id: v.id,
    startedAt: new Date(startedAt),
    endedAt: new Date(endedAt),
    activeSeconds,
  };

  const where = v.domain ? scrubUrl(`https://${String(v.domain).slice(0, 120)}${String(v.path || '/').slice(0, 300)}`) : null;
  const privateVisit =
    v.private === true ||
    !where ||
    isPrivateUrl(`https://${where.domain}${where.path}`) ||
    isPrivateTitle(v.title) ||
    isPrivateTitle(v.heading);

  if (privateVisit) return { ...base, isPrivate: true };

  return {
    ...base,
    isPrivate: false,
    domain: where.domain,
    path: where.path,
    title: scrubText(v.title, 200),
    heading: scrubText(v.heading, 200),
    description: scrubText(v.description, 300),
    searchQuery: scrubText(v.searchQuery, 120),
    keystrokes: clampInt(v.keystrokes, 100000),
    clicks: clampInt(v.clicks, 100000),
    scrollDepth: clampInt(v.scrollDepth, 100),
    mediaSeconds: clampInt(v.mediaSeconds, activeSeconds),
  };
}

export async function ingestVisits(userId: string, incoming: IncomingVisit[], tzOffsetMinutes: number | null) {
  const now = Date.now();
  const cleaned = incoming.slice(0, MAX_VISITS_PER_BATCH).map((v) => cleanVisit(v, now)).filter((v) => v !== null);

  // Ids are the extension's; a retried upload must not double-count time.
  const existing = cleaned.length
    ? await db.query.kanwatchVisits.findMany({
        where: and(eq(kanwatchVisits.userId, userId), inArray(kanwatchVisits.id, cleaned.map((v) => v.id))),
        columns: { id: true },
      })
    : [];
  const seen = new Set(existing.map((e) => e.id));
  const fresh = cleaned.filter((v) => !seen.has(v.id));

  if (fresh.length > 0) {
    const open = await db.query.kanwatchEpisodes.findFirst({
      where: and(eq(kanwatchEpisodes.userId, userId), eq(kanwatchEpisodes.status, 'open')),
    });

    const { episodes, visitEpisode, closed } = assignEpisodes(
      fresh.map((v) => ({
        id: v.id,
        startedAt: v.startedAt!.getTime(),
        endedAt: v.endedAt!.getTime(),
        activeSeconds: v.activeSeconds ?? 0,
        isPrivate: !!v.isPrivate,
      })),
      open
        ? {
            id: open.id,
            startedAt: open.startedAt.getTime(),
            endedAt: open.endedAt.getTime(),
            activeSeconds: open.activeSeconds,
            privateSeconds: open.privateSeconds,
          }
        : null,
      () => nanoid(),
    );

    for (const ep of episodes) {
      const values = {
        startedAt: new Date(ep.startedAt),
        endedAt: new Date(ep.endedAt),
        activeSeconds: ep.activeSeconds,
        privateSeconds: ep.privateSeconds,
        status: closed.includes(ep.id) ? ('closed' as const) : ('open' as const),
        updatedAt: new Date(),
      };
      if (ep.isNew) {
        await db.insert(kanwatchEpisodes).values({ id: ep.id, userId, tzOffsetMinutes, ...values });
      } else {
        await db.update(kanwatchEpisodes).set(values).where(eq(kanwatchEpisodes.id, ep.id));
      }
    }

    await db.insert(kanwatchVisits).values(
      fresh.map((v) => ({ ...v, userId, episodeId: visitEpisode.get(v.id) ?? null })),
    ).onConflictDoNothing();

    // Page reads ride along with their visit; recordRead re-checks the privacy rules.
    const incomingById = new Map(incoming.map((v) => [v?.id, v]));
    for (const v of fresh) {
      const read = incomingById.get(v.id)?.read;
      if (read && !v.isPrivate) await recordRead(userId, read, v.activeSeconds ?? 0, v.endedAt!);
    }
  }

  await closeStaleEpisodes(userId, now);

  // Raw visits are the detailed record; they do not outlive the retention window.
  await db.delete(kanwatchVisits).where(and(
    eq(kanwatchVisits.userId, userId),
    lt(kanwatchVisits.startedAt, new Date(now - RETENTION_DAYS * 86400000)),
  ));

  await expireReadText(userId);

  return { received: incoming.length, stored: fresh.length };
}

/** An open episode nobody has added to for a while is finished. */
export async function closeStaleEpisodes(userId: string, now = Date.now()) {
  await db.update(kanwatchEpisodes)
    .set({ status: 'closed', updatedAt: new Date() })
    .where(and(
      eq(kanwatchEpisodes.userId, userId),
      eq(kanwatchEpisodes.status, 'open'),
      lt(kanwatchEpisodes.endedAt, new Date(now - GAP_MS)),
    ));
}
