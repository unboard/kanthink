/**
 * Every image model Kanthink can actually call, across both providers.
 *
 * One list, for the same reason lib/ai/modelCatalog exists for text: the same set is
 * offered from the account default in Settings → AI, from the composer popover when
 * Kan is about to draw something, and from inside a generated app through
 * `window.kanthinkAI.generateImage`. Three pickers drifting apart is the failure
 * mode this file prevents.
 *
 * A choice is stored provider-qualified — `openai:gpt-image-2.5-flare` — because a
 * bare model id doesn't say which SDK to build a client from, and the two namespaces
 * are only accidentally disjoint.
 *
 * ## Transparency
 *
 * `supportsTransparency` is the load-bearing field. OpenAI's gpt-image-2.5 models
 * take `background: 'transparent'` and return a real alpha channel, which is what
 * makes sticker and cut-out apps possible. Gemini's image models have no such
 * parameter — asking them for "a transparent background" in words gets you a picture
 * of a checkerboard. So the flag gates the toggle in the UI, and the server refuses
 * (or reroutes) rather than quietly returning an opaque image and calling it done.
 *
 * Verified against developers.openai.com/api/docs/models and
 * ai.google.dev/gemini-api/docs/models on 2026-09-16.
 */

import type { ModelProvider } from './modelCatalog'

export type ImageProvider = ModelProvider

export interface ImageModel {
  /** Stored, qualified form: `provider:model`. */
  id: string
  provider: ImageProvider
  /** Raw provider model id, as sent to the API. */
  model: string
  label: string
  blurb: string
  /** Real alpha-channel output via an explicit parameter — not a prompt request. */
  supportsTransparency: boolean
  isPreview?: boolean
  /** Roughly USD per generated image at standard quality, for showing a person. */
  approxUsdPerImage?: number
}

export const IMAGE_MODELS: ImageModel[] = [
  {
    id: 'google:gemini-3.1-flash-image-preview',
    provider: 'google',
    model: 'gemini-3.1-flash-image-preview',
    label: 'Nano Banana 2',
    blurb: 'Gemini 3.1 Flash Image. Frontier quality, strong at editing a photo you hand it.',
    supportsTransparency: false,
    isPreview: true,
    approxUsdPerImage: 0.04,
  },
  {
    id: 'google:gemini-2.5-flash-image',
    provider: 'google',
    model: 'gemini-2.5-flash-image',
    label: 'Nano Banana',
    blurb: 'The GA one. Cheaper, well understood, available on every Gemini key.',
    supportsTransparency: false,
    approxUsdPerImage: 0.04,
  },
  {
    id: 'openai:gpt-image-2.5-flare',
    provider: 'openai',
    model: 'gpt-image-2.5-flare',
    label: 'GPT-Image 2.5 Flare',
    blurb: 'Fast everyday generation, and it can cut the background out. Good default for stickers and icons.',
    supportsTransparency: true,
    approxUsdPerImage: 0.04,
  },
  {
    id: 'openai:gpt-image-2.5-sunburst',
    provider: 'openai',
    model: 'gpt-image-2.5-sunburst',
    label: 'GPT-Image 2.5 Sunburst',
    blurb: 'OpenAI’s most capable image model. Slower and dearer; also does transparency.',
    supportsTransparency: true,
    approxUsdPerImage: 0.17,
  },
  {
    id: 'openai:gpt-image-1',
    provider: 'openai',
    model: 'gpt-image-1',
    label: 'GPT-Image 1',
    blurb: 'Previous generation. Kept because accounts pinned to it should keep working.',
    supportsTransparency: true,
    approxUsdPerImage: 0.04,
  },
]

/**
 * What runs when nobody chose.
 *
 * Nano Banana 2, unchanged from what image generation has always done here, because
 * a default is what happens to people who never opened this setting — and moving it
 * to another provider would silently re-point every card cover and shroom avatar at
 * a key some accounts do not hold.
 */
export const DEFAULT_IMAGE_MODEL_ID = 'google:gemini-3.1-flash-image-preview'

/** Where a Gemini image request goes when the preview model isn't on the key. */
export const GOOGLE_IMAGE_FALLBACK_ID = 'google:gemini-2.5-flash-image'

