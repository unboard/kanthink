import { db } from '@/lib/db'
import { playgroundApps } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

/**
 * A build's phases as they happen, written to the app row so the drawer's status
 * poll can show them as a trace. A build is one long request; without this the
 * client knew only "building" for minutes at a time.
 */

export type BuildStep = { label: string; status: 'running' | 'done' | 'error'; at: number }

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
  const write = (value: { startedAt: number; steps: BuildStep[] } | null) =>
    db.update(playgroundApps).set({ buildProgress: value }).where(eq(playgroundApps.id, appId))
      // Progress is a courtesy. A failed write must never fail the build.
      .then(() => {}, () => {})
  return {
    step(label: string) {
      steps = advance(steps, label)
      return write({ startedAt, steps })
    },
    clear() {
      return write(null)
    },
  }
}

export type BuildTracker = ReturnType<typeof buildTracker>
