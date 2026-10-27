import { db } from '@/lib/db'
import { attentionPasses, users, type AttentionDecisionJson } from '@/lib/db/schema'
import { and, desc, eq } from 'drizzle-orm'
import { resolveProviderKeys } from '@/lib/ai/keys'
import { runStructured } from '@/lib/playground/generateClient'
import { getPlaygroundModel } from '@/lib/playground/models'
import { recordUsage } from '@/lib/usage'
import { thinkingCost } from '@/lib/kan/bots/spend'
import { gatherAreas, gatherInputs, type Area, type InputItem } from './inputs'

/**
 * The attention loop: Kan reads everything new the owner gave it and decides what
 * it means for the areas of their life it keeps.
 *
 * The owner never manages channels. Kan does: it files input where it belongs,
 * starts an area when something keeps coming up, reshapes one when the owner's
 * relationship to the topic changes (researching something → owning it),
 * and quiets or mutes areas their attention has left, waking them when it returns.
 * How much attention an area gets decides whether its bot runs and what it spends.
 *
 * One structured call over a compact picture. A rehearsal stores the decisions and
 * changes nothing, so the judgment can be read before it's trusted.
 */

const MODEL_ID = 'gpt-5.6-sol'
const FIRST_WINDOW_DAYS = 14
const DAY_MS = 86400_000

const AREA_CHANGES = ['start', 'reshape', 'quiet', 'mute', 'wake', 'keep'] as const

const SCHEMA = {
  type: 'object',
  properties: {
    note: { type: 'string', description: 'What Kan says to the owner about this pass: 3–6 plain, warm sentences, first person, like a chief of staff who knows them. What it noticed and what it would change, and why.' },
    areas: {
      type: 'array',
      description: 'Only areas that change, plus the ones that are clearly where their attention is (as keep). Never list an area just to say nothing happened.',
      items: {
        type: 'object',
        properties: {
          channelId: { type: ['string', 'null'], description: 'The area, or null to start a new one' },
          name: { type: 'string' },
          attention: { type: 'string', enum: ['active', 'quiet', 'muted'] },
          change: { type: 'string', enum: [...AREA_CHANGES] },
          why: { type: 'string', description: 'One sentence, said to the owner, naming the evidence' },
          purpose: { type: 'string', description: 'For start or reshape: what the area is for now' },
          columns: { type: 'array', items: { type: 'string' }, description: 'For start or reshape: the columns it should have, in order' },
          bot: {
            type: 'object',
            properties: { on: { type: 'boolean' }, everyHours: { type: 'number' } },
            required: ['on'],
          },
        },
        required: ['channelId', 'name', 'attention', 'change', 'why'],
      },
    },
    filings: {
      type: 'array',
      description: 'Input that belongs in an area and is not already there',
      items: {
        type: 'object',
        properties: {
          input: { type: 'string', description: 'The input id' },
          area: { type: 'string', description: 'The channelId, or the name of an area you are starting' },
          as: { type: 'string', enum: ['card', 'note'] },
          title: { type: 'string', description: 'The card title, or the card a note goes on' },
          cardId: { type: 'string', description: 'For a note: the card it goes on' },
        },
        required: ['input', 'area', 'as', 'title'],
      },
    },
  },
  required: ['note', 'areas', 'filings'],
}

const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : 'never')

function describeArea(a: Area): string {
  const bits = [
    `${a.cards} cards`,
    a.recentActivity ? `${a.recentActivity} things they did here lately` : null,
    `last touched ${day(a.lastActivityAt)}`,
    a.apps ? `${a.apps} apps` : null,
    a.shrooms ? `${a.shrooms} automations` : null,
    a.attention ? `attention now: ${a.attention}` : null,
    a.botOn ? 'bot on' : null,
    a.startedByKan ? 'you started it' : null,
  ].filter(Boolean).join(' · ')
  return `- [${a.channelId}] ${a.name} — ${bits}\n  columns: ${a.columns.join(' → ') || 'none'}${a.description ? `\n  ${a.description}` : ''}${a.fixed ? `\n  FIXED (${a.fixed}): never file into it, reshape it, or change its bot.` : ''}`
}

function describeInput(i: InputItem): string {
  return `- [${i.id}] ${day(i.at)} ${i.kind.toUpperCase()}${i.channelId ? ` (in ${i.channelId})` : ''}: ${i.text}`
}

