/**
 * Gemini Decision: questions answered with numbers, not words.
 *
 * gemini-decision-1 reads one shared input (text here; it also takes images, audio,
 * video and PDFs) and answers up to 1,000 questions about it in one pass: a calibrated
 * yes/no probability (noul), a pick among options (choice), or a rubric score (score).
 * It writes no text, so it's fast (about a second) and costs about $0.10 per million
 * input tokens with no output charge. Kan uses it to rank and route, never to write.
 *
 * Called over REST: the installed @google/genai predates ai.decisions.create, and the
 * request is small. Questions can't see each other's answers, so ask each one whole.
 */

export const DECISION_MODEL = 'gemini-decision-1'
/** $ per million input tokens. */
export const DECISION_PRICE_PER_M = 0.1

export type DecisionQuestion =
  | { type: 'noul'; instructions: string; criteria?: { true_description?: string; false_description?: string } }
  | { type: 'choice'; instructions: string; criteria: Record<string, string> }
  | { type: 'score'; instructions: string; criteria: string[] }

export type DecisionAnswer =
  | { type: 'noul'; noul: number; confidence: number }
  | { type: 'choice'; choice: string; probabilities: Record<string, number>; confidence: number }
  | { type: 'score'; score: number; probabilities: Record<string, number>; confidence: number }

export interface DecisionResult {
  answers: Record<string, DecisionAnswer>
  inputTokens: number
  /** Whole cents, rounded up, so spend is never under-counted. */
  costCents: number
}

export async function decide(opts: {
  apiKey: string
  input: string
  questions: Record<string, DecisionQuestion>
  signal?: AbortSignal
}): Promise<DecisionResult> {
  const keys = Object.keys(opts.questions)
  if (!keys.length) return { answers: {}, inputTokens: 0, costCents: 0 }
  if (keys.length > 1000) throw new Error('Gemini Decision takes at most 1,000 questions a call')
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/decisions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': opts.apiKey },
    body: JSON.stringify({ model: `models/${DECISION_MODEL}`, input: opts.input, questions: opts.questions }),
    signal: opts.signal ?? AbortSignal.timeout(30_000),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Gemini Decision ${res.status}: ${body.slice(0, 300)}`)
  }
  const json = (await res.json()) as { answers?: Record<string, DecisionAnswer>; usage?: { total_input_tokens?: number } }
  const inputTokens = json.usage?.total_input_tokens ?? 0
  return {
    answers: json.answers ?? {},
    inputTokens,
    costCents: Math.ceil((inputTokens / 1e6) * DECISION_PRICE_PER_M * 100),
  }
}

/** P(true) for a noul answer, or the fallback when it's missing. */
export function yes(a: DecisionAnswer | undefined, fallback = 0): number {
  return a?.type === 'noul' ? a.noul : fallback
}
/** The expected level of a score answer, or the fallback. */
export function scoreOf(a: DecisionAnswer | undefined, fallback = 0): number {
  return a?.type === 'score' ? a.score : fallback
}
/** The winning option of a choice answer, or the fallback. */
export function choiceOf<T extends string>(a: DecisionAnswer | undefined, fallback: T): T {
  return a?.type === 'choice' ? (a.choice as T) : fallback
}
