import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { printPartners } from '@/lib/db/schema'
import { resolveProviderKeys } from '@/lib/ai/keys'
import { recordUsage } from '@/lib/usage'

/**
 * The monthly AI allowance, as print sees it.
 *
 * Print renders are the costliest AI work in Kanthink, so they're metered like the
 * rest — unless an admin has set the account's print work as unmetered (a partner
 * printer, a demo account). That exemption covers print only: the account's chat,
 * shrooms and apps keep their usual limit.
 */

export async function printUnmetered(userId: string): Promise<boolean> {
  const row = await db.query.printPartners.findFirst({ where: eq(printPartners.userId, userId), columns: { unmetered: true } }).catch(() => null)
  return !!row?.unmetered
}

/** The keys print may use: past the allowance when the account is unmetered. */
export async function printProviderKeys(userId: string) {
  return resolveProviderKeys(userId, { unmetered: await printUnmetered(userId) })
}

/** Count print work against the allowance, unless the account is unmetered. */
export async function recordPrintUsage(userId: string, requestType: string): Promise<void> {
  if (await printUnmetered(userId)) return
  await recordUsage(userId, requestType)
}
