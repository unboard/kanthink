import crypto from 'crypto';

/**
 * Proving that an email address belongs to whoever typed it.
 *
 * This exists because it did not. A returning customer used to get back in by
 * typing the address they bought with — which meant anyone who knew that address
 * got the same thing: the paid app, and the private support thread with its owner.
 * The convenience and the hole were the same line of code.
 *
 * A six-digit code, mailed to the address, is the smallest thing that closes it
 * without pushing a buyer into making an account. Deliberately not a password, not
 * an OAuth hop, not a Kanthink login: someone who paid four dollars for a maths
 * game should still never see a Kanban board.
 *
 * All the numbers below are here rather than inline because the safety of this is
 * the relationship between them: six digits is only enough because guesses are
 * capped at five and the code dies after fifteen minutes.
 */

/** Long enough to be unguessable within the attempt cap, short enough to retype. */
const CODE_LENGTH = 6;

/** A code is a one-sitting thing. Fifteen minutes is generous for finding an email. */
export const CODE_TTL_MS = 15 * 60 * 1000;

/**
 * Wrong guesses allowed against one code.
 *
 * Five of a million is the whole security argument: an attacker gets five tries,
 * then the code is dead and a fresh one goes to the real owner's inbox — not theirs.
 */
export const MAX_ATTEMPTS = 5;

/** Codes a single address can be sent in one window, so this cannot mailbomb anyone. */
export const MAX_SENDS_PER_WINDOW = 5;
export const SEND_WINDOW_MS = 60 * 60 * 1000;

/** Minimum gap between codes, so a held-down button does not send twenty. */
export const RESEND_COOLDOWN_MS = 30 * 1000;

const SECRET = process.env.PLAYGROUND_TOKEN_SECRET
  || process.env.NEXTAUTH_SECRET
  || process.env.AUTH_SECRET
  || 'kanthink-playground-dev-secret';

/**
 * A fresh code.
 *
 * randomInt rather than Math.random: this is a credential, and Math.random is
 * predictable from previous outputs.
 */
export function generateCode(): string {
  const max = 10 ** CODE_LENGTH;
  return String(crypto.randomInt(0, max)).padStart(CODE_LENGTH, '0');
}

/**
 * What gets stored. Scoped to the member so a code cannot be replayed against a
 * different row, and hashed so a database read does not hand over live codes.
 */
export function hashCode(appUserId: string, code: string): string {
  return crypto.createHmac('sha256', `${SECRET}:app-code`).update(`${appUserId}:${code}`).digest('hex');
}

/** Constant-time compare, so the check does not leak the code a digit at a time. */
export function codeMatches(appUserId: string, code: string, storedHash: string | null | undefined): boolean {
  if (!storedHash) return false;
  const candidate = hashCode(appUserId, code);
  if (candidate.length !== storedHash.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(storedHash));
  } catch {
    return false;
  }
}

/** The verification-related fields of an app_users row. */
export interface VerificationState {
  verifiedAt?: Date | null;
  verificationCodeHash?: string | null;
  verificationExpiresAt?: Date | null;
  verificationAttempts?: number | null;
  verificationSentAt?: Date | null;
  verificationSendCount?: number | null;
}

export type SendDecision =
  | { ok: true; resetWindow: boolean }
  | { ok: false; reason: 'cooldown' | 'too_many'; retryAfterMs: number };

/**
 * May we send this address another code?
 *
 * The window resets rather than sliding: simpler to reason about, and the failure
 * mode of a reset window (one extra code at a boundary) is harmless here.
 */
export function canSendCode(state: VerificationState, now: number = Date.now()): SendDecision {
  const sentAt = state.verificationSentAt?.getTime();

  if (sentAt !== undefined) {
    const since = now - sentAt;
    if (since < RESEND_COOLDOWN_MS) {
      return { ok: false, reason: 'cooldown', retryAfterMs: RESEND_COOLDOWN_MS - since };
    }
    if (since > SEND_WINDOW_MS) {
      return { ok: true, resetWindow: true };
    }
    if ((state.verificationSendCount ?? 0) >= MAX_SENDS_PER_WINDOW) {
      return { ok: false, reason: 'too_many', retryAfterMs: SEND_WINDOW_MS - since };
    }
  }

  return { ok: true, resetWindow: sentAt === undefined };
}

export type CheckResult = 'ok' | 'no_code' | 'expired' | 'locked' | 'wrong';

/**
 * Check a submitted code against the stored one.
 *
 * Pure, so the outcome can be tested without a database. The caller is responsible
 * for writing the consequence — clearing the code on success, counting the attempt
 * on failure — because those are the same write and should not race each other.
 */
export function checkCode(
  appUserId: string,
  submitted: string,
  state: VerificationState,
  now: number = Date.now(),
): CheckResult {
  if (!state.verificationCodeHash) return 'no_code';
  if ((state.verificationAttempts ?? 0) >= MAX_ATTEMPTS) return 'locked';

  const expiresAt = state.verificationExpiresAt?.getTime();
  if (expiresAt === undefined || expiresAt < now) return 'expired';

  const clean = submitted.replace(/\D/g, '');
  if (clean.length !== CODE_LENGTH) return 'wrong';

  return codeMatches(appUserId, clean, state.verificationCodeHash) ? 'ok' : 'wrong';
}

/** Has this person proved the address? The gate every read of their data runs through. */
export function isVerified(state: VerificationState | null | undefined): boolean {
  return !!state?.verifiedAt;
}

/** A sentence for whoever is looking at the form. */
export function messageForCheck(result: CheckResult): string {
  switch (result) {
    case 'expired': return 'That code has expired. Send a new one.';
    case 'locked': return 'Too many wrong codes. Send a new one to try again.';
    case 'no_code': return 'No code is waiting. Send one first.';
    case 'wrong': return 'That code is not right.';
    case 'ok': return '';
  }
}
