/**
 * The board as Kanwatch sees it: your channels, what they're about, and the folders
 * they sit in — plus a fingerprint of all that.
 *
 * Every read records the fingerprint it was made against. When the board changes (a
 * channel added, renamed, re-described, or moved into a folder), stretches read
 * against the old board and not yet answered by you are read again, so a new "Work"
 * channel in your MyCreativeShop folder can claim the MyCreativeShop time it should.
 */

import { and, desc, eq, gte, inArray, isNull, lt, ne, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { channels, folders, kanwatchEpisodes, userChannelOrg } from '@/lib/db/schema';
import type { Access } from '@/lib/voice/resolveReference';

export interface BoardChannel {
  id: string;
  name: string;
  description: string | null;
  folder: string | null;
}

function fnv(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16);
}

/** Channels you can reach, most recently active first, each with its folder. */
export async function loadBoard(userId: string, access: Access): Promise<{ channels: BoardChannel[]; signature: string }> {
  if (access.readable.length === 0) return { channels: [], signature: 'empty' };
  const [rows, org, folderRows] = await Promise.all([
    db.query.channels.findMany({
      where: inArray(channels.id, access.readable),
      columns: { id: true, name: true, description: true },
      orderBy: [desc(channels.updatedAt)],
    }),
    db.query.userChannelOrg.findMany({ where: eq(userChannelOrg.userId, userId), columns: { channelId: true, folderId: true } }),
    db.query.folders.findMany({ where: eq(folders.userId, userId), columns: { id: true, name: true } }),
  ]);
  const folderName = new Map(folderRows.map((f) => [f.id, f.name]));
  const folderOf = new Map(org.map((o) => [o.channelId, o.folderId ? folderName.get(o.folderId) ?? null : null]));
  const list = rows.map((c) => ({ id: c.id, name: c.name, description: c.description, folder: folderOf.get(c.id) ?? null }));

  return { channels: list, signature: boardSignature(list) };
}

/** Order-independent, and blind to activity: only what changes a classification. */
export function boardSignature(list: BoardChannel[]): string {
  return fnv(
    [...list]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((c) => `${c.id}\u0001${c.name}\u0001${(c.description ?? '').slice(0, 140)}\u0001${c.folder ?? ''}`)
      .join('\u0002'),
  );
}

/**
 * Queue re-reads for stretches in [from, to) that were read against a different board
 * and that you haven't answered. Returns how many were queued.
 */
export async function requeueForBoardChange(userId: string, access: Access, from: number, to: number): Promise<number> {
  const { signature } = await loadBoard(userId, access);
  const stale = await db.query.kanwatchEpisodes.findMany({
    where: and(
      eq(kanwatchEpisodes.userId, userId),
      gte(kanwatchEpisodes.startedAt, new Date(from)),
      lt(kanwatchEpisodes.startedAt, new Date(to)),
      isNull(kanwatchEpisodes.verdict),
      eq(kanwatchEpisodes.status, 'judged'),
      ne(kanwatchEpisodes.guessKind, 'private'),
      or(isNull(kanwatchEpisodes.boardSig), ne(kanwatchEpisodes.boardSig, signature)),
    ),
    columns: { id: true },
  });
  if (stale.length === 0) return 0;
  await db.update(kanwatchEpisodes)
    .set({ status: 'closed' })
    .where(inArray(kanwatchEpisodes.id, stale.map((e) => e.id)));
  return stale.length;
}
