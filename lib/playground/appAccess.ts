import crypto from 'crypto';

/**
 * Who is allowed to open a paid app, and how they prove it.
 *
 * A published app is a page on the open internet, and the person who buys one for
 * four dollars should not have to create a Kanban board to use it. So access is not
 * a Kanthink session: it is an email, a row in `app_users`, and a signed token that
 * lives in a cookie on the app's own page and in the link the receipt email carries.
 *
 * Token format mirrors lib/playground/appToken: `<appUserId>.<hmac>`. Stateless, no
 * expiry in the token itself — expiry is a column, so a refund or a cancelled
 * subscription takes effect on the next page load rather than whenever a JWT
 * happens to lapse.
 */
const SECRET = process.env.PLAYGROUND_TOKEN_SECRET
  || process.env.NEXTAUTH_SECRET
  || process.env.AUTH_SECRET
  || 'kanthink-playground-dev-secret';

function hmacFor(appUserId: string): string {
  return crypto
    .createHmac('sha256', `${SECRET}:app-user`)
    .update(appUserId)
    .digest('hex')
    .slice(0, 32);
}

export function signAccessToken(appUserId: string): string {
  return `${appUserId}.${hmacFor(appUserId)}`;
}

export function verifyAccessToken(token: string | null | undefined): string | null {
  if (!token || typeof token !== 'string') return null;
  const dot = token.lastIndexOf('.');
  if (dot < 1) return null;
  const appUserId = token.slice(0, dot);
  const hmac = token.slice(dot + 1);
  const expected = hmacFor(appUserId);
  if (hmac.length !== expected.length) return null;
  try {
    return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(expected)) ? appUserId : null;
  } catch {
    return null;
  }
}

/**
 * One cookie per app rather than one cookie for all of them.
 *
 * Somebody who buys two apps from the same publisher needs both grants at once, and
 * a single cookie would have the second purchase quietly evict the first.
 */
export function accessCookieName(appId: string): string {
  return `kt_app_${appId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
}

export interface AccessSubject {
  status: 'free' | 'paid' | 'refunded' | 'canceled';
  accessExpiresAt?: Date | null;
}

export interface PaywallState {
  paywallEnabled?: boolean | null;
  priceAmount?: number | null;
  stripePriceId?: string | null;
}

/**
 * Is this app actually charging?
 *
 * The flag alone is not enough: an app with the paywall switched on but no price
 * configured would otherwise lock everyone out of something nobody can buy.
 */
export function isPaywalled(app: PaywallState): boolean {
  return Boolean(app.paywallEnabled && app.priceAmount && app.priceAmount > 0 && app.stripePriceId);
}

/** Does this person get in right now? */
export function hasActiveAccess(
  app: PaywallState,
  member: AccessSubject | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!isPaywalled(app)) return true;
  if (!member) return false;
  if (member.status !== 'paid') return false;
  // Subscriptions carry an expiry; a one-time purchase does not, and never lapses.
  if (member.accessExpiresAt && member.accessExpiresAt.getTime() < now.getTime()) return false;
  return true;
}

/** `$4.00`, `$4.00/mo`, `Free`. Minor units in, something a buyer can read out. */
export function formatAppPrice(
  amount: number | null | undefined,
  currency: string | null | undefined,
  interval: 'one_time' | 'month' | 'year' | null | undefined,
): string {
  if (!amount || amount <= 0) return 'Free';
  const code = (currency || 'usd').toUpperCase();
  let money: string;
  try {
    money = new Intl.NumberFormat('en-US', { style: 'currency', currency: code }).format(amount / 100);
  } catch {
    money = `${(amount / 100).toFixed(2)} ${code}`;
  }
  if (interval === 'month') return `${money}/mo`;
  if (interval === 'year') return `${money}/yr`;
  return money;
}

/**
 * A publisher's page slug.
 *
 * Lowercase, hyphenated, no leading or trailing punctuation. Reserved words are
 * rejected rather than silently mangled, because `/apps/u/new` quietly not being
 * your page is a worse outcome than being told to pick another name.
 */
const RESERVED_SLUGS = new Set([
  'new', 'edit', 'settings', 'admin', 'api', 'u', 'me', 'apps', 'app', 'play', 'p', 'public',
]);

export function normalizeAppPageSlug(input: string): string | null {
  const slug = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  if (slug.length < 3) return null;
  if (RESERVED_SLUGS.has(slug)) return null;
  return slug;
}
