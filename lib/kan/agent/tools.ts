import type Anthropic from '@anthropic-ai/sdk'
import { VOICE_TOOLS } from '@/lib/voice/tools'
import { runVoiceAction } from '@/lib/voice/runAction'
import { gatherNow } from './now'
import { pastTense } from './events'

/**
 * Everything the Kan agent can do, as Claude tools.
 *
 * Most of it already existed: voice mode's ~20 actions (cards, tasks, apps, Kanwatch,
 * Mixpanel, channels, builds), run through runVoiceAction. Those are converted from
 * their Gemini declarations rather than rewritten, so voice and the agent can't drift.
 * Added on top: the Studio's money moves, handing a big build to Claude Code, what
 * needs you now, web search, and `suggest` — the proactive part, which offers a next
 * step as a tap instead of taking it.
 *
 * Every tool says what it is doing in plain words (`running`) and what it did
 * (`done`); those are the lines of the trace the user watches.
 */

export interface ToolContext {
  userId: string
  isAdmin: boolean
  name?: string | null
  readable: string[]
  /** A channel bot's own channel: voice actions can't reach past it. */
  scope?: string[]
  /** Cards this conversation made, so a second mention folds into the first. */
  sessionCardIds: string[]
  recentTurns: { role: 'user' | 'kan'; text: string }[]
}

export interface ToolOutcome {
  /** What the model reads back. */
  content: string
  /** What the trace line says now that it's done. */
  label?: string
  isError?: boolean
  /** Where the result lives, so the trace line can link to it. */
  href?: string
  cardId?: string
  /** For `suggest`: the taps to offer under the reply. */
  suggestions?: { label: string; prompt: string }[]
  /** What the tool itself spent on AI (an app build), so a bot's budget can count it. */
  costMillicents?: number
}

export interface AgentTool {
  name: string
  description: string
  input_schema: Anthropic.Tool.InputSchema
  /** Read tools run freely. Write tools change something the user owns. */
  kind: 'read' | 'write'
  running: (input: Record<string, unknown>) => string
  run: (input: Record<string, unknown>, ctx: ToolContext) => Promise<ToolOutcome>
}

export const WORK_CHANNEL_ID = '64eQst0Zx_iYYN4QJLWw3'

// --- Gemini declarations → JSON Schema -----------------------------------------

type GeminiSchema = { type?: string; description?: string; properties?: Record<string, GeminiSchema>; items?: GeminiSchema; required?: string[] }

export function toJsonSchema(s: GeminiSchema): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (s.type) out.type = s.type.toLowerCase()
  if (s.description) out.description = s.description
  if (s.properties) out.properties = Object.fromEntries(Object.entries(s.properties).map(([k, v]) => [k, toJsonSchema(v)]))
  if (s.items) out.items = toJsonSchema(s.items)
  if (s.required?.length) out.required = s.required
  return out
}

const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v))
const quote = (v: unknown, max = 48) => {
  const t = str(v).trim()
  return t ? `“${t.length > max ? `${t.slice(0, max - 1)}…` : t}”` : ''
}

/** How each voice action reads in the trace while it runs. */
const VOICE_LABELS: Record<string, [kind: 'read' | 'write', running: (i: Record<string, unknown>) => string]> = {
  search_cards: ['read', (i) => `Searching ${str(i.channelId) || 'a channel'}${i.query ? ` for ${quote(i.query)}` : ''}`],
  show_card: ['read', (i) => `Reading ${quote(i.cardId) || 'the card'}`],
  show_app: ['read', (i) => (i.appName ? `Opening ${quote(i.appName)}` : 'Looking over your apps')],
  app_audience: ['read', (i) => (i.appName ? `Checking who uses ${quote(i.appName)}` : 'Checking who uses your apps')],
  query_mixpanel: ['read', (i) => `Asking Mixpanel ${quote(i.question, 60)}`],
  kanwatch_lookup: ['read', (i) => (i.query ? `Looking through your reading for ${quote(i.query)}` : `Reading your browsing for ${str(i.date) || 'today'}`)],
  create_card: ['write', (i) => `Making a card ${quote(i.title)}`],
  add_note: ['write', () => 'Adding a note to the card'],
  create_task: ['write', (i) => `Adding the task ${quote(i.title)}`],
  complete_task: ['write', () => 'Checking off the task'],
  update_task_status: ['write', (i) => `Marking the task ${str(i.status).replace('_', ' ')}`],
  update_task: ['write', () => 'Editing the task'],
  move_card: ['write', (i) => `Moving ${quote(i.cardId)} to ${str(i.columnName)}`],
  archive_card: ['write', (i) => `Archiving ${quote(i.cardId)}`],
  unarchive_card: ['write', (i) => `Bringing back ${quote(i.cardId)}`],
  create_channel: ['write', (i) => `Setting up the channel ${quote(i.name)}`],
  update_channel: ['write', () => 'Updating the channel'],
  build_app: ['write', (i) => `Starting a build from ${quote(i.cardId)}`],
  kanwatch_set_priority: ['write', (i) => `Setting today to ${quote(i.priority)}`],
  kanwatch_build_app: ['write', (i) => `Building from what you read about ${quote(i.query)}`],
}

