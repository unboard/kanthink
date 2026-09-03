import crypto from 'crypto';

/**
 * Per-app auth tokens for sandboxed playground iframes.
 *
 * The iframe runs with an opaque origin (no allow-same-origin) so it has no
 * cookies and cannot use the user's session. Instead we bake a signed token
 * into the srcdoc at build time. The server verifies it and resolves which app
 * (and thus which source card, owner, and BYOK key) the request is for.
 *
 * Format: `<appId>.<hmac>` — short, stateless, no expiry. Owners revoke by
 * deleting the app or flipping it private; the AI route checks both.
 */
const SECRET = process.env.PLAYGROUND_TOKEN_SECRET
  || process.env.NEXTAUTH_SECRET
  || process.env.AUTH_SECRET
  || 'kanthink-playground-dev-secret';

function hmacFor(appId: string): string {
  return crypto
    .createHmac('sha256', SECRET)
    .update(appId)
    .digest('hex')
    .slice(0, 32);
}

export function signAppToken(appId: string): string {
  return `${appId}.${hmacFor(appId)}`;
}

export function verifyAppToken(token: string | null | undefined): string | null {
  if (!token || typeof token !== 'string') return null;
  const dot = token.lastIndexOf('.');
  if (dot < 1) return null;
  const appId = token.slice(0, dot);
  const hmac = token.slice(dot + 1);
  const expected = hmacFor(appId);
  if (hmac.length !== expected.length) return null;
  try {
    if (crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(expected))) {
      return appId;
    }
  } catch {
    return null;
  }
  return null;
}
