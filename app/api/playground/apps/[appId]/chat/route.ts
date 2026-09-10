import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { cards, playgroundApps } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { requirePermission, PermissionError } from '@/lib/api/permissions'
import { ensureSchema } from '@/lib/db/ensure-schema'
import { getLLMClientForUser, type LLMContentPart, type LLMMessage } from '@/lib/ai/llm'
import { recordUsage } from '@/lib/usage'
import { stripOptimistic } from '@/lib/playground/thread'
import { detectImageGenerationIntent, extractImagePrompt } from '@/lib/ai/imageDetection'

export const runtime = 'nodejs'
export const maxDuration = 120

/** Enough of the app's code for Kan to answer questions about it without paying to ship the whole file every turn. */
const CODE_EXCERPT_CHARS = 12000

/** How many images from earlier in the thread to re-send on a given turn. */
const MAX_HISTORY_IMAGES = 6

interface ThreadMessage {
  id?: unknown
  type?: string
  content?: string
  imageUrls?: string[]
  whiteboards?: { snapshotImageUrl?: string }[]
}

/** Every picture attached to a message — uploads and whiteboard sketches alike. */
function messageImageUrls(m: ThreadMessage): string[] {
  return [
    ...(Array.isArray(m.imageUrls) ? m.imageUrls : []),
    ...(Array.isArray(m.whiteboards)
      ? m.whiteboards.map((w) => w?.snapshotImageUrl).filter((u): u is string => !!u)
      : []),
  ]
}

