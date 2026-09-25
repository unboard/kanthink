/**
 * The extension's key. A random token shown once, stored only as its SHA-256, so
 * a database leak does not hand anyone a working key. Revoking it is immediate.
 */

import { createHash, randomBytes } from 'crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { kanwatchTokens } from '@/lib/db/schema';

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function issueToken(userId: string, label = 'Chrome'): Promise<string> {
  const token = `kw_${randomBytes(32).toString('base64url')}`;
  await db.insert(kanwatchTokens).values({ userId, tokenHash: hashToken(token), label });
  return token;
}

/** The user a `Bearer kw_…` header belongs to, or null. */
export async function userFromBearer(header: string | null, extensionVersion?: string | null): Promise<string | null> {
  const token = header?.match(/^Bearer\s+(kw_[A-Za-z0-9_-]{20,})$/)?.[1];
  if (!token) return null;
  const row = await db.query.kanwatchTokens.findFirst({
    where: and(eq(kanwatchTokens.tokenHash, hashToken(token)), isNull(kanwatchTokens.revokedAt)),
  });
  if (!row) return null;
  const version = extensionVersion && /^\d+\.\d+\.\d+$/.test(extensionVersion) ? extensionVersion : null;
  await db.update(kanwatchTokens)
    .set({ lastUsedAt: new Date(), ...(extensionVersion !== undefined ? { extensionVersion: version } : {}) })
    .where(eq(kanwatchTokens.id, row.id));
  return row.userId;
}
