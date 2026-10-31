import { db } from '@/lib/db'
import { cards, channelBots, channels, users } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { residentOf } from './residents'
import { botMsg, callName, noteFor } from './talk'

/**
 * The TV in a building plays the YouTube videos shared to its channel, and its
 * resident can watch along. Watching is real: Gemini takes the video itself (by its
 * YouTube link) and the resident comes away with notes on what was said and what it
 * means for the channel. The notes go on the card the video came in on, as the
 * resident's own message, and a line goes in its memory, so next time you chat it
 * knows what it saw. Each video is watched once per card.
 */

const ID = /(?:youtube\.com\/(?:watch\?(?:[^\s#]*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/g

/** Every YouTube video id in a piece of text, in order, once each. */
export function youtubeIds(text: string | null | undefined): string[] {
  const out: string[] = []
  for (const m of (text ?? '').matchAll(ID)) if (!out.includes(m[1])) out.push(m[1])
  return out
}

type Msg = { type?: string; content?: string; watched?: string }

/** The videos on a channel's cards: newest card first, each video once. */
export function videosIn(rows: { id: string; title: string | null; summary?: string | null; messages?: unknown; updatedAt?: Date | null }[]) {
  const seen = new Set<string>()
  const out: { videoId: string; cardId: string; cardTitle: string; watched: boolean }[] = []
  const sorted = [...rows].sort((a, b) => +(b.updatedAt ?? 0) - +(a.updatedAt ?? 0))
  for (const r of sorted) {
    const msgs = (Array.isArray(r.messages) ? r.messages : []) as Msg[]
    const ids = youtubeIds([r.title, r.summary, ...msgs.map((m) => m.content)].join('\n'))
    for (const videoId of ids) {
      if (seen.has(videoId)) continue
      seen.add(videoId)
      out.push({ videoId, cardId: r.id, cardTitle: r.title || 'Untitled', watched: msgs.some((m) => m.watched === videoId) })
    }
  }
  return out.slice(0, 30)
}

export interface Watched { said: string; title: string; already: boolean }

/** The resident watches a video and keeps what it learned. */
export async function watchVideo(userId: string, channelId: string, cardId: string, videoId: string): Promise<Watched | { error: string }> {
  if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) return { error: 'That isn’t a YouTube video.' }
  const [channel, card, bot, owner] = await Promise.all([
    db.query.channels.findFirst({ where: eq(channels.id, channelId), columns: { id: true, name: true, description: true } }),
    db.query.cards.findFirst({ where: and(eq(cards.id, cardId), eq(cards.channelId, channelId)), columns: { id: true, title: true, messages: true, summary: true } }),
    db.query.channelBots.findFirst({ where: eq(channelBots.channelId, channelId) }),
    db.query.users.findFirst({ where: eq(users.id, userId), columns: { name: true } }),
  ])
  if (!channel || !card) return { error: 'That video isn’t on this board anymore.' }
  const msgs = (card.messages ?? []) as Msg[]
  if (!youtubeIds([card.title, card.summary, ...msgs.map((m) => m.content)].join('\n')).includes(videoId)) return { error: 'That video isn’t on this card.' }
  const resident = residentOf({ id: channel.id, name: channel.name }, bot)
  const boss = callName(owner)
  if (msgs.some((m) => m.watched === videoId)) return { said: `I’ve seen this one, ${boss}! My notes are on the card.`, title: card.title, already: true }

  const { resolveProviderKeys } = await import('@/lib/ai/keys')
  const { keys, quotaExhausted } = await resolveProviderKeys(userId)
  const apiKey = keys.google?.apiKey
  if (!apiKey) return { error: quotaExhausted ? 'Out of AI for today, so no watching along.' : 'Watching along needs a Google AI key.' }

  const { GoogleGenAI, MediaResolution } = await import('@google/genai')
  const ai = new GoogleGenAI({ apiKey })
  let j: { title?: string; notes?: string; takeaways?: string[]; said?: string } = {}
  try {
    const res = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{
        role: 'user',
        parts: [
          { fileData: { fileUri: `https://www.youtube.com/watch?v=${videoId}`, mimeType: 'video/*' } },
          {
            text: [
              `You are ${resident.name}, a little mushroom bot who runs the "${channel.name}" channel${channel.description ? ` (${channel.description})` : ''} for ${boss}, your boss. ${resident.personality}`,
              `${boss} just put this video on the TV in your building and you watched it together. It came in on the card "${card.title}".`,
              'Answer with JSON only:',
              '{"title": "the video’s title",',
              ' "notes": "what was said, in order, as condensed transcript notes with [mm:ss] marks; up to about 500 words, plain text with line breaks",',
              ' "takeaways": ["3 to 5 short points that matter for this channel"],',
              ` "said": "what you tell ${boss} right after, out loud: one thing that struck you and one idea for the channel, under 40 words, warm and in your own voice"}`,
            ].join('\n'),
          },
        ],
      }],
      config: { mediaResolution: MediaResolution.MEDIA_RESOLUTION_LOW, maxOutputTokens: 8000, responseMimeType: 'application/json' },
    })
    j = JSON.parse(res.text?.match(/\{[\s\S]*\}/)?.[0] ?? '{}')
  } catch (err) {
    console.error('[city] watch', err)
    return { error: 'I couldn’t watch that one. It might be private, or too long.' }
  }
  const title = (typeof j.title === 'string' && j.title.trim() ? j.title.trim() : card.title).slice(0, 140)
  const takeaways = (Array.isArray(j.takeaways) ? j.takeaways : []).filter((t): t is string => typeof t === 'string' && Boolean(t.trim())).slice(0, 6)
  const notes = typeof j.notes === 'string' ? j.notes.trim().slice(0, 6000) : ''
  const said = typeof j.said === 'string' && j.said.trim() ? j.said.trim().slice(0, 300) : `That was good, ${boss}. I took notes.`
  if (!notes && !takeaways.length) return { error: 'I watched, but nothing stuck. Try another?' }

  // On the card, where the video lives, as the resident's own message.
  const body = [
    `📺 I watched **${title}** on the TV with ${boss}.`,
    takeaways.length ? `\n**What I took from it**\n${takeaways.map((t) => `- ${t}`).join('\n')}` : '',
    notes ? `\n**My notes**\n\n${notes}` : '',
  ].join('\n')
  const fresh = await db.query.cards.findFirst({ where: eq(cards.id, card.id), columns: { messages: true } })
  // `watched` marks it seen, so the same video isn't watched (and paid for) twice.
  const message = Object.assign(botMsg(resident.name, body), { watched: videoId })
  await db.update(cards).set({ messages: [...(fresh?.messages ?? []), message], updatedAt: new Date() }).where(eq(cards.id, card.id))
  // And a line to remember it by.
  await noteFor(channel.id, `Watched "${title}" with ${boss} (notes on card "${card.title}"): ${takeaways.slice(0, 3).join('; ')}`.slice(0, 600))
  return { said, title, already: false }
}
