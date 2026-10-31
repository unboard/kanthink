import { db } from '@/lib/db'
import { channelBots, channels } from '@/lib/db/schema'
import { and, eq, inArray } from 'drizzle-orm'
import { hash } from './layout'

/**
 * Every channel has a resident: the mushroom bot who lives on its plot. It has a
 * name that nods to its channel, a personality, and a voice of its own, so talking
 * to the Scarlett bot never sounds like talking to the MyCreativeShop one.
 *
 * Kan names them in batches, in the background, the first time the city sees an
 * unnamed one. Until then a resident goes by a name made from its channel's.
 */

/** OpenAI's TTS voices, with what each sounds like so names and voices can match. */
export const VOICES = {
  alloy: 'even and friendly',
  ash: 'warm, low, easygoing',
  coral: 'bright and cheerful',
  echo: 'calm and thoughtful',
  fable: 'storyteller, a little British',
  nova: 'upbeat and quick',
  onyx: 'deep and steady',
  sage: 'gentle and wise',
  shimmer: 'soft and kind',
} as const
export type Voice = keyof typeof VOICES
const VOICE_IDS = Object.keys(VOICES) as Voice[]

export interface Resident {
  channelId: string
  name: string
  voice: Voice
  personality: string
}

/** What a resident is called before Kan has named it: the channel's first word. */
export function fallbackName(channelName: string) {
  const word = channelName.replace(/[^\p{L}\p{N}\s']/gu, ' ').trim().split(/\s+/)[0] || 'Sprout'
  return word.length > 12 ? word.slice(0, 12) : word
}

export function residentOf(channel: { id: string; name: string }, bot?: { name?: string | null; voice?: string | null; personality?: string | null } | null): Resident {
  const voice = (bot?.voice && bot.voice in VOICES ? bot.voice : VOICE_IDS[hash(channel.id) % VOICE_IDS.length]) as Voice
  return {
    channelId: channel.id,
    name: bot?.name || fallbackName(channel.name),
    voice,
    personality: bot?.personality || 'Curious, warm, and keen to make this channel work.',
  }
}

const naming = new Map<string, number>()

/**
 * Name every unnamed resident the owner has, in one model call. Safe to call often:
 * it does nothing when they're all named, and runs at most once every ten minutes per owner.
 */
export async function nameResidents(ownerId: string): Promise<number> {
  if (Date.now() - (naming.get(ownerId) ?? 0) < 10 * 60_000) return 0
  naming.set(ownerId, Date.now())
  const owned = await db.query.channels.findMany({
    where: and(eq(channels.ownerId, ownerId), eq(channels.status, 'active')),
    columns: { id: true, name: true, description: true },
  })
  if (!owned.length) return 0
  const rows = await db.query.channelBots.findMany({ where: inArray(channelBots.channelId, owned.map((c) => c.id)), columns: { channelId: true, name: true } })
  const named = new Map(rows.map((r) => [r.channelId, r.name]))
  const todo = owned.filter((c) => !named.get(c.id)).slice(0, 40)
  if (!todo.length) return 0
  const taken = rows.map((r) => r.name).filter(Boolean) as string[]

  const { getLLMClientForUser } = await import('@/lib/ai/llm')
  const { client } = await getLLMClientForUser(ownerId)
  if (!client) return 0
  let n = 0
  // A few at a time: a long list risks an answer cut off mid-JSON, which names nobody.
  for (let i = 0; i < todo.length; i += 10) {
    const batch = todo.slice(i, i + 10)
    const prompt = [
      'You name the little mushroom bots who live in Kan City. Each one lives in, and runs, one of the owner’s channels.',
      'For every channel below, invent:',
      '- name: one cute, short name (one word, two at most) that nods to the channel: a pun, a playful twist, or a word from its world. Never just the channel name. All names different' + (taken.length ? `, and not any of: ${taken.join(', ')}` : '') + '.',
      '- personality: one short line on who they are, in the third person, shaped by what the channel is for.',
      `- voice: the voice that suits them best, one of: ${VOICE_IDS.map((v) => `${v} (${VOICES[v]})`).join(', ')}. Spread the voices around.`,
      '',
      'Answer with JSON only: [{"channelId": "...", "name": "...", "personality": "...", "voice": "..."}]',
      '',
      ...batch.map((c) => `- ${c.id}: ${c.name}${c.description ? ` — ${c.description.slice(0, 160)}` : ''}`),
    ].join('\n')
    let picked: { channelId?: unknown; name?: unknown; personality?: unknown; voice?: unknown }[] = []
    try {
      const res = await client.complete([{ role: 'user', content: prompt }], { maxTokens: 6000 })
      const json = res.content.match(/\[[\s\S]*\]/)?.[0]
      if (json) picked = JSON.parse(json)
    } catch (err) {
      console.error('[city] naming residents', err)
    }
    for (const p of picked) {
      const c = batch.find((x) => x.id === p?.channelId)
      if (!c || typeof p.name !== 'string' || !p.name.trim()) continue
      const fallback = residentOf(c)
      const set = {
        name: p.name.trim().slice(0, 24),
        personality: (typeof p.personality === 'string' && p.personality.trim().slice(0, 240)) || fallback.personality,
        voice: typeof p.voice === 'string' && p.voice in VOICES ? p.voice : fallback.voice,
      }
      taken.push(set.name)
      await db.insert(channelBots).values({ channelId: c.id, ownerId, ...set })
        .onConflictDoUpdate({ target: channelBots.channelId, set: { ...set, updatedAt: new Date() } })
      n++
    }
  }
  return n
}
