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

/**
 * What a session has actually proved.
 *
 * 'verified' — a code from this address was entered in THIS browser.
 * 'purchase' — a payment completed in this browser using this address.
 *
 * They are not the same claim and must not grant the same things. Stripe never
 * checks that `customer_email` belongs to the payer, so a purchase proves a card,
 * not an inbox. Someone paying with a stranger's address gets the app they paid
 * for and nothing of that stranger's.
 */
export type AccessScope = 'verified' | 'purchase';

const SCOPE_CODES: Record<AccessScope, string> = { verified: 'v', purchase: 'p' };
const SCOPE_BY_CODE: Record<string, AccessScope> = { v: 'verified', p: 'purchase' };

export interface AccessSession {
  appUserId: string;
  scope: AccessScope;
  epoch: number;
  /**
   * For a purchase session, the purchase that granted it.
   *
   * Without this, two purchases sharing an email share a session: refund one and
   * the refunded buyer keeps getting in on the other's payment. A purchase session
   * is access to the thing it bought, not to the address it bought under.
   */
  purchaseId: string | null;
}

/** No purchase to name — a verified session is not tied to one. */
const NO_REF = '-';

function sessionHmac(appUserId: string, epoch: number, scopeCode: string, ref: string): string {
  return crypto
    .createHmac('sha256', `${SECRET}:app-user`)
    .update(`${appUserId}:${epoch}:${scopeCode}:${ref}`)
    .digest('hex')
    .slice(0, 32);
}

/**
 * Mint a session token.
 *
 * Four segments, where the old format had two. That is deliberate and load-bearing:
 * every cookie issued before sessions carried proof fails to parse here, and no
 * later event can bring one back. Verification used to be a flag on the row, so the
 * genuine customer proving their address re-enabled every stale cookie for it —
 * the invalidation undid itself.
 *
 * `epoch` comes from the member row, so bumping it signs every outstanding session
 * for that person out at once.
 */
export function signAccessToken(
  appUserId: string,
  epoch: number,
  scope: AccessScope,
  purchaseId?: string | null,
): string {
  const code = SCOPE_CODES[scope];
  const ref = scope === 'purchase' ? (purchaseId ?? NO_REF) : NO_REF;
  return `${appUserId}.${epoch}.${code}.${ref}.${sessionHmac(appUserId, epoch, code, ref)}`;
}

/**
 * Read a session token back.
 *
 * Returns null for anything that is not a well-formed, correctly signed four-part
 * token — which includes every cookie minted before this format existed.
 */
export function verifyAccessToken(token: string | null | undefined): AccessSession | null {
  if (!token || typeof token !== 'string') return null;

  const parts = token.split('.');
  if (parts.length !== 5) return null;

  const [appUserId, epochRaw, scopeCode, ref, hmac] = parts;
  if (!appUserId || !ref || !SCOPE_BY_CODE[scopeCode]) return null;

  const epoch = Number(epochRaw);
  if (!Number.isInteger(epoch) || epoch < 0) return null;

  const expected = sessionHmac(appUserId, epoch, scopeCode, ref);
  if (hmac.length !== expected.length) return null;
  try {
    if (!crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(expected))) return null;
  } catch {
    return null;
  }

  return {
    appUserId,
    scope: SCOPE_BY_CODE[scopeCode],
    epoch,
    purchaseId: ref === NO_REF ? null : ref,
  };
}

/**
 * Does this token still belong to this row?
 *
 * The signature only proves the token was minted here. This proves it has not been
 * revoked since, and that it is for the row the caller thinks it is.
 */
export function sessionMatchesMember(
  session: AccessSession | null | undefined,
  member: { id: string; appId: string; sessionEpoch?: number | null } | null | undefined,
  appId: string,
): boolean {
  if (!session || !member) return false;
  if (member.appId !== appId) return false;
  if (session.appUserId !== member.id) return false;
  return session.epoch === (member.sessionEpoch ?? 0);
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

/**
 * One purchase, as an access decision sees it.
 *
 * Deliberately not the customer: a customer is an address, and an address can have
 * bought the same app twice. Entitlement belongs to the purchase.
 */
export interface PurchaseRef {
  id: string;
  status: 'active' | 'refunded' | 'canceled' | 'expired';
  /** Subscriptions lapse; a one-time purchase never does. */
  accessExpiresAt?: Date | null;
}

/** Is this purchase currently granting anything? */
export function isPurchaseActive(purchase: PurchaseRef, now: Date = new Date()): boolean {
  if (purchase.status !== 'active') return false;
  if (purchase.accessExpiresAt && purchase.accessExpiresAt.getTime() < now.getTime()) return false;
  return true;
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

/**
 * Does this person get in right now?
 *
 * Three questions, and the first one is the one that was missing: is this actually
 * them. A paid row used to be enough, so a paid row plus a guessed email address was
 * enough. Payment says the account is entitled; verification says the person at the
 * keyboard is the account.
 *
 * A grant made before verification existed has no verifiedAt, so it fails here — the
 * session stops working and the real customer proves the address once and carries on
 * without paying again.
 */
export function hasActiveAccess(
  app: PaywallState,
  session: AccessSession | null | undefined,
  purchases: PurchaseRef[],
  now: Date = new Date(),
): boolean {
  if (!isPaywalled(app)) return true;

  // Typing an address mints no session, so this is what an impostor holds.
  if (!session) return false;

  // A purchase session gets in on the purchase it names and nothing else. Refund
  // that one and it is out, however many siblings the address has — which is the
  // whole point of a purchase being a row rather than a field on a customer.
  if (session.scope === 'purchase') {
    const mine = purchases.find((p) => p.id === session.purchaseId);
    return !!mine && isPurchaseActive(mine, now);
  }

  // A verified session is the person, not a transaction, so any live purchase of
  // theirs keeps them in — refunding one of two does not lock them out.
  return purchases.some((p) => isPurchaseActive(p, now));
}

/**
 * May this person read the private things attached to their row — their support
 * thread, their billing?
 *
 * Separate from hasActiveAccess because a free app grants entry to everybody while
 * still holding one private conversation per person. Reading that conversation is
 * not the same act as opening the app, and only one of them needs proof.
 */
export function canReadPrivateData(session: AccessSession | null | undefined): boolean {
  // Only a code entered in this browser. A purchase is not proof of the inbox, so a
  // purchase-scope session may open the app and never sees the conversation or the
  // billing attached to the address it paid with.
  return session?.scope === 'verified';
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