/** Voice mode reads these aloud or draws them on its own screen; the agent leaves them out. */
const VOICE_ONLY = new Set(['draft_email', 'generate_image'])

type ActionResponse = { result?: string; modelResult?: string; cardId?: string; channelId?: string; error?: string; costUsd?: number }

export async function callAction(action: string, args: Record<string, unknown>, ctx: ToolContext, scope = ctx.scope): Promise<ActionResponse> {
  // Voice actions take strings, except where a declaration says array.
  const flat: Record<string, string> = {}
  for (const [k, v] of Object.entries(args)) flat[k] = (Array.isArray(v) ? v.map(str) : str(v)) as string
  const res = await runVoiceAction(
    { id: ctx.userId, isAdmin: ctx.isAdmin, name: ctx.name, scope },
    { action, args: flat, sessionCardIds: ctx.sessionCardIds, recentTurns: ctx.recentTurns },
  )
  const data = (await res.json().catch(() => ({}))) as ActionResponse
  if (!res.ok) return { result: data.error || `That didn't work (${res.status}).`, error: data.error || String(res.status) }
  return data
}

/** The model passes ids; the trace should say which card or channel in words. */
async function titledLabel(running: string, input: Record<string, unknown>, cardId?: string): Promise<string | undefined> {
  const { db } = await import('@/lib/db')
  const { cards, channels } = await import('@/lib/db/schema')
  const { eq } = await import('drizzle-orm')
  let label = pastTense(running)
  let named = false
  const cardRef = str(input.cardId)
  if (cardRef) {
    const card = await db.query.cards.findFirst({ where: eq(cards.id, cardId || cardRef), columns: { title: true } })
    if (card) { label = label.replace(quote(cardRef), quote(card.title)); named = true }
  }
  const channelRef = str(input.channelId)
  if (channelRef && label.includes(channelRef)) {
    const channel = await db.query.channels.findFirst({ where: eq(channels.id, channelRef), columns: { name: true } })
    if (channel) { label = label.replace(channelRef, channel.name); named = true }
  }
  return named ? label : undefined
}

const cardHref = (channelId?: string, cardId?: string) => (channelId && cardId ? `/channel/${channelId}/card/${cardId}` : channelId ? `/channel/${channelId}` : undefined)

export function voiceTools(): AgentTool[] {
  const declarations = (VOICE_TOOLS[0] as unknown as { functionDeclarations: { name: string; description: string; parameters: GeminiSchema }[] }).functionDeclarations
  return declarations
    .filter((d) => !VOICE_ONLY.has(d.name))
    .map((d): AgentTool => {
      const [kind, running] = VOICE_LABELS[d.name] ?? ['write', () => d.name.replace(/_/g, ' ')]
      return {
        name: d.name,
        // Voice-specific phrasing ("read aloud") is harmless here; the rest of each
        // description is exactly the guidance a typed agent needs too.
        description: d.description,
        input_schema: { type: 'object', ...toJsonSchema(d.parameters) } as Anthropic.Tool.InputSchema,
        kind,
        running,
        async run(input, ctx) {
          const data = await callAction(d.name, input, ctx)
          const text = data.modelResult || data.result || 'Done.'
          return {
            content: text.slice(0, 24_000),
            label: await titledLabel(running(input), input, data.cardId),
            isError: Boolean(data.error),
            cardId: data.cardId,
            href: cardHref(data.channelId, data.cardId),
            costMillicents: typeof data.costUsd === 'number' ? Math.ceil(data.costUsd * 100_000) : undefined,
          }
        },
      }
    })
}

// --- Added for the agent -------------------------------------------------------

const nowTool: AgentTool = {
  name: 'whats_waiting',
  description: 'What needs the user right now: people who wrote in their apps, questions Claude Code is waiting on, what it finished, Studio sparks and nudges, and how much they saved this week. Use when they ask what\'s going on, what to do, or open with something vague like "morning".',
  input_schema: { type: 'object', properties: {} },
  kind: 'read',
  running: () => 'Checking what’s waiting on you',
  async run(_input, ctx) {
    const items = await gatherNow(ctx.userId, ctx.readable)
    return {
      content: items.length ? items.map((i) => `- ${i.title}: ${i.why}`).join('\n') : 'Nothing is waiting on them.',
      label: items.length ? `${items.length} thing${items.length === 1 ? '' : 's'} waiting on you` : 'Nothing waiting on you',
    }
  },
}

