import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { encrypt, decryptIfNeeded } from '@/lib/crypto'
import { resolveBillingUserId, checkUsageLimit } from '@/lib/usage'
import type { ModelProvider } from './modelCatalog'

/**
 * Which API keys an account can actually call, and where each one came from.
 *
 * Kanthink used to hold one key: a provider, a key, a model. That made the provider
 * a property of the *account* rather than of the choice, so picking an OpenAI model
 * with a Google key saved was not a thing that could work — the model preference
 * silently lost to whatever key happened to be stored.
 *
 * Now a key is held per provider and both can exist at once, so a model choice means
 * what it says. The old columns are still read, because accounts configured before
 * this still hold their key there; whichever provider they picked is folded into
 * that provider's slot. Nothing writes them any more, and an account that saves a
 * key for either provider leaves the old shape behind for good.
 *
 * Resolution order per provider, highest first:
 *   1. the user's own key for that provider  (`byok`)
 *   2. the legacy single key, if it was for that provider  (`byok`)
 *   3. the deployment's owner key, subject to quota  (`owner`)
 *   4. the legacy environment variable  (`env`)
 */

export type KeySource = 'byok' | 'owner' | 'env'

export interface ProviderKey {
  apiKey: string
  source: KeySource
}

export type ProviderKeys = Partial<Record<ModelProvider, ProviderKey>>

export interface ResolvedKeys {
  keys: ProviderKeys
  /** Set when a stored key exists but could not be decrypted. Worth surfacing. */
  error?: string
  /** True when the account is out of quota, so only its own keys are usable. */
  quotaExhausted?: boolean
  quotaMessage?: string
}

/**
 * Every key this user can call with.
 *
 * Owner and environment keys are included only while the account still has quota —
 * they are Kanthink's keys, and quota is the thing that meters them. A user's own
 * key is never metered, which is the whole point of bringing one.
 */
export async function resolveProviderKeys(userId: string): Promise<ResolvedKeys> {
  // Agent seats borrow the parent's keys at read time rather than holding copies,
  // so rotating a key is still a single edit in one place.
  const billingUserId = await resolveBillingUserId(userId)

  const user = await db.query.users.findFirst({
    where: eq(users.id, billingUserId),
    columns: {
      openaiApiKey: true,
      googleApiKey: true,
      byokProvider: true,
      byokApiKey: true,
    },
  })

  const keys: ProviderKeys = {}
  let error: string | undefined

  const take = (provider: ModelProvider, stored: string | null | undefined) => {
    if (!stored || keys[provider]) return
    try {
      keys[provider] = { apiKey: decryptIfNeeded(stored), source: 'byok' }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown decryption error'
      console.error('[keys] decrypt failed for', billingUserId, provider, message)
      error = `Could not read your saved ${provider === 'openai' ? 'OpenAI' : 'Google'} key. Re-enter it in Settings.`
    }
  }

  take('openai', user?.openaiApiKey)
  take('google', user?.googleApiKey)

  // The single-key era. Only fills a slot the per-provider columns left empty.
  if (user?.byokApiKey && user.byokProvider) {
    take(user.byokProvider, user.byokApiKey)
  }

  const shared: Array<[ModelProvider, string | undefined, KeySource]> = [
    ['openai', process.env.OWNER_OPENAI_API_KEY, 'owner'],
    ['google', process.env.OWNER_GOOGLE_API_KEY, 'owner'],
    ['openai', process.env.OPENAI_API_KEY, 'env'],
    ['google', process.env.GOOGLE_API_KEY, 'env'],
  ]
  const wouldAddShared = shared.some(([provider, key]) => key && !keys[provider])

  // Quota meters Kanthink's keys, not the user's. Someone who brought their own
  // key for every provider they can reach is never metered — and asking anyway
  // would put a usage query in front of every AI call for no reason.
  if (wouldAddShared) {
    const usage = await checkUsageLimit(userId)
    if (!usage.allowed) {
      return { keys, error, quotaExhausted: true, quotaMessage: usage.message }
    }
    for (const [provider, key, source] of shared) {
      if (key && !keys[provider]) keys[provider] = { apiKey: key, source }
    }
  }

  return { keys, error }
}

/** Just the providers this user can call. Cheap enough to ask for on its own. */
export async function availableProviders(userId: string): Promise<ModelProvider[]> {
  const { keys } = await resolveProviderKeys(userId)
  return (Object.keys(keys) as ModelProvider[]).filter((p) => !!keys[p])
}

/** Which providers the user has saved a key of their own for. */
export async function userOwnedProviders(userId: string): Promise<ModelProvider[]> {
  const billingUserId = await resolveBillingUserId(userId)
  const user = await db.query.users.findFirst({
    where: eq(users.id, billingUserId),
    columns: { openaiApiKey: true, googleApiKey: true, byokProvider: true, byokApiKey: true },
  })
  if (!user) return []

  const owned = new Set<ModelProvider>()
  if (user.openaiApiKey) owned.add('openai')
  if (user.googleApiKey) owned.add('google')
  if (user.byokApiKey && user.byokProvider) owned.add(user.byokProvider)
  return [...owned]
}

/**
 * Save one provider's key. The other provider's key is untouched.
 *
 * Writing a key also retires the legacy single-key columns for that provider, so an
 * account never ends up with the same credential in two places — one of which
 * nothing updates.
 */
export async function setProviderKey(
  userId: string,
  provider: ModelProvider,
  apiKey: string,
): Promise<void> {
  const updates: Record<string, unknown> = {
    [provider === 'openai' ? 'openaiApiKey' : 'googleApiKey']: encrypt(apiKey),
    updatedAt: new Date(),
  }

  const existing = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { byokProvider: true },
  })
  if (existing?.byokProvider === provider) {
    updates.byokProvider = null
    updates.byokApiKey = null
  }

  await db.update(users).set(updates).where(eq(users.id, userId))
}

/** Remove one provider's key, including a legacy one that belonged to it. */
export async function clearProviderKey(userId: string, provider: ModelProvider): Promise<void> {
  const updates: Record<string, unknown> = {
    [provider === 'openai' ? 'openaiApiKey' : 'googleApiKey']: null,
    updatedAt: new Date(),
  }

  const existing = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { byokProvider: true },
  })
  if (existing?.byokProvider === provider) {
    updates.byokProvider = null
    updates.byokApiKey = null
    updates.byokModel = null
  }

  await db.update(users).set(updates).where(eq(users.id, userId))
}
