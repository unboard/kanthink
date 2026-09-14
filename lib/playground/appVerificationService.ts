import { db } from '@/lib/db'
import { appUsers } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { sendAppAccessCodeEmail } from '@/lib/emails/send'
import {
  CODE_TTL_MS,
  SEND_WINDOW_MS,
  canSendCode,
  checkCode,
  generateCode,
  hashCode,
  messageForCheck,
  type CheckResult,
} from './appVerification'

/**
 * Issuing and checking access codes, against the database.
 *
 * Split from appVerification so the rules stay pure and testable and only the
 * writes live here. The two halves are deliberately not merged: every decision
 * worth getting right is in the pure half.
 */

export type IssueOutcome =
  | { sent: true }
  | { sent: false; error: string; retryAfterMs: number }

/**
 * Put a fresh code in this person's inbox.
 *
 * Any previous code is replaced, and the attempt counter resets with it — a new
 * code is a new five guesses, and the old one stops working the moment this lands.
 */
export async function issueAccessCode(
  member: typeof appUsers.$inferSelect,
  appTitle: string,
): Promise<IssueOutcome> {
  const decision = canSendCode(member)
  if (!decision.ok) {
    const seconds = Math.ceil(decision.retryAfterMs / 1000)
    return {
      sent: false,
      retryAfterMs: decision.retryAfterMs,
      error: decision.reason === 'cooldown'
        ? `Wait ${seconds} seconds before asking for another code.`
        : 'Too many codes requested for this address. Try again later.',
    }
  }

  const code = generateCode()
  const now = new Date()

  await db.update(appUsers).set({
    verificationCodeHash: hashCode(member.id, code),
    verificationExpiresAt: new Date(now.getTime() + CODE_TTL_MS),
    verificationAttempts: 0,
    verificationSentAt: now,
    verificationSendCount: decision.resetWindow ? 1 : (member.verificationSendCount ?? 0) + 1,
    updatedAt: now,
  }).where(eq(appUsers.id, member.id))

  // Awaited rather than fired and forgotten: if the mail does not go, the person is
  // staring at a code entry box for a code that will never arrive, and should be
  // told now rather than in fifteen minutes.
  const delivered = await sendAppAccessCodeEmail(member.email, {
    appTitle,
    code,
    expiresInMinutes: Math.round(CODE_TTL_MS / 60000),
  }).catch(() => false)

  if (!delivered) {
    return {
      sent: false,
      retryAfterMs: 0,
      error: 'Could not send the code. Check the address, or try again shortly.',
    }
  }

  return { sent: true }
}

export type VerifyOutcome =
  | { ok: true; member: typeof appUsers.$inferSelect }
  | { ok: false; error: string; result: CheckResult }

/**
 * Check a submitted code and, if it is right, mark the address proved.
 *
 * Success clears the code so it cannot be replayed. Failure counts the attempt —
 * five wrong guesses burn the code, and the next one goes to the real owner's inbox
 * rather than to whoever is guessing.
 */
export async function verifyAccessCode(
  member: typeof appUsers.$inferSelect,
  submitted: string,
): Promise<VerifyOutcome> {
  const result = checkCode(member.id, submitted, member)

  if (result !== 'ok') {
    if (result === 'wrong') {
      await db.update(appUsers)
        .set({ verificationAttempts: (member.verificationAttempts ?? 0) + 1, updatedAt: new Date() })
        .where(eq(appUsers.id, member.id))
    }
    return { ok: false, error: messageForCheck(result), result }
  }

  const now = new Date()
  await db.update(appUsers).set({
    // Keep the first verification date — it is when this person became real, and a
    // later re-verification on a new device is not a new relationship.
    verifiedAt: member.verifiedAt ?? now,
    verificationCodeHash: null,
    verificationExpiresAt: null,
    verificationAttempts: 0,
    updatedAt: now,
  }).where(eq(appUsers.id, member.id))

  const refreshed = await db.query.appUsers.findFirst({ where: eq(appUsers.id, member.id) })
  return { ok: true, member: refreshed ?? { ...member, verifiedAt: member.verifiedAt ?? now } }
}

/*
 * There is deliberately no "mark verified because they paid" helper here.
 *
 * There was one, and it was wrong: Stripe never checks that customer_email belongs
 * to the payer, so paying with a stranger's address would have handed over that
 * stranger's history. A purchase now mints a purchase-scope session, which opens
 * the app and nothing attached to the address. See lib/playground/appAccess.
 */

/** How long a send window runs, for messages that need to say so. */
export const SEND_WINDOW_MINUTES = Math.round(SEND_WINDOW_MS / 60000)
