import crypto from 'crypto'

/**
 * A stable-ish key for a visitor who has not identified themselves.
 *
 * Only used to apply the per-customer allowance to people with no session. It is
 * deliberately weak: the app and owner ceilings are what actually bound the bill,
 * and they need no identity at all. This just stops one anonymous visitor burning
 * a whole app's allowance in a single sitting.
 *
 * Hashed, and never stored raw, because it is derived from an address and a user
 * agent — enough to rate-limit, not something to keep in a table in the clear.
 */
export function identifyVisitor(request: Request): string {
  const headers = request.headers
  const ip =
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    headers.get('x-real-ip') ||
    'unknown'
  const agent = headers.get('user-agent') || 'unknown'

  return crypto
    .createHash('sha256')
    .update(`${ip}|${agent}`)
    .digest('hex')
    .slice(0, 32)
}
