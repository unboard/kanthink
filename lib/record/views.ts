import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { recordingViews } from '@/lib/db/schema';

export interface ViewStats {
  /** Views by people other than the owner. This is the number worth quoting. */
  total: number;
  /** Of those, how many landed in the last 24 hours. */
  last24h: number;
}

const EMPTY: ViewStats = { total: 0, last24h: 0 };

function dayAgo(): Date {
  return new Date(Date.now() - 24 * 60 * 60 * 1000);
}

/** View stats for one recording. */
export async function getViewStats(recordingId: string): Promise<ViewStats> {
  const [row] = await db
    .select({
      total: sql<number>`count(*)`,
      last24h: sql<number>`sum(case when ${recordingViews.viewedAt} >= ${Math.floor(dayAgo().getTime() / 1000)} then 1 else 0 end)`,
    })
    .from(recordingViews)
    .where(and(eq(recordingViews.recordingId, recordingId), eq(recordingViews.isOwner, false)));

  return row ? { total: Number(row.total) || 0, last24h: Number(row.last24h) || 0 } : EMPTY;
}

/**
 * View stats for many recordings in one query — the gallery renders every
 * recording at once, so this must not be N queries.
 */
export async function getViewStatsFor(recordingIds: string[]): Promise<Map<string, ViewStats>> {
  const out = new Map<string, ViewStats>();
  if (recordingIds.length === 0) return out;

  const rows = await db
    .select({
      recordingId: recordingViews.recordingId,
      total: sql<number>`count(*)`,
      last24h: sql<number>`sum(case when ${recordingViews.viewedAt} >= ${Math.floor(dayAgo().getTime() / 1000)} then 1 else 0 end)`,
    })
    .from(recordingViews)
    .where(and(inArray(recordingViews.recordingId, recordingIds), eq(recordingViews.isOwner, false)))
    .groupBy(recordingViews.recordingId);

  for (const r of rows) {
    out.set(r.recordingId, { total: Number(r.total) || 0, last24h: Number(r.last24h) || 0 });
  }
  return out;
}

/** Where the views came from, most common first. Owner views excluded. */
export async function getViewSources(
  recordingId: string,
  limit = 5
): Promise<{ host: string; count: number }[]> {
  const rows = await db
    .select({
      host: recordingViews.referrerHost,
      count: sql<number>`count(*)`,
    })
    .from(recordingViews)
    .where(
      and(
        eq(recordingViews.recordingId, recordingId),
        eq(recordingViews.isOwner, false),
        gte(recordingViews.viewedAt, new Date(0))
      )
    )
    .groupBy(recordingViews.referrerHost)
    .orderBy(sql`count(*) desc`)
    .limit(limit);

  return rows.map((r) => ({ host: r.host || 'Direct / unknown', count: Number(r.count) || 0 }));
}
