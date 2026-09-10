import { NextResponse } from 'next/server'
import { GoogleGenAI, Modality } from '@google/genai'
import { auth } from '@/lib/auth'
import { getOpenAIClientForUser } from '@/lib/ai/openai-client'
import { getGoogleClientForVoice } from '@/lib/ai/google-voice'
import { uploadImageToCloudinary, isCloudinaryConfigured } from '@/lib/cloudinary'

/**
 * Image generation, on Gemini.
 *
 * This used to lead with Imagen 3, which needs access an ordinary Gemini key does
 * not have — so it failed, logged a warning nobody saw, and fell through to
 * DALL-E 3, a model OpenAI has since retired. The error that surfaced was the
 * second failure, which pointed at the wrong provider entirely.
 *
 * Nano Banana is what the playground's own image calls already use, it works on a
 * standard Gemini key, and it is a better model. It generates through
 * generateContent with an image modality rather than the dedicated images endpoint.
 */
const GEMINI_IMAGE_PRIMARY = 'gemini-3.1-flash-image-preview'
const GEMINI_IMAGE_FALLBACK = 'gemini-2.5-flash-image'

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

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { prompt, context, type, aspectRatio = '1:1', quality = 'standard' } = await request.json()

  let imagePrompt: string
  if (prompt) {
    imagePrompt = prompt
  } else if (context && type === 'shroom') {
    imagePrompt = `A minimal, iconic illustration for an AI automation called "${context}". Abstract, geometric, dark background, vibrant accent colors. No text. Suitable as a square avatar/icon.`
  } else if (context && type === 'card') {
    imagePrompt = `A minimal, atmospheric cover image for a task card about "${context}". Abstract, moody, widescreen aspect ratio. No text.`
  } else {
    return NextResponse.json({ error: 'Provide a prompt or context' }, { status: 400 })
  }

  // The first failure is the one worth reporting. Falling back and then surfacing
  // the last provider's message is how "dall-e-3 does not exist" ended up being
  // shown to someone whose account is on Google and never asked for OpenAI.
  let firstError: string | null = null

  const googleResult = await getGoogleClientForVoice(session.user.id)
  const googleClient =
    googleResult.client ||
    (process.env.OWNER_GOOGLE_API_KEY
      ? new GoogleGenAI({ apiKey: process.env.OWNER_GOOGLE_API_KEY })
      : null) ||
    (process.env.GOOGLE_API_KEY ? new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY }) : null)

  if (googleClient) {
    const shaped = `${imagePrompt}\n\n${SHAPE_HINT[aspectRatio] ?? SHAPE_HINT['1:1']}`
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
          if (isCloudinaryConfigured()) {
            const result = await uploadImageToCloudinary(Buffer.from(inline.data, 'base64'), {})
            return NextResponse.json({ url: result.url })
          }
          return NextResponse.json({ url: `data:${inline.mimeType};base64,${inline.data}` })
        }
      }
      firstError = 'The image model returned no image. Try being more specific.'
    } catch (err: unknown) {
      firstError = err instanceof Error ? err.message : 'Gemini image generation failed'
      console.warn('[generate-image] Gemini failed:', firstError)
    }
  }

  // Last resort, and only for accounts that actually hold an OpenAI key.
  const openaiResult = await getOpenAIClientForUser(session.user.id)
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
        prompt: imagePrompt,
        n: 1,
        size: OPENAI_SIZE_MAP[aspectRatio] || '1024x1024',
        quality: quality === 'hd' ? 'high' : 'medium',
      })

      const first = response.data?.[0]
      // gpt-image-1 returns base64 rather than a URL.
      if (first?.b64_json) {
        if (isCloudinaryConfigured()) {
          const result = await uploadImageToCloudinary(Buffer.from(first.b64_json, 'base64'), {})
          return NextResponse.json({ url: result.url })
        }
        return NextResponse.json({ url: `data:image/png;base64,${first.b64_json}` })
      }
      if (first?.url) return await uploadAndReturn(first.url)

      return NextResponse.json(
        { error: firstError ?? 'No image generated' },
        { status: 502 }
      )
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Image generation failed'
      console.error('[generate-image] OpenAI failed:', message)
      return NextResponse.json({ error: firstError ?? message }, { status: 502 })
    }
  }

  return NextResponse.json(
    { error: firstError ?? 'No AI provider configured for image generation.' },
    { status: 400 }
  )
}

async function uploadAndReturn(imageUrl: string) {
  if (isCloudinaryConfigured()) {
    const imageRes = await fetch(imageUrl)
    const buffer = Buffer.from(await imageRes.arrayBuffer())
    const result = await uploadImageToCloudinary(buffer, {})
    return NextResponse.json({ url: result.url })
  }
  return NextResponse.json({ url: imageUrl })
}