const suggestTool: AgentTool = {
  name: 'suggest',
  description: 'Offer up to three next steps as one-tap buttons under your reply. This is how you are proactive without acting early: anything useful the user did NOT ask for goes here, never straight into a write tool. Each label is a few words ("Test it this week"); each prompt is what the user would say to make it happen, written as them. Call it once, right before you write your final reply — never after it.',
  input_schema: {
    type: 'object',
    properties: {
      options: {
        type: 'array',
        maxItems: 3,
        items: {
          type: 'object',
          properties: {
            label: { type: 'string', description: 'The button, 2–5 words' },
            prompt: { type: 'string', description: 'What tapping it says to Kan, in the user\'s voice' },
          },
          required: ['label', 'prompt'],
        },
      },
    },
    required: ['options'],
  },
  kind: 'read',
  running: () => 'Lining up next steps',
  async run(input) {
    const options = (Array.isArray(input.options) ? input.options : [])
      .map((o) => ({ label: str((o as { label?: unknown }).label).slice(0, 40), prompt: str((o as { prompt?: unknown }).prompt).slice(0, 400) }))
      .filter((o) => o.label && o.prompt)
      .slice(0, 3)
    return { content: 'Shown to the user as buttons. Do not repeat them in your reply.', suggestions: options }
  },
}

export const claudeCodeTool: AgentTool = {
  name: 'hand_to_claude_code',
  description: 'Hand work to Claude Code by putting a card in the Work channel\'s "Do these" column, where Claude Code picks it up. Use this for anything bigger than the app playground can do well: a real multi-screen product, 3D, a game, a change to Kanthink itself, an integration, anything needing a server, a database or many files. (The /mow, /catlife, /print and /wildwood "super apps" were all built this way because the playground would have struggled.) Use build_app only for a single-screen tool or a quick prototype. Write the brief so Claude Code can start without asking: the goal, who it is for, what done looks like, and every requirement the user gave. Only when the user asks for it to be built or handed off.',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Short card title, imperative ("Build the door hanger editor")' },
      brief: { type: 'string', description: 'The full brief in markdown: ## Goal, ## Who it\'s for, ## Done means, ## Requirements, plus links' },
    },
    required: ['title', 'brief'],
  },
  kind: 'write',
  running: (i) => `Handing ${quote(i.title)} to Claude Code`,
  async run(input, ctx) {
    // A bot is scoped to its own channel; the hand-off is the one place it may write outside it.
    const data = await callAction('create_card', { channelId: WORK_CHANNEL_ID, columnName: 'Do these', title: input.title, content: input.brief, distinct: 'true' }, ctx, ctx.scope ? [WORK_CHANNEL_ID] : undefined)
    return {
      content: data.result || 'Card created in Work → Do these.',
      label: data.error ? undefined : `Handed ${quote(input.title)} to Claude Code`,
      isError: Boolean(data.error),
      cardId: data.cardId,
      href: cardHref(data.channelId, data.cardId),
    }
  },
}

export function studioTools(): AgentTool[] {
  const card = { cardId: { type: 'string', description: 'The Studio card id' } }
  return [
    {
      name: 'start_test_page',
      description: 'Put up a Reserve page for a Studio spark so strangers can say "I\'d pay for this" before anything is built — the cheapest test of whether an idea makes money. Moves the card to Testing. Only when the user says to test it.',
      input_schema: {
        type: 'object',
        properties: {
          ...card,
          headline: { type: 'string', description: 'Optional headline; Kan writes one if omitted' },
          pitch: { type: 'string' },
          priceLabel: { type: 'string', description: 'e.g. "$9 a month"' },
          bullets: { type: 'array', items: { type: 'string' } },
        },
        required: ['cardId'],
      },
      kind: 'write',
      running: () => 'Putting up the test page',
      async run(input, ctx) {
        const { startTestPage } = await import('@/lib/studio/pipeline')
        const r = await startTestPage({
          userId: ctx.userId,
          cardId: str(input.cardId),
          headline: input.headline ? str(input.headline) : undefined,
          pitch: input.pitch ? str(input.pitch) : undefined,
          priceLabel: input.priceLabel ? str(input.priceLabel) : undefined,
          bullets: Array.isArray(input.bullets) ? input.bullets.map(str) : undefined,
        })
        return { content: `Test page is up at ${r.url} with headline "${r.page.headline}". The card moved to Testing.`, label: 'Test page is up', href: r.url }
      },
    },
    {
      name: 'drop_spark',
      description: 'Drop a Studio idea the user has decided against, with their reason so future sparks learn from it. Only when they say to drop it.',
      input_schema: { type: 'object', properties: { ...card, reason: { type: 'string' } }, required: ['cardId'] },
      kind: 'write',
      running: () => 'Dropping the idea',
      async run(input, ctx) {
        const { dropSpark } = await import('@/lib/studio/pipeline')
        const r = await dropSpark(ctx.userId, str(input.cardId), input.reason ? str(input.reason) : undefined)
        return { content: `Dropped ${r.title}.`, label: `Dropped ${quote(r.title)}` }
      },
    },
    {
      name: 'ship_app',
      description: 'Ship a built Studio app: publish it, open checkout at the price, and email the people who reserved it. Only when the user says to ship.',
      input_schema: { type: 'object', properties: { ...card, priceLabel: { type: 'string' } }, required: ['cardId'] },
      kind: 'write',
      running: () => 'Shipping it',
      async run(input, ctx) {
        const { shipApp } = await import('@/lib/studio/pipeline')
        const r = await shipApp(ctx.userId, str(input.cardId), input.priceLabel ? str(input.priceLabel) : undefined)
        return { content: `Live at ${r.url}${r.priced ? ` with checkout at ${r.priceLabel}` : ''}. The launch email to reservers is waiting in People.`, label: 'Shipped', href: r.url }
      },
    },
  ]
}

