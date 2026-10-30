import { auth } from '@/lib/auth'
import { resolveProviderKeys } from '@/lib/ai/keys'
import { recordUsage } from '@/lib/usage'
import { loadAccess } from '@/lib/voice/resolveReference'
import { buildAgentPrompt } from '@/lib/kan/agent/prompt'
import { agentTools, type ToolContext } from '@/lib/kan/agent/tools'
import { runAgent } from '@/lib/kan/agent/run'
import type { AgentEvent } from '@/lib/kan/agent/events'
import { cityPrompt, cityTools } from '@/lib/kan/city/tools'

/**
 * The Kan agent, streamed as newline-delimited JSON events (lib/kan/agent/events.ts):
 * trace steps as they start and finish, reply text as it's written, suggestions,
 * and a closing memo of what this turn did. The client sends the memo back with the
 * next turn, so Kan remembers its own actions without the server keeping a thread.
 *
 * Prototype — /prototypes/kan and Kan City are the callers. From the city, Kan also
 * gets the tools to run the town and knows which plot the user is looking at.
 */

export const runtime = 'nodejs'
export const maxDuration = 300

interface AgentRequest {
  messages: { role: 'user' | 'assistant'; content: string }[]
  sessionCardIds?: string[]
  timeZone?: string
  city?: { focus?: { channelId?: string; name?: string; kind?: string } | null }
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  const body = (await request.json()) as AgentRequest
  const history = (body.messages || []).filter((m) => m.content?.trim()).slice(-30)
  if (history.at(-1)?.role !== 'user') return Response.json({ error: 'Say something first' }, { status: 400 })

  const { keys, error: keyError, quotaMessage } = await resolveProviderKeys(userId)
  // Claude first; OpenAI when that's all the account can reach.
  const provider = keys.anthropic ? ('anthropic' as const) : keys.openai ? ('openai' as const) : null
  const key = provider ? keys[provider] : undefined
  if (!provider || !key) {
    return Response.json({ error: quotaMessage || keyError || 'Kan needs an Anthropic or OpenAI key for this. Add one in Settings → AI.' }, { status: 400 })
  }

  const access = await loadAccess(userId)
  const ctx: ToolContext = {
    userId,
    isAdmin: Boolean(session.user.isAdmin),
    name: session.user.name,
    readable: access.readable,
    sessionCardIds: (body.sessionCardIds || []).slice(-10),
    recentTurns: history.slice(-6).map((m) => ({ role: m.role === 'user' ? 'user' : 'kan', text: m.content.slice(0, 600) })),
  }
  const system = await buildAgentPrompt({ userId, name: session.user.name, readable: access.readable, timeZone: body.timeZone })
    + (body.city ? cityPrompt(body.city) : '')
  const tools = agentTools(ctx)
  // The city's own tools go before `suggest`, which is always last.
  if (body.city) tools.splice(tools.length - 1, 0, ...cityTools)
  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: AgentEvent) => {
        try { controller.enqueue(encoder.encode(JSON.stringify(e) + '\n')) } catch { /* client went away */ }
      }
      try {
        const { did, madeCards } = await runAgent({ provider, apiKey: key.apiKey, system, history, tools, ctx, send, signal: request.signal })
        if (key.source !== 'byok') await recordUsage(userId, 'kan-agent').catch(() => {})
        send({ t: 'done', memo: did.length ? did.join('\n') : undefined, cardIds: madeCards })
      } catch (err) {
        if (!request.signal.aborted) {
          const message = err instanceof Error ? err.message : 'Something went wrong'
          console.error('[kan-agent]', message)
          send({ t: 'error', message })
        }
      } finally {
        try { controller.close() } catch { /* already closed */ }
      }
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' },
  })
}
