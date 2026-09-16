import { GoogleGenAI, Modality } from '@google/genai'
import OpenAI from 'openai'
import { resolveProviderKeys } from '@/lib/ai/keys'
import { getImageModelDefault } from '@/lib/ai/modelPreferences'
import {
  GOOGLE_IMAGE_FALLBACK_ID,
  findImageModel,
  resolveImageModel,
  type ImageBackground,
  type ImageModel,
  type ImageProvider,
} from '@/lib/ai/imageModels'
import { uploadImageToCloudinary, isCloudinaryConfigured } from '@/lib/cloudinary'

/**
 * Image generation, as a function rather than a route.
 *
 * This used to live inside /api/generate-image. It was lifted out when app
 * thumbnails needed the same thing server-side: a route calling its own sibling
 * route over HTTP has to forward a session cookie it does not always have, and a
 * background thumbnail job has no request to borrow one from.
 *
 * ## Which model
 *
 * It no longer tries Google and then OpenAI and hopes. The account names an image
 * model in Settings → AI, a single request may name a different one, and
 * `resolveImageModel` picks between them against the keys actually held. The old
 * chain survives only as the shape of the catalogue's default — Nano Banana first,
 * because that is what every existing card cover was drawn with.
 *
 * The one thing that still overrides a stated preference is transparency: a request
 * for a cut-out that lands on a Gemini model comes back with a painted background,
 * and an opaque sticker is the wrong thing rather than a lesser one. So a
 * transparent request goes to a model that has the parameter, or it fails saying why.
 */

export type AspectRatio = '1:1' | '4:3' | '16:9' | '3:4' | '9:16'

/** Sizes the OpenAI image endpoint accepts, by the shape asked for. */
const OPENAI_SIZE_MAP: Record<AspectRatio, '1024x1024' | '1536x1024' | '1024x1536'> = {
  '1:1': '1024x1024',
  '4:3': '1536x1024',
  '16:9': '1536x1024',
  '3:4': '1024x1536',
  '9:16': '1024x1536',
}

/** Gemini's image models take no aspect-ratio parameter, so the shape goes in the words. */
const SHAPE_HINT: Record<AspectRatio, string> = {
  '1:1': 'Square composition.',
  '4:3': 'Landscape composition, 4:3.',
  '16:9': 'Wide landscape composition, 16:9.',
  '3:4': 'Portrait composition, 3:4.',
  '9:16': 'Tall portrait composition, 9:16.',
}

export interface GenerateImageOptions {
  prompt: string
  aspectRatio?: AspectRatio
  quality?: 'standard' | 'hd'
  /**
   * Override the account's image model for this one call. Qualified
   * ("openai:gpt-image-2.5-flare") or bare ("gpt-image-2.5-flare").
   */
  model?: string | null
  /**
   * `transparent` asks for a real alpha channel, and restricts the model choice to
   * something that can produce one. `auto` lets the model decide.
   */
  background?: ImageBackground
  /** Cloudinary folder hint, so generated art is filed near what it belongs to. */
  folder?: string
}

export interface GenerateImageResult {
  url?: string
  error?: string
  /** HTTP status the route should use when this failed. */
  status?: number
  /** The model that actually drew it, qualified. Worth showing when it moved. */
  model?: string
  /** Set when the request named a model that could not be honoured. */
  fellBackFrom?: string
}

/**
 * Generate one image for a user, honouring their keys and their model preference.
 */
export async function generateImageForUser(
  userId: string,
  options: GenerateImageOptions,
): Promise<GenerateImageResult> {
  const {
    prompt,
    aspectRatio = '1:1',
    quality = 'standard',
    model: requested,
    background = 'auto',
    folder,
  } = options

  const { keys, error: keyError, quotaExhausted, quotaMessage } = await resolveProviderKeys(userId)
  const available: ImageProvider[] = (['google', 'openai'] as const).filter((p) => !!keys[p])

  const accountDefault = await getImageModelDefault(userId)
  const needsTransparency = background === 'transparent'

  const resolution = resolveImageModel({
    requested,
    accountDefault,
    available,
    needsTransparency,
  })

  if (!resolution) {
    if (needsTransparency && available.length > 0) {
      return {
        error:
          'Transparent backgrounds need an OpenAI key — the Gemini image models have no way to produce one. Add one in Settings → AI.',
        status: 400,
      }
    }
    // Out of quota is a different failure from never having configured anything, and
    // saying "no provider configured" to someone who has one is how a billing
    // problem gets mistaken for a settings problem.
    if (quotaExhausted) {
      return { error: quotaMessage ?? 'This account is out of AI quota.', status: 403 }
    }
    return {
      error: keyError ?? 'No AI provider configured for image generation.',
      status: 400,
    }
  }

  const chosen = resolution.model
  const fellBackFrom =
    resolution.fellBack ? findImageModel(requested ?? accountDefault)?.id : undefined

  try {
    const url =
      chosen.provider === 'google'
        ? await drawWithGemini(keys.google!.apiKey, chosen, { prompt, aspectRatio, folder })
        : await drawWithOpenAI(keys.openai!.apiKey, chosen, {
            prompt,
            aspectRatio,
            quality,
            background,
            folder,
          })

    return { url, model: chosen.id, fellBackFrom }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Image generation failed'
    console.error('[generateImage]', chosen.id, 'failed:', message)
    return { error: message, status: 502, model: chosen.id, fellBackFrom }
  }
}

