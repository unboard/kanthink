import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { resolveBillingUserId } from '@/lib/usage'
import {
  MODEL_CATALOG,
  parseModelChoice,
  providerGroup,
  type ModelChoice,
  type ModelProvider,
} from './modelCatalog'
import type { ProviderKeys } from './keys'

/**
 * Which model runs where.
 *
 * The shape is deliberately lopsided: one default that governs everything, and a
 * short list of areas that may opt out of it. That is not a compromise between "one
 * setting" and "a setting per feature" — it is the observation that almost nobody
 * wants to think about this, and the few who do want it for one specific thing
 * ("chat can be cheap, automations should be smart"), not for all of them.
 *
 * So the default is the setting. Overrides are the exception, they live behind a
 * disclosure, and every one of them is allowed to be absent.
 *
 * Three surfaces, and no more, because a fourth would be a list rather than a
 * choice. Voice and image generation are deliberately not here: those are pinned to
 * models that can do speech and pictures, and offering a text model against them
 * would be a setting that silently does nothing.
 */
export type AiSurface = 'chat' | 'automations' | 'apps'

export interface SurfaceDefinition {
  key: AiSurface
  label: string
  blurb: string
}

export const AI_SURFACES: SurfaceDefinition[] = [
  {
    key: 'chat',
    label: 'Chat with Kan',
    blurb: 'Card, channel, task and operator conversations. High volume — cheap and fast pays off here.',
  },
  {
    key: 'automations',
    label: 'Shrooms and card generation',
    blurb: 'Anything that runs without you watching. Worth more model than chat is.',
  },
  {
    key: 'apps',
    label: 'App builder',
    blurb: 'The default for new apps. Each app can still be pinned to its own model.',
  },
]

export interface ModelPreferences {
  /** Provider-qualified, or null for "whatever the configured key's provider defaults to". */
  default: string | null
  overrides: Partial<Record<AiSurface, string>>
}

export const EMPTY_PREFERENCES: ModelPreferences = { default: null, overrides: {} }

/** Is this a surface we know about? Guards whatever arrives from a request body. */
export function isAiSurface(value: unknown): value is AiSurface {
  return typeof value === 'string' && AI_SURFACES.some((s) => s.key === value)
}

/** Read an account's preferences. Agent seats inherit their parent's. */
export async function getModelPreferences(userId: string): Promise<ModelPreferences> {
  const billingUserId = await resolveBillingUserId(userId)
  const user = await db.query.users.findFirst({
    where: eq(users.id, billingUserId),
    columns: { modelDefault: true, modelOverrides: true, byokModel: true, byokProvider: true },
  })
  if (!user) return EMPTY_PREFERENCES

  // The single-key era stored a bare model id whose provider was implied by the key.
  // Read forward into the qualified form rather than migrating: the value is only
  // meaningful alongside byokProvider, and both go away the moment anything is saved.
  const fallbackDefault = !user.modelDefault && user.byokModel && user.byokProvider
    ? `${user.byokProvider}:${user.byokModel}`
    : null

  return {
    default: user.modelDefault ?? fallbackDefault,
    overrides: sanitizeOverrides(user.modelOverrides),
  }
}

/** Drop anything that is not a surface we offer or a choice we can parse. */
export function sanitizeOverrides(raw: unknown): Partial<Record<AiSurface, string>> {
  if (!raw || typeof raw !== 'object') return {}
  const out: Partial<Record<AiSurface, string>> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isAiSurface(key)) continue
    if (typeof value !== 'string' || !parseModelChoice(value)) continue
    out[key] = value
  }
  return out
}

export async function setModelPreferences(
  userId: string,
  next: { default?: string | null; overrides?: unknown },
): Promise<void> {
  const updates: Record<string, unknown> = { updatedAt: new Date() }

  if (next.default !== undefined) {
    // An unparseable value means "no preference" rather than an error: the only way
    // to send one is to pick from a list we control.
    updates.modelDefault = next.default && parseModelChoice(next.default) ? next.default : null
  }
  if (next.overrides !== undefined) {
    const clean = sanitizeOverrides(next.overrides)
    updates.modelOverrides = Object.keys(clean).length > 0 ? clean : null
  }

  await db.update(users).set(updates).where(eq(users.id, userId))
}

/**
 * The model a given surface should run on, given the preferences and the keys held.
 *
 * Every step can fail over, and the order is what makes the setting honest:
 *
 *   1. the surface's own override, if there is a key for its provider
 *   2. the account default, if there is a key for its provider
 *   3. the default model of whichever provider does have a key
 *
 * Step 3 is why picking an OpenAI model with only a Google key no longer silently
 * runs something else without saying so — the caller is handed back the fact that
 * the choice could not be honoured.
 */
export interface ResolvedModel {
  provider: ModelProvider
  model: string
  /** True when a preference existed for a provider with no usable key. */
  fellBack: boolean
  /** The choice that could not be honoured, for saying so. */
  requested?: ModelChoice
}

export function resolveSurfaceModel(
  preferences: ModelPreferences,
  surface: AiSurface | undefined,
  keys: ProviderKeys,
): ResolvedModel | null {
  const wanted = (surface ? preferences.overrides[surface] : null) ?? preferences.default
  const choice = parseModelChoice(wanted)

  if (choice && keys[choice.provider]) {
    return { provider: choice.provider, model: choice.model, fellBack: false }
  }

  // Whatever we do hold a key for. Catalogue order is the preference order, and
  // OpenAI is first there, so a pure-Google account still lands on Gemini.
  for (const group of MODEL_CATALOG) {
    if (keys[group.provider]) {
      return {
        provider: group.provider,
        model: providerGroup(group.provider).defaultModel,
        fellBack: !!choice,
        requested: choice ?? undefined,
      }
    }
  }

  return null
}
