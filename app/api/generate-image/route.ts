import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { generateImageForUser, type AspectRatio } from '@/lib/ai/imageGeneration'
import { isImageBackground } from '@/lib/ai/imageModels'

/**
 * Image generation for the board — card covers, shroom avatars, ad-hoc prompts.
 *
 * The provider logic itself lives in lib/ai/imageGeneration so that server-side
 * callers with no request to borrow a session cookie from (app thumbnails, most
 * obviously) can reach the same path.
 */
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const {
    prompt,
    context,
    type,
    aspectRatio = '1:1',
    quality = 'standard',
    model,
    background,
  } = await request.json()

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

  const result = await generateImageForUser(session.user.id, {
    prompt: imagePrompt,
    aspectRatio: aspectRatio as AspectRatio,
    quality,
    model: typeof model === 'string' ? model : null,
    background: isImageBackground(background) ? background : 'auto',
  })

  // The model comes back so a caller can show what drew this, and `fellBackFrom`
  // so it can say why that isn't what was asked for.
  if (result.url) {
    return NextResponse.json({
      url: result.url,
      model: result.model,
      fellBackFrom: result.fellBackFrom,
    })
  }
  return NextResponse.json({ error: result.error }, { status: result.status ?? 502 })
}
