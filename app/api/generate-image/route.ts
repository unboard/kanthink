import { NextResponse } from 'next/server'
import { GoogleGenAI, PersonGeneration } from '@google/genai'
import { auth } from '@/lib/auth'
import { getOpenAIClientForUser } from '@/lib/ai/openai-client'
import { getGoogleClientForVoice } from '@/lib/ai/google-voice'
import { uploadImageToCloudinary, isCloudinaryConfigured } from '@/lib/cloudinary'

// Map aspect ratios to DALL-E sizes for fallback
const DALLE_SIZE_MAP: Record<string, '1024x1024' | '1792x1024' | '1024x1792'> = {
  '1:1': '1024x1024',
  '4:3': '1792x1024',
  '16:9': '1792x1024',
  '3:4': '1024x1792',
  '9:16': '1024x1792',
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { prompt, context, type, aspectRatio = '1:1', quality = 'standard' } = await request.json()

  // Build the image prompt based on context
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

  // Try Google/Gemini Imagen first (primary) — check BYOK, then owner/env keys
  const googleResult = await getGoogleClientForVoice(session.user.id)
  const googleClient = googleResult.client
    || (process.env.OWNER_GOOGLE_API_KEY ? new GoogleGenAI({ apiKey: process.env.OWNER_GOOGLE_API_KEY }) : null)
    || (process.env.GOOGLE_API_KEY ? new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY }) : null)
  if (googleClient) {
    try {
      const response = await googleClient.models.generateImages({
        model: 'imagen-3.0-generate-002',
        prompt: imagePrompt,
        config: {
          numberOfImages: 1,
          aspectRatio: aspectRatio,
          personGeneration: PersonGeneration.ALLOW_ADULT,
        },
      })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const images = (response as any).generatedImages
      if (!images || images.length === 0) {
        // Fall through to DALL-E
        console.warn('Imagen returned no images, trying DALL-E fallback')
      } else {
        const imageData = images[0].image?.imageBytes
        if (imageData) {
          const buffer = Buffer.from(imageData, 'base64')
          if (isCloudinaryConfigured()) {
            const result = await uploadImageToCloudinary(buffer, {})
            return NextResponse.json({ url: result.url })
          }
          const dataUrl = `data:image/png;base64,${imageData}`
          return NextResponse.json({ url: dataUrl })
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Imagen generation failed'
      console.warn('Imagen error, trying DALL-E fallback:', message)
    }
  }

  // Fallback to OpenAI DALL-E (check BYOK first, then owner/env keys)
  const openaiResult = await getOpenAIClientForUser(session.user.id)
  const openaiClient = openaiResult.client
    || (process.env.OWNER_OPENAI_API_KEY ? new (await import('openai')).default({ apiKey: process.env.OWNER_OPENAI_API_KEY }) : null)
    || (process.env.OPENAI_API_KEY ? new (await import('openai')).default({ apiKey: process.env.OPENAI_API_KEY }) : null)
  if (openaiClient) {
    try {
      const dalleSize = quality === 'hd'
        ? (DALLE_SIZE_MAP[aspectRatio] || '1792x1024')
        : (DALLE_SIZE_MAP[aspectRatio] || '1024x1024')

      const response = await openaiClient.images.generate({
        model: 'dall-e-3',
        prompt: imagePrompt,
        n: 1,
        size: dalleSize,
        quality: quality === 'hd' ? 'hd' : 'standard',
      })

      const imageUrl = response.data?.[0]?.url
      if (!imageUrl) {
        return NextResponse.json({ error: 'No image generated' }, { status: 500 })
      }

      return await uploadAndReturn(imageUrl)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Image generation failed'
      console.error('DALL-E image generation error:', message)
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }

  return NextResponse.json({ error: 'No AI provider configured for image generation.' }, { status: 400 })
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
