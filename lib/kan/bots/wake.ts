import { db } from '@/lib/db'
import { botRuns, channelBots, channels, playgroundApps } from '@/lib/db/schema'
import { and, desc, eq, gt, inArray, ne } from 'drizzle-orm'

/**
 * You shared something: wake the bot whose tool fits it, now, rather than tomorrow.
 *
 * Only bots that are on duty and already have a tool are candidates; a quick, cheap
 * call reads the share against their tools and picks the one it fits (or none, which
 * is most shares). That bot runs at once with the share as its focus, so it can make
 * an episode and hand it over while you're still around. Never throws.
 */

/** A bot woken this recently isn't woken again: shares often come in bursts. */
const QUIET_AFTER_WAKE_MS = 10 * 60_000

export async function wakeForShare(ownerId: string, share: string): Promise<{ woke: string | null; why: string }> {
  try {
    const bots = await db.query.channelBots.findMany({ where: and(eq(channelBots.ownerId, ownerId), eq(channelBots.enabled, true)), columns: { channelId: true, name: true } })
    if (!bots.length) return { woke: null, why: 'no bots on duty' }
    const ids = bots.map((b) => b.channelId)
    const [apps, chans] = await Promise.all([
      db.query.playgroundApps.findMany({ where: and(inArray(playgroundApps.channelId, ids), eq(playgroundApps.isArchived, false), gt(playgroundApps.generationCount, 0)), columns: { channelId: true, title: true, summary: true } }),
      db.query.channels.findMany({ where: inArray(channels.id, ids), columns: { id: true, name: true, description: true } }),
    ])
    const withTools = ids.filter((id) => apps.some((a) => a.channelId === id))
    if (!withTools.length) return { woke: null, why: 'no tools yet' }

    const pick = await pickBot(ownerId, share, withTools.map((id) => ({
      id,
      channel: chans.find((c) => c.id === id)?.name ?? '',
      about: chans.find((c) => c.id === id)?.description ?? '',
      tools: apps.filter((a) => a.channelId === id).map((a) => `${a.title}${a.summary ? `: ${a.summary.slice(0, 160)}` : ''}`),
    })))
    if (!pick) return { woke: null, why: 'nothing fits' }

    const recent = await db.query.botRuns.findFirst({
      where: and(eq(botRuns.channelId, pick.id), ne(botRuns.trigger, 'chat'), gt(botRuns.startedAt, new Date(Date.now() - QUIET_AFTER_WAKE_MS))),
      orderBy: [desc(botRuns.startedAt)], columns: { id: true },
    })
    if (recent) return { woke: null, why: 'woke it a moment ago' }

    const { runBot } = await import('./run')
    await runBot(pick.id, { trigger: 'manual', focus: `They just shared this, a moment ago: ${share.slice(0, 1200)}\n\nWhy you were woken: ${pick.why}. If it truly fits your tool, make an episode of it now with make_episode and keep the rest of the run short.` })
    return { woke: pick.id, why: pick.why }
  } catch (err) {
    console.error('[bots] wake', err)
    return { woke: null, why: 'error' }
  }
}

export async function pickBot(ownerId: string, share: string, bots: { id: string; channel: string; about: string; tools: string[] }[]): Promise<{ id: string; why: string } | null> {
  const { resolveProviderKeys } = await import('@/lib/ai/keys')
  const { runStructured } = await import('@/lib/playground/generateClient')
  const { getPlaygroundModel } = await import('@/lib/playground/models')
  const { keys } = await resolveProviderKeys(ownerId)
  // Quick and cheap: this only has to say which bot, if any.
  const choice = keys.google ? { id: 'gemini-3.8-flash', key: keys.google } : keys.anthropic ? { id: 'claude-haiku-4-5', key: keys.anthropic } : keys.openai ? { id: 'gpt-6-luna', key: keys.openai } : null
  if (!choice) return null
  const r = await runStructured({
    model: getPlaygroundModel(choice.id),
    apiKey: choice.key.apiKey,
    systemInstruction: 'You route something a person just shared to the one bot whose tool would turn it into something they would enjoy (an episode: an explainer of a topic, a lesson, a remake). Most shares fit no bot: answer none unless the fit is clear and the result would be fun or useful to them. Never route their day-job work.',
    userText: `They shared:\n${share.slice(0, 2000)}\n\nBots and their tools:\n${bots.map((b) => `- [${b.id}] ${b.channel}${b.about ? ` (${b.about.slice(0, 160)})` : ''}: ${b.tools.join('; ')}`).join('\n')}`,
    images: [],
    schema: {
      type: 'object',
      properties: {
        botId: { type: 'string', description: 'The bot id, or "none"' },
        why: { type: 'string', description: 'One short sentence: what it would make of it' },
      },
      required: ['botId', 'why'],
      additionalProperties: false,
    },
    schemaName: 'wake_pick',
    maxOutputTokens: 300,
    signal: AbortSignal.timeout(30_000),
  })
  if (!r.text) return null
  const out = JSON.parse(r.text) as { botId: string; why: string }
  return bots.some((b) => b.id === out.botId) ? { id: out.botId, why: out.why } : null
}