/** The transparency-capable model to reach for when a request needs one. */
export const DEFAULT_TRANSPARENT_MODEL_ID = 'openai:gpt-image-2.5-flare'

export type ImageBackground = 'auto' | 'transparent' | 'opaque'

export const IMAGE_BACKGROUNDS: ImageBackground[] = ['auto', 'transparent', 'opaque']

export function isImageBackground(value: unknown): value is ImageBackground {
  return typeof value === 'string' && (IMAGE_BACKGROUNDS as string[]).includes(value)
}

/** The catalogue entry for a stored choice, or null when it isn't one we offer. */
export function findImageModel(value: string | null | undefined): ImageModel | null {
  if (!value) return null
  const direct = IMAGE_MODELS.find((m) => m.id === value)
  if (direct) return direct
  // A bare model id is accepted too: that is what playground_apps and the in-app
  // helper pass, and rejecting it there would mean two spellings of one setting.
  return IMAGE_MODELS.find((m) => m.model === value) ?? null
}

export function labelForImageModel(value: string | null | undefined): string | null {
  return findImageModel(value)?.label ?? null
}

/** Every model callable with the keys this account holds. */
export function availableImageModels(providers: ImageProvider[]): ImageModel[] {
  return IMAGE_MODELS.filter((m) => providers.includes(m.provider))
}

/**
 * Resolve a request down to one model, saying so when it had to move.
 *
 * The order is what makes the setting honest:
 *
 *   1. the model this one request named, if there is a key for its provider
 *   2. the account default, if there is a key for its provider
 *   3. the first model in the catalogue there *is* a key for
 *
 * Transparency overrides all three. A request for a cut-out that lands on a model
 * with no `background` parameter would come back opaque, and an opaque sticker is
 * not a lesser version of the thing asked for — it is the wrong thing. So when
 * transparency is required, only models that can actually do it are eligible.
 */
export interface ImageModelResolution {
  model: ImageModel
  /** True when a named preference could not be honoured. */
  fellBack: boolean
  /** Why it moved, for saying so in a log or an error. */
  reason?: 'no-key' | 'needs-transparency'
}

export function resolveImageModel(options: {
  /** What this single request asked for, qualified or bare. */
  requested?: string | null
  /** The account's saved default. */
  accountDefault?: string | null
  /** Providers with a usable key. */
  available: ImageProvider[]
  /** True when the caller needs a real alpha channel. */
  needsTransparency?: boolean
}): ImageModelResolution | null {
  const { requested, accountDefault, available, needsTransparency = false } = options

  const eligible = IMAGE_MODELS.filter(
    (m) => available.includes(m.provider) && (!needsTransparency || m.supportsTransparency),
  )
  if (eligible.length === 0) return null

  const ifEligible = (m: ImageModel | null): ImageModel | null =>
    m && eligible.includes(m) ? m : null

  const wanted = findImageModel(requested)
  const accountChoice = findImageModel(accountDefault)

  const direct = ifEligible(wanted)
  if (direct) return { model: direct, fellBack: false }

  const byAccount = ifEligible(accountChoice)
  if (byAccount) {
    return wanted
      ? { model: byAccount, fellBack: true, reason: reasonFor(wanted, available, needsTransparency) }
      : { model: byAccount, fellBack: false }
  }

  // Nothing named is callable. Land on the best thing that is, and carry the reason
  // so a caller can say "no OpenAI key, so this came back opaque" rather than
  // leaving someone to wonder why their sticker has a sky behind it.
  const blocked = wanted ?? accountChoice
  const preferred = ifEligible(
    findImageModel(needsTransparency ? DEFAULT_TRANSPARENT_MODEL_ID : DEFAULT_IMAGE_MODEL_ID),
  )
  return {
    model: preferred ?? eligible[0],
    fellBack: !!blocked,
    reason: blocked ? reasonFor(blocked, available, needsTransparency) : undefined,
  }
}

function reasonFor(
  named: ImageModel | null,
  available: ImageProvider[],
  needsTransparency: boolean,
): ImageModelResolution['reason'] {
  if (!named) return undefined
  if (needsTransparency && !named.supportsTransparency) return 'needs-transparency'
  if (!available.includes(named.provider)) return 'no-key'
  return undefined
}
