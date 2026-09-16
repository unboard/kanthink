import { runStructured } from '@/lib/playground/generateClient'
import type { PlaygroundModel } from '@/lib/playground/models'

/**
 * Give an app that predates the contract its contract, from the thread it already has.
 *
 * Apps built from here on accumulate requirements a turn at a time. Every app that
 * already exists has its requirements scattered through a conversation instead — and
 * that conversation is exactly what the builder cannot see all of, which was the
 * problem in the first place. Left alone, those apps would start from an empty
 * contract and quietly keep losing the things their owner asked for early on.
 *
 * So the first build after this ships reads the whole thread once and writes the
 * contract down. Once. It is a cheap call against a small model, it happens before
 * the build rather than instead of it, and if it fails the build carries on with no
 * contract — the same position as before, never worse.
 */

const SCHEMA = {
  type: 'object',
  properties: {
    requirements: {
      type: 'string',
      description:
        'Terse bullet list — one line each — of everything this app must do, read out of the whole conversation. Include anything the user asked for and never withdrew, especially things they had to repeat. Write what the app MUST DO, not how it looks and not what was built. Omit requests the user explicitly retracted. No preamble, no headings, just the lines.',
    },
  },
  required: ['requirements'],
}

const SYSTEM = `You are reading the full history of one app being built, to recover the requirements its owner has accumulated.

Write down what the app MUST DO. A user repeating themselves is the strongest possible signal that a requirement was never satisfied — those lines matter most, and they belong in the list even if a later message claims they were handled. Include anything asked for and not withdrawn. Leave out design and styling unless the user was specific about it, leave out anything they explicitly cancelled, and leave out the model's own claims about what it built.

Be terse. One requirement per line, starting with "- ". No preamble.`

export interface ThreadTurn {
  type?: string
  content?: string
}

/**
 * Read a thread and return the contract it implies, or null if there is nothing to
 * read or the call does not work out.
 */
export async function backfillRequirements(input: {
  messages: ThreadTurn[]
  appTitle: string
  cardTitle?: string | null
  model: PlaygroundModel
  apiKey: string
  signal: AbortSignal
}): Promise<string | null> {
  const { messages, appTitle, cardTitle, model, apiKey, signal } = input

  // Only the human side. The model's own summaries of what it built are the least
  // reliable evidence in the thread — several of them are why the contract is
  // needed at all.
  const said = messages
    .filter((m) => m.type === 'question' || m.type === 'user' || m.type === 'note')
    .map((m) => (m.content ?? '').trim())
    .filter((c) => c.length > 0)

  if (said.length === 0) return null

  try {
    const response = await runStructured({
      model,
      apiKey,
      systemInstruction: SYSTEM,
      userText: [
        `APP: ${appTitle}${cardTitle ? ` (from the card "${cardTitle}")` : ''}`,
        '',
        'WHAT THE OWNER HAS ASKED FOR, in order:',
        ...said.map((c, i) => `[${i + 1}] ${c.slice(0, 2000)}`),
      ].join('\n'),
      schema: SCHEMA,
      images: [],
      schemaName: 'recovered_requirements',
      maxOutputTokens: 2000,
      signal,
    })

    if (response.truncated) return null
    const parsed = JSON.parse(response.text || '') as { requirements?: string }
    const text = parsed.requirements?.trim()
    return text && text.length > 0 ? text : null
  } catch (error) {
    // A recovered contract is an improvement, not a precondition. Failing to get one
    // must never stop the build the user actually asked for.
    console.warn('[playground] could not recover requirements from thread:', error)
    return null
  }
}
