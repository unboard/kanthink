import { GoogleGenAI, Modality } from '@google/genai'
import { getOpenAIClientForUser } from '@/lib/ai/openai-client'
import { getGoogleClientForVoice } from '@/lib/ai/google-voice'
import { uploadImageToCloudinary, isCloudinaryConfigured } from '@/lib/cloudinary'

/**
 * Image generation, on Gemini, as a function rather than a route.
 *
 * This used to live inside /api/generate-image. It was lifted out when app
 * thumbnails needed the same thing server-side: a route calling its own sibling
 * route over HTTP has to forward a session cookie it does not always have, and a
 * background thumbnail job has no request to borrow one from.
 *
 * Nano Banana leads because it works on a standard Gemini key and is the model the
 * playground's own image calls already use. OpenAI is a last resort, and only for
 * accounts that actually hold an OpenAI key.
 */
const GEMINI_IMAGE_PRIMARY = 'gemini-3.1-flash-image-preview'
const GEMINI_IMAGE_FALLBACK = 'gemini-2.5-flash-image'

export type AspectRatio = '1:1' | '4:3' | '16:9' | '3:4' | '9:16'

/** Sizes for the OpenAI last resort. */
const OPENAI_SIZE_MAP: Record<string, '1024x1024' | '1536x1024' | '1024x1536'> = {
  '1:1': '1024x1024',
  '4:3': '1536x1024',
  '16:9': '1536x1024',
  '3:4': '1024x1536',
  '9:16': '1024x1536',
}

/** Nano Banana takes no aspect-ratio parameter, so the shape goes in the words. */
const SHAPE_HINT: Record<string, string> = {
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
  /** Cloudinary folder hint, so generated art is filed near what it belongs to. */
  folder?: string
}

export interface GenerateImageResult {
  url?: string
  error?: string
  /** HTTP status the route should use when this failed. */
  status?: number
}

/**
 * Generate one image for a user, honouring their BYOK keys.
 *
 * Returns the first provider's error rather than the last. Falling back and then
 * surfacing the final provider's message is how "dall-e-3 does not exist" ended up
 * being shown to someone whose account is on Google and never asked for OpenAI.
 */
export async function generateImageForUser(
  userId: string,
  options: GenerateImageOptions,
): Promise<GenerateImageResult> {
  const { prompt, aspectRatio = '1:1', quality = 'standard', folder } = options
  let firstError: string | null = null

  const googleResult = await getGoogleClientForVoice(userId)
  const googleClient =
    googleResult.client ||
    (process.env.OWNER_GOOGLE_API_KEY
      ? new GoogleGenAI({ apiKey: process.env.OWNER_GOOGLE_API_KEY })
      : null) ||
    (process.env.GOOGLE_API_KEY ? new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY }) : null)

  if (googleClient) {
    const shaped = `${prompt}\n\n${SHAPE_HINT[aspectRatio] ?? SHAPE_HINT['1:1']}`
    const call = (model: string) =>
      googleClient.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: shaped }] }],
        config: { responseModalities: [Modality.IMAGE, Modality.TEXT] },
      })

    try {
      let response
      try {
        response = await call(GEMINI_IMAGE_PRIMARY)
      } catch (err) {
        const msg = err instanceof Error ? err.message : ''
        // Preview models come and go per key; the GA one is the safety net.
        if (/NOT_FOUND|404|is not found|not supported|does not exist/i.test(msg)) {
          response = await call(GEMINI_IMAGE_FALLBACK)
        } else {
          throw err
        }
      }

      for (const part of response.candidates?.[0]?.content?.parts ?? []) {
        const inline = part.inlineData
        if (inline?.data && inline.mimeType?.startsWith('image/')) {
          return { url: await persist(Buffer.from(inline.data, 'base64'), inline.mimeType, folder) }
        }
      }
      firstError = 'The image model returned no image. Try being more specific.'
    } catch (err: unknown) {
      firstError = err instanceof Error ? err.message : 'Gemini image generation failed'
      console.warn('[generateImage] Gemini failed:', firstError)
    }
  }

  const openaiResult = await getOpenAIClientForUser(userId)
  const openaiClient =
    openaiResult.client ||
    (process.env.OWNER_OPENAI_API_KEY
      ? new (await import('openai')).default({ apiKey: process.env.OWNER_OPENAI_API_KEY })
      : null) ||
    (process.env.OPENAI_API_KEY
      ? new (await import('openai')).default({ apiKey: process.env.OPENAI_API_KEY })
      : null)

  if (openaiClient) {
    try {
      const response = await openaiClient.images.generate({
        // gpt-image-1, not dall-e-3: the latter is retired and was the error people
        // were actually being shown.
        model: 'gpt-image-1',
        prompt,
        n: 1,
        size: OPENAI_SIZE_MAP[aspectRatio] || '1024x1024',
        quality: quality === 'hd' ? 'high' : 'medium',
      })

      const first = response.data?.[0]
      // gpt-image-1 returns base64 rather than a URL.
      if (first?.b64_json) {
        return { url: await persist(Buffer.from(first.b64_json, 'base64'), 'image/png', folder) }
      }
      if (first?.url) {
        if (!isCloudinaryConfigured()) return { url: first.url }
        const imageRes = await fetch(first.url)
        return { url: await persist(Buffer.from(await imageRes.arrayBuffer()), 'image/png', folder) }
      }

      return { error: firstError ?? 'No image generated', status: 502 }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Image generation failed'
      console.error('[generateImage] OpenAI failed:', message)
      return { error: firstError ?? message, status: 502 }
    }
  }

  return {
    error: firstError ?? 'No AI provider configured for image generation.',
    status: firstError ? 502 : 400,
  }
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
