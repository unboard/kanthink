import crypto from 'crypto';

/**
 * Per-app auth tokens for sandboxed playground iframes.
 *
 * The iframe runs with an opaque origin (no allow-same-origin) so it has no
 * cookies and cannot use the user's session. Instead we bake a signed token
 * into the srcdoc at build time. The server verifies it and resolves which app
 * (and thus which source card, owner, and BYOK key) the request is for.
 *
 * A token also says WHICH COPY of the app is running. The same generated code is
 * served two ways — the published release that customers get, and the draft the
 * owner is iterating on — and they must not share a place to write. Without the
 * distinction, testing whether saving works in a draft would overwrite what real
 * customers had stored.
 *
 * Format: `<appId>.<hmac>` for a live release, `<appId>.draft.<hmac>` for a draft.
 * Short, stateless, no expiry. Owners revoke by deleting the app or flipping it
 * private; the AI route checks both.
 */
const SECRET = process.env.PLAYGROUND_TOKEN_SECRET
  || process.env.NEXTAUTH_SECRET
  || process.env.AUTH_SECRET
  || 'kanthink-playground-dev-secret';

/** Draft tokens are signed over a different string, so one cannot be filed as the other. */
function hmacFor(appId: string, isDraft: boolean): string {
  return crypto
    .createHmac('sha256', SECRET)
    .update(isDraft ? `draft:${appId}` : appId)
    .digest('hex')
    .slice(0, 32);
}

/** The token baked into a published release. Writes reach real customer data. */
export function signAppToken(appId: string): string {
  return `${appId}.${hmacFor(appId, false)}`;
}

/** The token baked into an owner's draft preview. Writes are kept off to one side. */
export function signDraftAppToken(appId: string): string {
  return `${appId}.draft.${hmacFor(appId, true)}`;
}

export interface AppTokenClaims {
  appId: string;
  /** True when this is an owner previewing a draft rather than anyone using the app. */
  isDraft: boolean;
}

/**
 * Read a token back.
 *
 * Returns the app AND whether it is a draft, because every caller that writes has
 * to know — and a signature alone cannot tell them, which is why the two forms are
 * signed over different strings rather than distinguished by a flag in the payload.
 */
export function verifyAppToken(token: string | null | undefined): AppTokenClaims | null {
  if (!token || typeof token !== 'string') return null;

  const parts = token.split('.');
  let appId: string;
  let isDraft: boolean;
  let hmac: string;

  if (parts.length === 2) {
    [appId, hmac] = parts;
    isDraft = false;
  } else if (parts.length === 3 && parts[1] === 'draft') {
    appId = parts[0];
    hmac = parts[2];
    isDraft = true;
  } else {
    return null;
  }

  if (!appId) return null;

  const expected = hmacFor(appId, isDraft);
  if (hmac.length !== expected.length) return null;
  try {
    return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(expected))
      ? { appId, isDraft }
      : null;
  } catch {
    return null;
  }
}
