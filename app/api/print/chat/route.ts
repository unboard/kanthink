import { NextResponse } from 'next/server'
import { Type, type Schema } from '@google/genai'
import { printProviderKeys, recordPrintUsage } from '@/lib/print/server/meter'
import { getLLMClientForUser } from '@/lib/ai/llm'
import { CHAT_ACTIONS, chatSystemPrompt, chatUserPrompt, cleanChatReply, summarizeDesign, type ChatTurn } from '@/lib/print/chat'
import { geminiJson, parseLooseJson } from '@/lib/print/server/understand'
import { getBrand, getDesign, printUser } from '@/lib/print/server/store'

/**
 * POST { designId?, turns } → { reply, actions, suggestions }
 *
 * Kan's half of the chat way of designing. Stateless: the design is read fresh from
 * the database (the client saves before asking), and only the last few turns are
 * sent, so a long conversation costs what a short one does.
 */

export const maxDuration = 60

const MAX_TURNS = 14

const REPLY_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    reply: { type: Type.STRING },
    actions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          type: { type: Type.STRING, enum: [...CHAT_ACTIONS] },
          product: { type: Type.STRING },
          sides: { type: Type.INTEGER },
          widthIn: { type: Type.NUMBER },
          heightIn: { type: Type.NUMBER },
          name: { type: Type.STRING },
          prompt: { type: Type.STRING },
          page: { type: Type.INTEGER },
          instruction: { type: Type.STRING },
          takes: { type: Type.INTEGER },
          headline: { type: Type.STRING },
          subhead: { type: Type.STRING },
          cta: { type: Type.STRING },
          body: { type: Type.ARRAY, items: { type: Type.STRING } },
          details: { type: Type.ARRAY, items: { type: Type.STRING } },
          business: { type: Type.STRING },
          tagline: { type: Type.STRING },
          phone: { type: Type.STRING },
          email: { type: Type.STRING },
          website: { type: Type.STRING },
          address: { type: Type.STRING },
          colors: { type: Type.ARRAY, items: { type: Type.STRING } },
          url: { type: Type.STRING },
        },
        required: ['type'],
      },
    },
    suggestions: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  propertyOrdering: ['reply', 'actions', 'suggestions'],
  required: ['reply', 'actions', 'suggestions'],
}

export async function POST(request: Request) {
  const userId = await printUser()
  if (!userId) return NextResponse.json({ error: 'Sign in to use the print studio.' }, { status: 401 })
  const body = await request.json().catch(() => null)
  const turns: ChatTurn[] = (Array.isArray(body?.turns) ? body.turns : [])
    .filter((t: ChatTurn) => t && (t.role === 'user' || t.role === 'kan' || t.role === 'event') && typeof t.text === 'string')
    .slice(-MAX_TURNS)
    .map((t: ChatTurn) => ({ role: t.role, text: t.text.slice(0, 1200) }))
  if (!turns.length) return NextResponse.json({ error: 'Say something first.' }, { status: 400 })

  const design = typeof body?.designId === 'string' ? await getDesign(userId, body.designId) : null
  const brand = await getBrand(userId, design?.brandId)
  const summary = summarizeDesign(design, brand?.data ?? null, brand?.name ?? null)
  const system = chatSystemPrompt()
  const user = chatUserPrompt(summary, turns)

  try {
    const { keys } = await printProviderKeys(userId)
    let raw: unknown = null
    if (keys.google) {
      raw = await geminiJson<unknown>(keys.google.apiKey, [{ text: `${system}\n\n${user}` }], REPLY_SCHEMA)
    } else {
      const { client, error } = await getLLMClientForUser(userId, undefined, 'chat')
      if (!client) return NextResponse.json({ error: error ?? 'No AI key configured.' }, { status: 400 })
      const res = await client.complete(
        [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        { maxTokens: 1200 },
      )
      raw = parseLooseJson(res.content)
    }
    const reply = cleanChatReply(raw)
    if (!reply.reply && !reply.actions.length) {
      return NextResponse.json({ reply: 'Sorry — I lost my train of thought. Could you say that again?', actions: [], suggestions: [] })
    }
    await recordPrintUsage(userId, 'print-chat').catch(() => {})
    return NextResponse.json(reply)
  } catch (err) {
    console.error('[print] chat failed:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Kan couldn’t answer.' }, { status: 502 })
  }
}
