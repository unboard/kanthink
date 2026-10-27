import { getPlaygroundModel, PLAYGROUND_MODELS, type PlaygroundModel, type PlaygroundProvider } from './models'

/**
 * What an app build will cost, before it runs.
 *
 * Two numbers, because one would lie. "Likely" is what a build like this usually
 * costs; "at most" is the worst case the builder's own ceilings allow, so a person
 * approving a build knows the bill can't pass it. Both are USD.
 *
 * Calibrated against real builds (October 2026): a first build on Gemini 3.1 Pro
 * read ~10k tokens and wrote ~3.6k of code (≈ $0.06, before its thinking, which went
 * unrecorded until then); a rewrite on GPT-5.6 Sol read ~25k and wrote ~7.4k (≈ $0.25),
 * worst ~21k (≈ $0.53); a first build on GPT-6 Astra wrote 14.3k (≈ $0.78), because
 * it writes apps three times as long. The builder's system prompt, runtime, style and
 * payment sections are ~9k tokens on every call.
 */

const BASE_INPUT_TOKENS = 9_000
const CHARS_PER_TOKEN = 3.5
/** A first build's code, in tokens, when there's nothing to measure yet. Models differ a lot. */
const FIRST_BUILD_CODE_TOKENS: Record<string, number> = { 'gpt-6-astra': 10_000, 'gpt-5.6-sol': 6_000 }
const firstBuildCode = (m: PlaygroundModel) => FIRST_BUILD_CODE_TOKENS[m.id] ?? (m.provider === 'google' ? 3_500 : 6_000)
/** The builder's output ceilings (generateApp.ts): a patch attempt, and a whole-file rewrite. */
const PATCH_CEILING = 8_000
const REWRITE_CEILING = { anthropic: 64_000, other: 32_000 }

/** Reasoning a model tends to spend on a build, on top of the code it writes. */
function reasoningTokens(m: PlaygroundModel): number {
  if (m.provider === 'google') return Math.round(m.thinkingBudget * 0.3)
  return m.reasoningEffort === 'high' ? 4_000 : m.reasoningEffort === 'medium' ? 1_500 : 500
}

export interface BuildEstimate {
  modelId: string
  modelLabel: string
  likelyUsd: number
  maxUsd: number
}

export function estimateBuildCost(opts: {
  modelId: string
  /** The brief: card thread, tasks, extra direction. */
  briefChars: number
  /** The app's current code, when this is a rebuild. */
  existingCodeChars?: number
}): BuildEstimate {
  const m = getPlaygroundModel(opts.modelId)
  const code = opts.existingCodeChars ?? 0
  const input = BASE_INPUT_TOKENS + (opts.briefChars + code) / CHARS_PER_TOKEN
  const out = (code ? code / CHARS_PER_TOKEN : firstBuildCode(m)) + reasoningTokens(m)
  const price = (i: number, o: number) => (i * m.pricing.input + o * m.pricing.output) / 1_000_000

  const ceiling = m.provider === 'anthropic' ? REWRITE_CEILING.anthropic : REWRITE_CEILING.other
  // Worst case: a rebuild can try a patch, fall back to a rewrite, and retry the
  // rewrite once if it dropped a feature, each call writing up to its ceiling.
  const worst = code
    ? price(input, PATCH_CEILING) + 2 * price(input, ceiling)
    : price(input, ceiling)

  return {
    modelId: m.id,
    modelLabel: m.label,
    likelyUsd: round(price(input, out)),
    maxUsd: round(worst),
  }
}

const round = (usd: number) => Math.ceil(usd * 100) / 100

/**
 * The models worth offering Kan and bots, best value first. The picker has more;
 * these are the ones with a clear reason to choose them.
 */
const MENU: { id: string; when: string }[] = [
  { id: 'gemini-3.1-pro-preview', when: 'the default for a new app or a real change; cheap and strong' },
  { id: 'gemini-3.8-flash', when: 'small visual tweaks and quick prototypes; fastest and cheapest' },
  { id: 'gpt-5.6-terra', when: 'balanced OpenAI choice' },
  { id: 'gpt-5.6-sol', when: 'complex multi-part apps that need careful reasoning' },
  { id: 'gpt-6-astra', when: 'only when the app is hard and quality matters more than cost' },
  { id: 'claude-opus-5-5', when: 'complex apps, strong design sense' },
  { id: 'claude-sonnet-5', when: 'balanced Claude choice' },
]

/** The menu, limited to providers the account can actually call. */
export function buildModelMenu(providers: PlaygroundProvider[]) {
  return MENU
    .map((e) => ({ ...e, model: PLAYGROUND_MODELS.find((m) => m.id === e.id) }))
    .filter((e): e is typeof e & { model: PlaygroundModel } => Boolean(e.model) && providers.includes(e.model!.provider))
    .map((e) => {
      const first = estimateBuildCost({ modelId: e.id, briefChars: 4_000 })
      return { id: e.id, label: e.model.label, when: e.when, firstBuildUsd: first.likelyUsd, maxUsd: first.maxUsd }
    })
}

/** The menu as a few lines a model can read. */
export function describeModelMenu(providers: PlaygroundProvider[]): string {
  const menu = buildModelMenu(providers)
  if (!menu.length) return 'No build models are available: the account has no AI key.'
  return menu.map((m) => `- ${m.id} (${m.label}): ${m.when}. A new app ≈ $${m.firstBuildUsd.toFixed(2)}, at most $${m.maxUsd.toFixed(2)}.`).join('\n')
}
