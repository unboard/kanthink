import { db } from '@/lib/db'
import { playgroundAppVersions, playgroundApps } from '@/lib/db/schema'
import { and, desc, eq } from 'drizzle-orm'

/**
 * Publishing a release, and going back to an older one.
 *
 * Both are the same small idea: versions are append-only, and the app row holds a
 * pointer at whichever one customers currently get. Publishing appends and moves
 * the pointer; rolling back only moves it. Nothing is ever restored over anything,
 * so there is no state in which a rollback can half-succeed.
 *
 * What is deliberately NOT in a version: purchases, feedback, saved records. Those
 * belong to the app, so publishing and rolling back cannot touch them — the shape
 * of the data is the guarantee, rather than a rule every future caller has to know.
 */

export type AppRow = typeof playgroundApps.$inferSelect
export type AppVersion = typeof playgroundAppVersions.$inferSelect

/** The release customers are being served, or null if nothing has been published. */
export async function getPublishedVersion(app: AppRow): Promise<AppVersion | null> {
  if (!app.publishedVersionId) return null
  const version = await db.query.playgroundAppVersions.findFirst({
    where: eq(playgroundAppVersions.id, app.publishedVersionId),
  })
  // A pointer at a version that no longer exists means serve nothing, rather than
  // silently falling back to the draft — which is the behaviour being removed.
  return version && version.appId === app.id ? version : null
}

/** Every release, newest first. */
export async function listVersions(appId: string): Promise<AppVersion[]> {
  return db.query.playgroundAppVersions.findMany({
    where: eq(playgroundAppVersions.appId, appId),
    orderBy: [desc(playgroundAppVersions.version)],
  })
}

export type PublishResult =
  | { ok: true; version: AppVersion; reused: boolean }
  | { ok: false; error: string }

/**
 * Cut the current draft as a release and point customers at it.
 *
 * Republishing an unchanged draft is a no-op that returns the existing release
 * rather than a second identical one — the history is meant to be a list of what
 * actually changed, not a log of button presses.
 */
export async function publishDraft(app: AppRow, userId: string): Promise<PublishResult> {
  if (!app.code?.trim()) {
    return { ok: false, error: 'There is nothing built to publish yet.' }
  }

  const latest = (await listVersions(app.id))[0] ?? null

  if (latest && latest.code === app.code && app.publishedVersionId === latest.id) {
    return { ok: true, version: latest, reused: true }
  }

  // An identical release already exists further back — someone published, kept
  // working, then undid it. Point at that rather than minting a duplicate.
  if (latest && latest.code === app.code) {
    await db.update(playgroundApps)
      .set({ publishedVersionId: latest.id, updatedAt: new Date() })
      .where(eq(playgroundApps.id, app.id))
    return { ok: true, version: latest, reused: true }
  }

  const id = crypto.randomUUID()
  const now = new Date()
  await db.insert(playgroundAppVersions).values({
    id,
    appId: app.id,
    version: (latest?.version ?? 0) + 1,
    code: app.code,
    dependencies: app.dependencies ?? [],
    title: app.title,
    summary: app.summary,
    designNotes: app.designNotes,
    notes: app.lastNotes,
    sourceGeneration: app.generationCount,
    modelId: app.lastModelId,
    publishedAt: now,
    publishedBy: userId,
  })

  await db.update(playgroundApps)
    .set({ publishedVersionId: id, updatedAt: now })
    .where(eq(playgroundApps.id, app.id))

  const version = await db.query.playgroundAppVersions.findFirst({
    where: eq(playgroundAppVersions.id, id),
  })
  return { ok: true, version: version!, reused: false }
}

export type RollbackResult =
  | { ok: true; version: AppVersion }
  | { ok: false; error: string }

/**
 * Serve an earlier release again.
 *
 * The draft is untouched: rolling back is about what customers get, not about
 * throwing away work in progress. Whatever was being built is still there, and
 * publishing it again moves the pointer forward without anything being recovered.
 */
export async function rollbackTo(app: AppRow, versionId: string): Promise<RollbackResult> {
  const version = await db.query.playgroundAppVersions.findFirst({
    where: and(
      eq(playgroundAppVersions.id, versionId),
      eq(playgroundAppVersions.appId, app.id),
    ),
  })
  if (!version) return { ok: false, error: 'That release does not exist for this app.' }

  await db.update(playgroundApps)
    .set({ publishedVersionId: version.id, updatedAt: new Date() })
    .where(eq(playgroundApps.id, app.id))

  return { ok: true, version }
}

/**
 * Has the draft moved since the release customers are on?
 *
 * Compares the code rather than a timestamp: an edit that was undone leaves the
 * draft identical to the release, and calling that "unpublished changes" would be
 * a badge nobody can ever clear.
 */
export function hasUnpublishedChanges(app: AppRow, published: AppVersion | null): boolean {
  if (!app.code?.trim()) return false
  if (!published) return true
  return published.code !== app.code
}
