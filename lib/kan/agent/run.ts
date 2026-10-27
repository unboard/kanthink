import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { fallbackParams } from '@/lib/ai/anthropic'
import { pastTense, type AgentEvent } from './events'
import { WEB_SEARCH_TOOL, type AgentTool, type ToolContext } from './tools'

/**
 * The Kan agent's loop: ask Claude, run the tools it calls, hand back the results,
 * repeat until it answers. Every step is sent as an event the moment it starts and
 * again when it ends, so the trace is live rather than a log read afterwards.
 *
 * Kept apart from the route so a script can drive it against real data.
 */

export const AGENT_MODEL = 'claude-opus-5-5'
export const OPENAI_AGENT_MODEL = 'gpt-5.6-sol'
const MAX_ROUNDS = 12

export interface RunOptions {
  provider: 'anthropic' | 'openai'
  apiKey: string
  system: string
  history: { role: 'user' | 'assistant'; content: string }[]
  tools: AgentTool[]
  ctx: ToolContext
  send: (e: AgentEvent) => void
  signal?: AbortSignal
  model?: string
  /** Asked between rounds with the tokens spent so far; true stops the loop (a bot's budget). */
  shouldStop?: (usage: Usage) => boolean
  /** Told the running total after every model call, so tools can see what the run has spent. */
  onUsage?: (usage: Usage) => void
  /** Rounds of tool calls before the loop gives up. A bot doing a whole run needs more than a chat turn. */
  maxRounds?: number
}

export interface Usage {
  /** Every input token, cached or not. */
  inputTokens: number
  outputTokens: number
  /** The part of inputTokens read back from the provider's prompt cache, billed at a fraction. */
  cachedInputTokens?: number
  /** Anthropic only: input written to the cache this turn, billed at a premium. */
  cacheWriteTokens?: number
}

export interface RunResult {
  did: string[]
  madeCards: string[]
  usage: Usage
  model: string
  /** The reply text, as the model wrote it. */
  text: string
  /** True when shouldStop ended the loop early. */
  stopped: boolean
}

type RunTool = (id: string, name: string, input: Record<string, unknown>) => Promise<{ content: string; isError?: boolean }>

/** What each provider loop fills in as it goes. */
interface Tally {
  usage: Usage
  text: string
  stopped: boolean
}

/** Claude when there's an Anthropic key, otherwise OpenAI. The tools and the trace are the same either way. */
export async function runAgent(opts: RunOptions): Promise<RunResult> {
  const { tools, ctx } = opts
  const byName = new Map(tools.map((t) => [t.name, t]))
  const did: string[] = []
  const madeCards: string[] = []
  const tally: Tally = { usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, cacheWriteTokens: 0 }, text: '', stopped: false }
  const send = (e: AgentEvent) => {
    if (e.t === 'text') tally.text += e.delta
    opts.send(e)
  }

  // One tool call, start to finish: the running line, the work, the done line.
  const runTool: RunTool = async (id, name, input) => {
    const tool = byName.get(name)
    if (!tool) return { content: `No tool called ${name}.`, isError: true }
    const label = tool.running(input)
    const quiet = tool.name === 'suggest'
    if (!quiet) send({ t: 'step', id, label, status: 'running' })
    try {
      const out = await tool.run(input, ctx)
      if (out.suggestions?.length) send({ t: 'suggest', options: out.suggestions })
      if (out.cardId && tool.kind === 'write') madeCards.push(out.cardId)
      const doneLabel = out.label ?? pastTense(label)
      if (!quiet) {
        send({ t: 'step', id, label: doneLabel, status: out.isError ? 'error' : 'done', href: out.href, write: tool.kind === 'write' })
        did.push(`${doneLabel}${out.cardId ? ` (cardId:${out.cardId})` : ''}: ${out.content.slice(0, 300).replace(/\s+/g, ' ')}`)
      }
      return { content: out.content, isError: out.isError }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong'
      if (!quiet) send({ t: 'step', id, label: `${label} — failed`, status: 'error', detail: message.slice(0, 80) })
      return { content: `Failed: ${message}`, isError: true }
    }
  }

  const model = opts.model ?? (opts.provider === 'openai' ? OPENAI_AGENT_MODEL : AGENT_MODEL)
  const run = { ...opts, send, model }
  if (opts.provider === 'openai') await runOpenAI(run, runTool, did, tally)
  else await runClaude(run, runTool, did, tally)
  return { did, madeCards, usage: tally.usage, model, text: tally.text, stopped: tally.stopped }
}