/**
 * Talking in an app's thread, without building.
 *
 * The thread does double duty: it is a conversation, and it is the brief the next
 * build reads. So an ordinary message gets an ordinary reply — Kan can answer
 * "what does this do?", think through an approach, or push back — and every one of
 * those messages is still sitting there as context when the user hits Update app.
 *
 * Kan does not write or propose code here. Building is an explicit action the user
 * takes, and a model that volunteers a diff in chat trains people to stop using it.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ appId: string }> }) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { appId } = await params
  let body: {
    message?: string
    imageUrls?: string[]
    type?: 'note' | 'question'
    whiteboards?: Array<{ id: string; snapshot: string; snapshotImageUrl?: string }>
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const message = (body.message || '').trim()
  const imageUrls = Array.isArray(body.imageUrls) ? body.imageUrls.filter(u => typeof u === 'string') : []
  const whiteboards = Array.isArray(body.whiteboards) ? body.whiteboards.filter(w => w?.snapshot) : []
  // A note is recorded and nothing more; a question is answered. Same split as a
  // card thread, so the composer behaves identically in both places.
  const isNote = body.type === 'note'
  if (!message && imageUrls.length === 0 && whiteboards.length === 0) {
    return NextResponse.json({ error: 'message, imageUrls or whiteboards is required' }, { status: 400 })
  }

  try {
    await ensureSchema()
    const app = await db.query.playgroundApps.findFirst({ where: eq(playgroundApps.id, appId) })
    if (!app) {
      return NextResponse.json({ error: 'App not found' }, { status: 404 })
    }
    await requirePermission(app.channelId, session.user.id, 'edit')

    const history = stripOptimistic<ThreadMessage>(app.messages)

    const userMessage = {
      id: nanoid(),
      type: (isNote ? 'note' : 'question') as 'note' | 'question',
      content: message,
      imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
      whiteboards: whiteboards.length > 0 ? whiteboards : undefined,
      authorId: session.user.id,
      createdAt: new Date().toISOString(),
    }

    // A note costs nothing and asks nothing. It still lands in the thread, so the
    // next build reads it — pinning a screenshot with no commentary is a perfectly
    // good way to brief a build.
    if (isNote) {
      const messages = [...history, userMessage]
      await db
        .update(playgroundApps)
        .set({
          messages: messages as unknown as typeof playgroundApps.$inferInsert.messages,
          updatedAt: new Date(),
        })
        .where(eq(playgroundApps.id, appId))
      return NextResponse.json({ messages })
    }

    const card = await db.query.cards.findFirst({ where: eq(cards.id, app.cardId) })

    const { client, error } = await getLLMClientForUser(session.user.id)
    if (!client) {
      return NextResponse.json({ error: error || 'No AI provider configured' }, { status: 400 })
    }

    const systemPrompt = [
      'You are Kan, the assistant inside Kanthink. You are talking in the thread of a playground app — a single-file React app generated from a card.',
      '',
      `APP: ${app.title}`,
      app.summary ? `WHAT IT DOES: ${app.summary}` : 'This app has not been built yet — there is no code, only the brief forming in this thread.',
      card ? `SOURCE CARD: ${card.title}${card.summary ? ` — ${card.summary}` : ''}` : '',
      app.designNotes ? `ESTABLISHED DESIGN DECISIONS:\n${app.designNotes}` : '',
      app.code ? `CURRENT CODE (excerpt):\n\`\`\`jsx\n${app.code.slice(0, CODE_EXCERPT_CHARS)}\n\`\`\`` : '',
      '',
      'HOW TO BEHAVE:',
      '- Talk like a colleague looking at the same screen. Short, concrete, no preamble.',
      '- You are NOT building right now. Never output code, diffs, or a rewritten component.',
      '- The user builds by pressing "Update app", which sends this whole thread to the generator. So when they describe a change, help them sharpen it — do not implement it, and do not say you have implemented it.',
      '- If a request is ambiguous in a way that would produce the wrong app, ask the one question that resolves it.',
      '- Not every message needs an action. If they are thinking out loud, think with them.',
      '- You CAN see images. Attachments in this thread, whiteboard sketches, and (before the first build) images on the source card are all sent to you as pictures. Never tell the user you only see text, and never ask them for image URLs — look at what is there.',
      "- You CAN generate images. Asking for a mockup, a sketch, a concept or an illustration produces one and attaches it to your reply. Never say you have no image generator or that you can only chat and edit code — say in a sentence what you are drawing and why, then let the picture arrive. Describing what you would draw is not a substitute for drawing it.",
      '- Never announce product updates or steer toward what is new.',
    ].filter(Boolean).join('\n')

    // History carries its pictures, not just its words.
    //
    // Building this as text-only meant an image pinned two messages ago was invisible
    // — Kan would answer "I only see the text in this thread" about a screenshot
    // sitting right there on screen, which reads as the attachment having failed.
    // Images are attached newest-first up to a budget, because a long illustrated
    // thread would otherwise cost more per turn than the answer is worth.
    let imageBudget = MAX_HISTORY_IMAGES

    // Before the first build the source card is the brief, so its pictures are part
    // of the conversation — the same rule the builder follows. After that the app
    // owns its own thread and the card stops being re-read.
    const cardImages = !app.code && card
      ? stripOptimistic<ThreadMessage>(card.messages).flatMap(messageImageUrls)
      : []
    const cardImageMessages: LLMMessage[] = []
    if (cardImages.length > 0) {
      const taken = cardImages.slice(0, Math.min(3, imageBudget))
      imageBudget -= taken.length
      if (taken.length > 0) {
        cardImageMessages.push({
          role: 'user',
          content: [
            { type: 'text' as const, text: `Images from the source card "${card!.title}":` },
            ...taken.map((url) => ({ type: 'image_url' as const, image_url: { url } })),
          ],
        })
      }
    }

    const conversation: LLMMessage[] = history
      .slice(-30)
      .reverse()
      .map((m) => {
        const role = (m.type === 'ai_response' ? 'assistant' : 'user') as 'assistant' | 'user'
        const text = m.content || ''
        // Only a user can carry attachments, and only images we still have room for.
        const urls = role === 'user' && imageBudget > 0 ? messageImageUrls(m) : []
        const taken = urls.slice(0, imageBudget)
        imageBudget -= taken.length
        if (taken.length === 0) return { role, content: text }
        return {
          role,
          content: [
            { type: 'text' as const, text: text || '(image)' },
            ...taken.map((url) => ({ type: 'image_url' as const, image_url: { url } })),
          ],
        }
      })
      .reverse()

    // Images ride along as content parts so Kan can actually look at what was
    // pinned, rather than being told an image exists.
    const visualUrls = [
      ...imageUrls,
      ...whiteboards.map((w) => w.snapshotImageUrl).filter((u): u is string => !!u),
    ]
    const userContent: LLMContentPart[] | string = visualUrls.length > 0
      ? [
          { type: 'text' as const, text: message || 'What do you make of this?' },
          ...visualUrls.slice(0, 4).map((url) => ({
            type: 'image_url' as const,
            image_url: { url },
          })),
        ]
      : message

    const response = await client.complete(
      [
        { role: 'system', content: systemPrompt },
        ...cardImageMessages,
        ...conversation,
        { role: 'user', content: userContent },
      ],
      { maxTokens: 1200 }
    )

    await recordUsage(session.user.id, 'playground-app-chat')

    // Asking for a mockup in an app thread is asking for a picture of the thing
    // being built, which is the most natural request there is here — and until now
    // the route had no way to answer it, so Kan denied he could.
    let generatedImageUrls: string[] | undefined
    let imageNote = ''
    if (detectImageGenerationIntent(message)) {
      try {
        const baseUrl = process.env.NEXTAUTH_URL || 'https://kanthink.com'
        const imgRes = await fetch(`${baseUrl}/api/generate-image`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // The generator authenticates as the user, so it bills the right
            // account and uses their key.
            Cookie: req.headers.get('cookie') || '',
          },
          body: JSON.stringify({ prompt: extractImagePrompt(message), aspectRatio: '1:1' }),
        })
        const imgData = await imgRes.json().catch(() => null)
        if (imgRes.ok && imgData?.url) {
          generatedImageUrls = [imgData.url]
        } else {
          imageNote = `\n\n(Couldn't generate the image: ${imgData?.error ?? 'unknown error'})`
        }
      } catch (err) {
        imageNote = `\n\n(Couldn't generate the image: ${err instanceof Error ? err.message : 'unknown error'})`
      }
    }

    const aiMessage = {
      id: nanoid(),
      type: 'ai_response' as const,
      content: response.content + imageNote,
      imageUrls: generatedImageUrls,
      createdAt: new Date().toISOString(),
    }
    const messages = [...history, userMessage, aiMessage]

    await db
      .update(playgroundApps)
      .set({
        messages: messages as unknown as typeof playgroundApps.$inferInsert.messages,
        updatedAt: new Date(),
      })
      .where(eq(playgroundApps.id, appId))

    return NextResponse.json({ messages, reply: aiMessage })
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    console.error('[playground/apps/:id/chat] failed:', error)
    return NextResponse.json({ error: 'Chat failed' }, { status: 500 })
  }
}
