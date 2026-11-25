import { db } from '@/lib/db'
import { playgroundApps } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

/**
 * A build's phases as they happen, written to the app row so whoever is waiting can
 * show them as a trace, and how it ended once it has.
 *
 * The ending matters as much as the steps. A build runs for minutes, and a phone
 * drops a connection held that long (screen lock, a network switch, the browser
 * pausing the tab). When the only report of a failure was the response to that
 * connection, a failed build said nothing at all: the person saw "Failed to fetch"
 * and the real reason ("the app got too long for one response") was lost. The
 * outcome is written here, so a build reports to whoever checks, whenever they do.
 */

export type BuildStep = { label: string; status: 'running' | 'done' | 'error'; at: number }

export type BuildProgress = {
  startedAt: number
  steps: BuildStep[]
  /** Set when the build has ended, one way or the other. */
  finishedAt?: number
  /** Why it failed, in words for the person who asked. */
  error?: string
  /** It ended without a build: Kan asked something, or there was nothing to change. */
  note?: string
}

/** Still running, as opposed to finished or never started. */
export function isBuilding(p: BuildProgress | null | undefined, now = Date.now()): boolean {
  // A build can't outlive its function (800s), so an old unfinished one died with it.
  return Boolean(p && !p.finishedAt && now - p.startedAt < 15 * 60_000)
}

/** The running step finishes and the next one starts. */
export function advance(steps: BuildStep[], label: string, now = Date.now()): BuildStep[] {
  return [
    ...steps.map((s) => (s.status === 'running' ? { ...s, status: 'done' as const } : s)),
    { label, status: 'running', at: now },
  ]
}

export function buildTracker(appId: string) {
  const startedAt = Date.now()
  let steps: BuildStep[] = []
  const write = (value: BuildProgress | null) =>
    db.update(playgroundApps).set({ buildProgress: value }).where(eq(playgroundApps.id, appId))
      // Progress is a courtesy. A failed write must never fail the build.
      .then(() => {}, () => {})
  return {
    step(label: string) {
      steps = advance(steps, label)
      return write({ startedAt, steps })
    },
    /** How it ended. Kept on the row until the next build starts. */
    finish(outcome: { error?: string; note?: string }) {
      const now = Date.now()
      const closed = steps.map((s) => (s.status === 'running' ? { ...s, status: outcome.error ? 'error' as const : 'done' as const } : s))
      return write({ startedAt, steps: closed, finishedAt: now, ...outcome })
    },
    clear() {
      return write(null)
    },
  }
}

export type BuildTracker = ReturnType<typeof buildTracker>
