import crypto from 'crypto';

/**
 * Per-card auth tokens for sandboxed playground iframes.
 *
 * The iframe runs with an opaque origin (no allow-same-origin) so it has no
 * cookies and cannot use the user's session. Instead we bake a signed token
 * into the srcdoc at build time. The server can verify the token and resolve
 * which card (and thus which owner / BYOK key) the request is for.
 *
 * Format: `<cardId>.<hmac>` — short, stateless, no expiry. Owners can revoke
 * by deleting the card or flipping it private (the AI route checks both).
 */
const SECRET = process.env.PLAYGROUND_TOKEN_SECRET
  || process.env.NEXTAUTH_SECRET
  || process.env.AUTH_SECRET
  || 'kanthink-playground-dev-secret';

function hmacFor(cardId: string): string {
  return crypto
    .createHmac('sha256', SECRET)
    .update(cardId)
    .digest('hex')
    .slice(0, 32);
}

export function signCardToken(cardId: string): string {
  return `${cardId}.${hmacFor(cardId)}`;
}

export function verifyCardToken(token: string | null | undefined): string | null {
  if (!token || typeof token !== 'string') return null;
  const dot = token.lastIndexOf('.');
  if (dot < 1) return null;
  const cardId = token.slice(0, dot);
  const hmac = token.slice(dot + 1);
  const expected = hmacFor(cardId);
  if (hmac.length !== expected.length) return null;
  try {
    if (crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(expected))) {
      return cardId;
    }
  } catch {
    return null;
  }
  return null;
}
