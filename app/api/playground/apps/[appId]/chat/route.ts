import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { cards, playgroundApps } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { requirePermission, PermissionError } from '@/lib/api/permissions'
import { ensureSchema } from '@/lib/db/ensure-schema'
import { getLLMClientForUser, type LLMContentPart } from '@/lib/ai/llm'
import { recordUsage } from '@/lib/usage'
import { stripOptimistic } from '@/lib/playground/thread'

export const runtime = 'nodejs'
export const maxDuration = 120

/** Enough of the app's code for Kan to answer questions about it without paying to ship the whole file every turn. */
const CODE_EXCERPT_CHARS = 12000

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

    const history = stripOptimistic<{ id?: unknown; type?: string; content?: string }>(app.messages)

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
      '- Never announce product updates or steer toward what is new.',
    ].filter(Boolean).join('\n')

    const conversation = history.slice(-30).map((m) => ({
      role: (m.type === 'ai_response' ? 'assistant' : 'user') as 'assistant' | 'user',
      content: m.content || '',
    }))

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
        ...conversation,
        { role: 'user', content: userContent },
      ],
      { maxTokens: 1200 }
    )

    await recordUsage(session.user.id, 'playground-app-chat')

    const aiMessage = {
      id: nanoid(),
      type: 'ai_response' as const,
      content: response.content,
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
