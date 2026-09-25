/**
 * One real call per Claude path, to run once a key exists:
 *
 *   ANTHROPIC_API_KEY=sk-ant-... npx tsx scripts/smoke-claude.ts [model]
 *
 * Checks Kan's chat provider and the app builder's structured call (with the
 * builder's own schema shape) end to end. Costs a few cents on the default model.
 */
import { createAnthropicProvider } from '../lib/ai/providers/anthropic'
import { runStructured } from '../lib/playground/generateClient'
import { getPlaygroundModel } from '../lib/playground/models'

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('Set ANTHROPIC_API_KEY')
  const modelId = process.argv[2] || 'claude-sonnet-5'

  const chat = await createAnthropicProvider(apiKey, modelId).complete([
    { role: 'system', content: 'Answer in five words or fewer.' },
    { role: 'user', content: 'Name a colour.' },
  ], { maxTokens: 2000 })
  console.log('chat:', JSON.stringify(chat.content), chat.usage)

  const build = await runStructured({
    model: getPlaygroundModel(modelId),
    apiKey,
    systemInstruction: 'You write tiny React apps.',
    userText: 'A button that counts clicks.',
    images: [],
    schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        code: { type: 'string' },
        dependencies: { type: 'array', items: { type: 'string' } },
        notes: { type: 'string' },
      },
      required: ['title', 'code', 'dependencies'],
    },
    schemaName: 'smoke',
    maxOutputTokens: 16000,
    signal: AbortSignal.timeout(5 * 60 * 1000),
  })
  const parsed = JSON.parse(build.text ?? 'null')
  console.log('build:', parsed?.title, `${parsed?.code?.length ?? 0} chars`, { truncated: build.truncated, in: build.inputTokens, out: build.outputTokens })
}

main().catch((err) => { console.error(err); process.exit(1) })