/** Builds the user's bots asked to make: read them, and decide when the user says. */
export const approvalTools: AgentTool[] = [
  {
    name: 'bot_build_requests',
    description: 'Builds the user’s channel bots have asked them to approve: what each app is, why the bot wants it, the model, and the estimated cost (likely and at most). Use when they ask what their bots want, or before deciding one.',
    input_schema: { type: 'object', properties: {} },
    kind: 'read',
    running: () => 'Checking what your bots want to build',
    async run(_input, ctx) {
      const { pendingApprovals } = await import('@/lib/kan/bots/approvals')
      const rows = (await pendingApprovals(ctx.userId)).filter((r) => r.status === 'pending')
      if (!rows.length) return { content: 'No builds are waiting on them.', label: 'Nothing waiting' }
      const lines = rows.map((r) => `- [${r.id}] "${r.title}" (channelId:${r.channelId}) with ${r.modelId}: about $${((r.likelyMillicents ?? 0) / 100_000).toFixed(2)}, at most $${((r.maxMillicents ?? 0) / 100_000).toFixed(2)}. Why: ${r.purpose ?? '(none given)'}`)
      return { content: lines.join('\n'), label: `${rows.length} build${rows.length === 1 ? '' : 's'} waiting on you` }
    },
  },
  {
    name: 'decide_bot_build',
    description: 'Approve or reject a build a bot asked for. Only on the user’s clear word ("build it", "no, because…"). On a reject, pass their reason in their words; the bot learns from it. Approving starts the build at once and charges it to that bot.',
    input_schema: {
      type: 'object',
      properties: {
        requestId: { type: 'string', description: 'The id from bot_build_requests' },
        approve: { type: 'boolean' },
        reason: { type: 'string', description: 'Why not, when rejecting' },
        modelId: { type: 'string', description: 'A different model, if the user asked for one' },
      },
      required: ['requestId', 'approve'],
    },
    kind: 'write',
    running: (i) => (i.approve ? 'Approving the build' : 'Passing on the build'),
    async run(input, ctx) {
      const { decideApproval, runApprovedBuild } = await import('@/lib/kan/bots/approvals')
      const r = await decideApproval(str(input.requestId), ctx.userId, {
        approve: Boolean(input.approve), reason: input.reason ? str(input.reason) : undefined, modelId: input.modelId ? str(input.modelId) : undefined,
      })
      if ('error' in r) return { content: String(r.error), isError: true }
      if (r.row.status === 'approved') {
        const { afterResponse } = await import('@/lib/afterResponse')
        afterResponse(() => runApprovedBuild(r.row.id))
        return { content: `Approved. "${r.row.title}" is building now with ${r.row.modelId} (about $${((r.row.likelyMillicents ?? 0) / 100_000).toFixed(2)}); it lands on the card's Apps tab in a minute or two.`, label: `Approved “${r.row.title}”` }
      }
      return { content: `Passed on "${r.row.title}". The bot will read the reason next run.`, label: `Passed on “${r.row.title}”` }
    },
  },
]

export function agentTools(ctx: Pick<ToolContext, 'readable' | 'isAdmin'>): AgentTool[] {
  const tools = [nowTool, ...voiceTools(), ...studioTools(), ...approvalTools, suggestTool]
  if (ctx.readable.includes(WORK_CHANNEL_ID)) tools.splice(1, 0, claudeCodeTool)
  return ctx.isAdmin ? tools : tools.filter((t) => t.name !== 'query_mixpanel')
}

/** Claude's own web search, run on Anthropic's side. Shows in the trace like any tool. */
export const WEB_SEARCH_TOOL = { type: 'web_search_20250305', name: 'web_search', max_uses: 5 } as const