async function runClaude(opts: RunOptions, runTool: RunTool, did: string[], tally: Tally) {
  const { tools, send } = opts
  const model = opts.model ?? AGENT_MODEL
  const client = new Anthropic({ apiKey: opts.apiKey })
  const messages: Anthropic.Beta.BetaMessageParam[] = opts.history.map((m) => ({ role: m.role, content: m.content }))

  for (let round = 0; round < (opts.maxRounds ?? MAX_ROUNDS); round++) {
    if (round > 0 && opts.shouldStop?.(tally.usage)) { tally.stopped = true; break }
    if (round > 0) send({ t: 'break' })
    const live = client.beta.messages.stream(
      {
        model,
        max_tokens: 16000,
        system: opts.system,
        messages,
        tools: [
          ...tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema })),
          WEB_SEARCH_TOOL,
        ] as Anthropic.Beta.BetaToolUnion[],
        ...fallbackParams(model),
      },
      { signal: opts.signal },
    )

    // Per content block: what kind it is, when it started, and the JSON it's building.
    const blocks = new Map<number, { type: string; id: string; started: number; json: string }>()
    const queries = new Map<string, string>()
    for await (const ev of live) {
      if (ev.type === 'content_block_start') {
        const b = ev.content_block
        const id = 'id' in b && typeof b.id === 'string' ? b.id : `r${round}b${ev.index}`
        blocks.set(ev.index, { type: b.type, id, started: Date.now(), json: '' })
        if (b.type === 'thinking') send({ t: 'step', id, label: 'Thinking', status: 'running', kind: 'thinking' })
        if (b.type === 'server_tool_use') send({ t: 'step', id, label: 'Searching the web', status: 'running' })
        if (b.type === 'web_search_tool_result') {
          const results = Array.isArray(b.content) ? b.content : []
          const sources = results
            .filter((r): r is Anthropic.Beta.BetaWebSearchResultBlock => (r as { type?: string }).type === 'web_search_result')
            .slice(0, 6)
            .map((r) => ({ title: r.title, url: r.url }))
          const q = queries.get(b.tool_use_id)
          send({ t: 'step', id: b.tool_use_id, label: q ? `Searched the web for “${q}”` : 'Searched the web', status: 'done', detail: `${sources.length} results`, sources })
        }
      } else if (ev.type === 'content_block_delta') {
        const d = ev.delta
        const block = blocks.get(ev.index)
        if (d.type === 'text_delta') send({ t: 'text', delta: d.text })
        else if (d.type === 'thinking_delta' && block) send({ t: 'thinking', id: block.id, delta: d.thinking })
        else if (d.type === 'input_json_delta' && block) block.json += d.partial_json
      } else if (ev.type === 'content_block_stop') {
        const block = blocks.get(ev.index)
        if (block?.type === 'thinking') {
          const s = Math.max(1, Math.round((Date.now() - block.started) / 1000))
          send({ t: 'step', id: block.id, label: `Thought for ${s}s`, status: 'done' })
        }
        if (block?.type === 'server_tool_use') {
          let q = ''
          try { q = String(JSON.parse(block.json || '{}').query || '') } catch { /* partial */ }
          if (q) {
            queries.set(block.id, q)
            send({ t: 'step', id: block.id, label: `Searching the web for “${q}”`, status: 'running' })
            did.push(`Searched the web for "${q}"`)
          }
        }
      }
    }

    const final = await live.finalMessage()
    tally.usage.inputTokens += final.usage.input_tokens + (final.usage.cache_read_input_tokens ?? 0) + (final.usage.cache_creation_input_tokens ?? 0)
    tally.usage.outputTokens += final.usage.output_tokens
    tally.usage.cachedInputTokens = (tally.usage.cachedInputTokens ?? 0) + (final.usage.cache_read_input_tokens ?? 0)
    tally.usage.cacheWriteTokens = (tally.usage.cacheWriteTokens ?? 0) + (final.usage.cache_creation_input_tokens ?? 0)
    opts.onUsage?.(tally.usage)
    messages.push({ role: 'assistant', content: final.content as Anthropic.Beta.BetaContentBlockParam[] })
    if (final.stop_reason === 'pause_turn') continue
    if (final.stop_reason !== 'tool_use') break

    const results: Anthropic.Beta.BetaToolResultBlockParam[] = []
    for (const block of final.content) {
      if (block.type !== 'tool_use') continue
      const r = await runTool(block.id, block.name, (block.input ?? {}) as Record<string, unknown>)
      results.push({ type: 'tool_result', tool_use_id: block.id, content: r.content, is_error: r.isError || undefined })
    }
    messages.push({ role: 'user', content: results })
  }
}

