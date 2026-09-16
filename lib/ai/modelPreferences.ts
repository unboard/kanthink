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
import { DEFAULT_IMAGE_MODEL_ID, findImageModel } from './imageModels'
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
 * choice. Voice and image generation are deliberately not in this list: those need
 * models that can do speech and pictures, and offering a text model against them
 * would be a setting that silently does nothing. Image generation has its own
 * `imageDefault` field below, drawn from its own catalogue.
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
  /**
   * The image model, provider-qualified, or null for the catalogue default.
   *
   * Its own field rather than a fourth surface override, because the surfaces above
   * all take a *text* model and this one cannot. Putting an image model in that list
   * would offer people a choice that does nothing wherever it was picked, and offer
   * them GPT-5 for drawing.
   */
  imageDefault: string | null
}

export const EMPTY_PREFERENCES: ModelPreferences = {
  default: null,
  overrides: {},
  imageDefault: null,
}

/** Is this a surface we know about? Guards whatever arrives from a request body. */
export function isAiSurface(value: unknown): value is AiSurface {
  return typeof value === 'string' && AI_SURFACES.some((s) => s.key === value)
}

/** Read an account's preferences. Agent seats inherit their parent's. */
export async function getModelPreferences(userId: string): Promise<ModelPreferences> {
  const billingUserId = await resolveBillingUserId(userId)
  const user = await db.query.users.findFirst({
    where: eq(users.id, billingUserId),
    columns: {
      modelDefault: true,
      modelOverrides: true,
      byokModel: true,
      byokProvider: true,
      imageModelDefault: true,
    },
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
    imageDefault: findImageModel(user.imageModelDefault)?.id ?? null,
  }
}

/** The image model an account draws with, always a real one. */
export async function getImageModelDefault(userId: string): Promise<string> {
  const preferences = await getModelPreferences(userId)
  return preferences.imageDefault ?? DEFAULT_IMAGE_MODEL_ID
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
  next: { default?: string | null; overrides?: unknown; imageDefault?: string | null },
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
  if (next.imageDefault !== undefined) {
    // Same rule as the text default: an unrecognised value means "no preference"
    // rather than an error, because the only way to send one is to pick from a list
    // we control, and a model we have retired should decay to the default quietly.
    updates.imageModelDefault = findImageModel(next.imageDefault)?.id ?? null
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

  // Whatever we do hold a key for — but a key the user brought outranks one this
  // deployment shares, whatever order the catalogue happens to be in.
  //
  // This is not a tie-break detail. An account with its own Google key and nothing
  // else set would otherwise land on OpenAI the moment the deployment had an owner
  // key, which is both a different provider than the one they paid for and metered
  // against quota that their own key exists to avoid.
  const byOwnKeyFirst = [...MODEL_CATALOG].sort((a, b) => {
    const aOwn = keys[a.provider]?.source === 'byok' ? 0 : 1
    const bOwn = keys[b.provider]?.source === 'byok' ? 0 : 1
    return aOwn - bOwn
  })

  for (const group of byOwnKeyFirst) {
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
