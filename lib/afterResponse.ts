import { after } from 'next/server'

/**
 * Run work once the response has been sent.
 *
 * Shroom triggers do this: they make an LLM call, so doing it inline would add seconds
 * to adding or dragging a card. A plain floating promise isn't enough on serverless —
 * the function can be frozen the moment the response goes out, silently dropping the
 * run — which is what `after()` exists to prevent.
 *
 * `after()` throws when there's no request scope (unit tests calling a route handler
 * directly, scripts). Falling back keeps those callers working without changing what
 * happens in production.
 */
export function afterResponse(work: () => Promise<void>): void {
  try {
    after(() => work().catch((error) => {
      console.error('[afterResponse] Deferred work failed:', error)
    }))
  } catch {
    void work().catch(() => {})
  }
}