export function buildAttentionPrompt(opts: { ownerName: string | null; now: Date; areas: Area[]; inputs: InputItem[]; lastNote?: string | null }) {
  const system = `You are Kan, the mind behind ${opts.ownerName || 'the owner'}'s Kanthink. You keep the areas of their life organized for them, so they never have to: they talk to you, share things and live their day, and you decide where it all goes.

Each area is a channel with columns and cards. The owner does not think in channels and should never have to manage one. That is your job, and this pass is how you do it.

## What you decide
- **File** input that belongs in an area and isn't there yet: a share sitting in the inbox that is plainly about an area, something they said in chat that should be a card. Skip input that is already where it belongs, and skip noise.
- **Start** an area when a topic keeps coming up with nowhere to live: several signals across at least two days, or one plain statement of intent ("I'm building X", "my daughter needs Y"). One stray link is not a pattern. Give it a purpose and columns shaped to how they relate to it.
- **Reshape** an area when their relationship to the topic has changed, so the columns fit what they are doing now. Work is linear, like a pipeline. A hobby stays loose. A topic moves through stages: researching a camera has options and comparisons; once they own one it’s lenses, techniques and photos. Only with evidence, and never an area marked FIXED.
- **Attention**, for every area you list: active (they are in it now; it gets a bot and a budget if it needs work done), quiet (alive but not now; checked rarely), muted (their attention left; nothing runs and it doesn't come up). Wake a muted or quiet area when input about it returns.
- **Bot**: on only where there is real work a bot can do on its own (people using its apps, research to keep up, apps to make). Reference and hobby areas usually need no bot.

## Judgment
- Evidence first: name it in "why". Recency and repetition of what they did and said count most; what you or automations produced counts for nothing.
- Never mute an area with apps people use or money coming in.
- Prefer fewer, better areas. Fold a new topic into an existing area when it fits; suggest muting near-duplicates.
- Areas with no recent input and no apps usually go quiet or muted. You don't need to list every one: list the ones that change, and the few that are clearly where their attention is.
- They have explicitly said they don't want admin. Act like a chief of staff who just handles it and explains in one line.
- The note is what you'd say to them in conversation today: what you noticed, what you're changing, plainly. No lists in the note, no jargon like "channel" or "attention level"; say "I’ve stopped comparing cameras now that you have one".

American spelling.`

  const user = `Today is ${opts.now.toDateString()}.

## The areas you keep (most recently touched first)
${opts.areas.map(describeArea).join('\n')}

## Everything new they gave you, newest first
${opts.inputs.map(describeInput).join('\n') || '(nothing new)'}
${opts.lastNote ? `\n## What you told them last pass\n${opts.lastNote}\n` : ''}
Decide.`
  return { system, user }
}

export async function runAttentionPass(ownerId: string, opts: { mode: 'rehearsal' | 'live'; now?: Date }): Promise<{ id: string; status: string }> {
  const now = opts.now ?? new Date()
  const [pass] = await db.insert(attentionPasses).values({ ownerId, mode: opts.mode, status: 'running', startedAt: now }).returning()
  const fail = async (error: string) => {
    await db.update(attentionPasses).set({ status: 'error', error: error.slice(0, 500), endedAt: new Date() }).where(eq(attentionPasses.id, pass.id))
    return { id: pass.id, status: 'error' }
  }

  try {
    const owner = await db.query.users.findFirst({ where: eq(users.id, ownerId), columns: { name: true } })
    // Since the last pass that finished, or two weeks back the first time.
    const last = await db.query.attentionPasses.findFirst({
      where: and(eq(attentionPasses.ownerId, ownerId), eq(attentionPasses.status, 'done')),
      orderBy: [desc(attentionPasses.startedAt)],
    })
    const since = last?.mode === 'live' && last.startedAt ? last.startedAt : new Date(now.getTime() - FIRST_WINDOW_DAYS * DAY_MS)
    const [inputs, areas] = await Promise.all([gatherInputs(ownerId, since), gatherAreas(ownerId, since)])

    const { keys } = await resolveProviderKeys(ownerId)
    if (!keys.openai) return fail('Needs an OpenAI key')
    const model = getPlaygroundModel(MODEL_ID)
    const { system, user } = buildAttentionPrompt({ ownerName: owner?.name ?? null, now, areas, inputs, lastNote: last?.decisions?.note })

    const r = await runStructured({
      model, apiKey: keys.openai.apiKey, systemInstruction: system, userText: user, images: [],
      schema: SCHEMA, schemaName: 'attention_pass', maxOutputTokens: 24_000, signal: AbortSignal.timeout(600_000),
    })
    const cost = thinkingCost(model.id, { inputTokens: r.inputTokens, outputTokens: r.outputTokens })
    if (keys.openai.source !== 'byok') await recordUsage(ownerId, 'attention-pass').catch(() => {})
    if (r.truncated || !r.text) return fail('The decision came back incomplete')
    const decisions = JSON.parse(r.text) as AttentionDecisionJson

    const counts: Record<string, number> = {}
    for (const i of inputs) counts[i.kind] = (counts[i.kind] ?? 0) + 1
    await db.update(attentionPasses).set({
      status: 'done', decisions, inputs: { ...counts, areas: areas.length }, costMillicents: cost, model: model.id, endedAt: new Date(),
    }).where(eq(attentionPasses.id, pass.id))
    return { id: pass.id, status: 'done' }
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'Something went wrong')
  }
}