/**
 * Gemini, with the GA model as a safety net.
 *
 * Preview models come and go per key, so a NOT_FOUND on the frontier one is retried
 * against Nano Banana rather than surfaced — an account without preview access
 * should still get a picture.
 */
async function drawWithGemini(
  apiKey: string,
  model: ImageModel,
  opts: { prompt: string; aspectRatio: AspectRatio; folder?: string },
): Promise<string> {
  const client = new GoogleGenAI({ apiKey })
  const shaped = `${opts.prompt}\n\n${SHAPE_HINT[opts.aspectRatio] ?? SHAPE_HINT['1:1']}`

  const call = (modelId: string) =>
    client.models.generateContent({
      model: modelId,
      contents: [{ role: 'user', parts: [{ text: shaped }] }],
      config: { responseModalities: [Modality.IMAGE, Modality.TEXT] },
    })

  let response
  try {
    response = await call(model.model)
  } catch (err) {
    const msg = err instanceof Error ? err.message : ''
    const fallback = findImageModel(GOOGLE_IMAGE_FALLBACK_ID)
    if (
      fallback &&
      fallback.model !== model.model &&
      /NOT_FOUND|404|is not found|not supported|does not exist/i.test(msg)
    ) {
      response = await call(fallback.model)
    } else {
      throw err
    }
  }

  for (const part of response.candidates?.[0]?.content?.parts ?? []) {
    const inline = part.inlineData
    if (inline?.data && inline.mimeType?.startsWith('image/')) {
      return persist(Buffer.from(inline.data, 'base64'), inline.mimeType, opts.folder)
    }
  }
  throw new Error('The image model returned no image. Try being more specific.')
}

/**
 * OpenAI's images endpoint.
 *
 * `background: 'transparent'` only produces an alpha channel alongside a lossless
 * `output_format`, so PNG is forced whenever transparency is asked for — the two
 * settings are one decision, and letting them disagree yields a transparent request
 * flattened onto white by the encoder.
 */
async function drawWithOpenAI(
  apiKey: string,
  model: ImageModel,
  opts: {
    prompt: string
    aspectRatio: AspectRatio
    quality: 'standard' | 'hd'
    background: ImageBackground
    folder?: string
  },
): Promise<string> {
  const client = new OpenAI({ apiKey })
  const transparent = opts.background === 'transparent'

  const response = await client.images.generate({
    model: model.model,
    // A stated backdrop in the words beats the parameter, so a transparent request
    // says plainly that there is no scene to paint.
    prompt: transparent
      ? `${opts.prompt}\n\nIsolated subject on a fully transparent background. No backdrop, scene, shadow, or ground plane.`
      : opts.prompt,
    n: 1,
    size: OPENAI_SIZE_MAP[opts.aspectRatio] || '1024x1024',
    quality: opts.quality === 'hd' ? 'high' : 'medium',
    ...(opts.background !== 'auto' ? { background: opts.background } : {}),
    ...(transparent ? { output_format: 'png' as const } : {}),
  })

  const first = response.data?.[0]
  // The gpt-image models return base64 rather than a URL.
  if (first?.b64_json) {
    return persist(Buffer.from(first.b64_json, 'base64'), 'image/png', opts.folder)
  }
  if (first?.url) {
    if (!isCloudinaryConfigured()) return first.url
    const imageRes = await fetch(first.url)
    return persist(Buffer.from(await imageRes.arrayBuffer()), 'image/png', opts.folder)
  }
  throw new Error('The image model returned no image. Try being more specific.')
}

/**
 * Cloudinary when it is configured, an inline data URL when it is not.
 *
 * The data URL keeps local development working without credentials, but it is a
 * poor thing to write into a database row, so anything durable should be generated
 * on a deployment that has Cloudinary.
 */
async function persist(buffer: Buffer, mimeType: string, folder?: string): Promise<string> {
  if (isCloudinaryConfigured()) {
    const result = await uploadImageToCloudinary(buffer, folder ? { cardId: folder } : {})
    return result.url
  }
  return `data:${mimeType};base64,${buffer.toString('base64')}`
}