/**
 * The same loop on OpenAI's Responses API, for accounts without an Anthropic key —
 * which today includes Kanthink's own owner keys. Reasoning summaries stand in for
 * thinking, and OpenAI's web search for Claude's.
 */
async function runOpenAI(opts: RunOptions, runTool: RunTool, did: string[], tally: Tally) {
  const { tools, send } = opts
  const model = opts.model ?? OPENAI_AGENT_MODEL
  const client = new OpenAI({ apiKey: opts.apiKey })
  const input: OpenAI.Responses.ResponseInputItem[] = opts.history.map((m) => ({ role: m.role, content: m.content }))
  const functions: OpenAI.Responses.Tool[] = [
    ...tools.map((t): OpenAI.Responses.FunctionTool => ({
      type: 'function', name: t.name, description: t.description, parameters: t.input_schema as Record<string, unknown>, strict: false,
    })),
    { type: 'web_search' },
  ]

  for (let round = 0; round < (opts.maxRounds ?? MAX_ROUNDS); round++) {
    if (round > 0 && opts.shouldStop?.(tally.usage)) { tally.stopped = true; break }
    if (round > 0) send({ t: 'break' })
    const stream = await client.responses.create(
      {
        model,
        instructions: opts.system,
        input,
        tools: functions,
        reasoning: { effort: 'medium', summary: 'auto' },
        // Nothing kept on OpenAI's side; the reasoning travels back encrypted instead.
        store: false,
        include: ['reasoning.encrypted_content'],
        stream: true,
      },
      { signal: opts.signal },
    )

    const started = new Map<string, number>()
    let final: OpenAI.Responses.Response | null = null
    for await (const ev of stream) {
      if (ev.type === 'response.output_item.added') {
        const item = ev.item
        if (!item.id) continue
        started.set(item.id, Date.now())
        if (item.type === 'reasoning') send({ t: 'step', id: item.id, label: 'Thinking', status: 'running', kind: 'thinking' })
        if (item.type === 'web_search_call') send({ t: 'step', id: item.id, label: 'Searching the web', status: 'running' })
      } else if (ev.type === 'response.reasoning_summary_text.delta') {
        send({ t: 'thinking', id: ev.item_id, delta: ev.delta })
      } else if (ev.type === 'response.reasoning_summary_part.done') {
        send({ t: 'thinking', id: ev.item_id, delta: '\n\n' })
      } else if (ev.type === 'response.output_text.delta') {
        send({ t: 'text', delta: ev.delta })
      } else if (ev.type === 'response.output_item.done') {
        const item = ev.item
        if (!item.id) continue
        if (item.type === 'reasoning') {
          const s = Math.max(1, Math.round((Date.now() - (started.get(item.id) ?? Date.now())) / 1000))
          send({ t: 'step', id: item.id, label: `Thought for ${s}s`, status: 'done' })
        }
        if (item.type === 'web_search_call') {
          const action = (item as { action?: { query?: string; type?: string; url?: string } }).action
          const q = action?.query
          let host = ''
          try { host = action?.url ? new URL(action.url).hostname.replace(/^www\./, '') : '' } catch { /* not a url */ }
          const label = q ? `Searched the web for “${q}”` : host ? `Read ${host}` : 'Looked through a page'
          send({ t: 'step', id: item.id, label, status: 'done', href: action?.url })
          if (q) did.push(`Searched the web for "${q}"`)
        }
      } else if (ev.type === 'response.completed') {
        final = ev.response
      } else if (ev.type === 'response.failed' || ev.type === 'error') {
        const message = ev.type === 'error' ? ev.message : ev.response.error?.message
        throw new Error(message || 'OpenAI could not finish that')
      }
    }
    if (!final) break
    tally.usage.inputTokens += final.usage?.input_tokens ?? 0
    tally.usage.outputTokens += final.usage?.output_tokens ?? 0
    tally.usage.cachedInputTokens = (tally.usage.cachedInputTokens ?? 0) + (final.usage?.input_tokens_details?.cached_tokens ?? 0)
    opts.onUsage?.(tally.usage)

    input.push(...(final.output as OpenAI.Responses.ResponseInputItem[]))
    const calls = final.output.filter((o): o is OpenAI.Responses.ResponseFunctionToolCall => o.type === 'function_call')
    if (!calls.length) break
    for (const call of calls) {
      let args: Record<string, unknown> = {}
      try { args = JSON.parse(call.arguments || '{}') } catch { /* leave empty */ }
      const r = await runTool(call.call_id, call.name, args)
      input.push({ type: 'function_call_output', call_id: call.call_id, output: r.content })
    }
  }
}
