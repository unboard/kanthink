import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getOpenAIClientForUser } from '@/lib/ai/openai-client'
import { uploadImageToCloudinary, isCloudinaryConfigured } from '@/lib/cloudinary'

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { prompt, context, type } = await request.json()

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

  // Get OpenAI client
  const { client, error } = await getOpenAIClientForUser(session.user.id)
  if (!client) {
    return NextResponse.json({ error: error || 'OpenAI API key required for image generation.' }, { status: 400 })
  }

  try {
    const response = await client.images.generate({
      model: 'dall-e-3',
      prompt: imagePrompt,
      n: 1,
      size: type === 'card' ? '1792x1024' : '1024x1024',
      quality: 'standard',
    })

    const imageUrl = response.data?.[0]?.url
    if (!imageUrl) {
      return NextResponse.json({ error: 'No image generated' }, { status: 500 })
    }

    // Upload to Cloudinary if configured (so the URL is permanent)
    if (isCloudinaryConfigured()) {
      const imageRes = await fetch(imageUrl)
      const buffer = Buffer.from(await imageRes.arrayBuffer())
      const result = await uploadImageToCloudinary(buffer, {})
      return NextResponse.json({ url: result.url })
    }

    // Return the temporary OpenAI URL
    return NextResponse.json({ url: imageUrl })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Image generation failed'
    console.error('Image generation error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
