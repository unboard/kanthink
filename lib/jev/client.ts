/**
 * Jev — TypeSafe's decision model. It never writes text: it looks at a state and
 * answers typed questions (Choice / Score / Noul) with calibrated probabilities.
 *
 * Plain fetch rather than the SDK, to keep dependencies down; the wire format is
 * small and documented at https://docs.typesafe.ai/api.
 *
 * Every call here is an optimisation layered over a path that already works, so
 * failure is quiet: a timeout, a 429 or a missing key returns null and the caller
 * falls back to what it did before Jev existed.
 */

const ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
const MODEL = 'jev-latest';
// Voice is waiting on this. TypeSafe quotes 70–500 ms; past this, the old path wins.
const DEFAULT_TIMEOUT_MS = 2500;

type Entry = string | Record<string, unknown> | unknown[];

export interface ChoiceQuestion {
  type: 'choice';
  instructions: Entry;
  criteria: Record<string, Entry | null>;
}

export interface ScoreQuestion {
  type: 'score';
  instructions: Entry;
  criteria: Entry[];
}

export interface NoulQuestion {
  type: 'noul';
  instructions: Entry;
  criteria?: { true?: Entry; false?: Entry };
}

export type JevQuestion = ChoiceQuestion | ScoreQuestion | NoulQuestion;

export interface ChoiceAnswer {
  type: 'choice';
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
}

export interface ScoreAnswer {
  type: 'score';
  score: number;
  legend: Record<string, string>;
  probabilities: Record<string, number>;
  confidence: number;
}

export interface NoulAnswer {
  type: 'noul';
  noul: number;
}

type AnswerFor<Q extends JevQuestion> =
  Q extends ChoiceQuestion ? ChoiceAnswer : Q extends ScoreQuestion ? ScoreAnswer : NoulAnswer;

export interface JevResult<Q extends Record<string, JevQuestion>> {
  model: string;
  answers: { [K in keyof Q]: AnswerFor<Q[K]> };
  latencyMs: number;
}

export function isJevConfigured(): boolean {
  return !!process.env.TYPESAFE_API_KEY?.trim();
}

export async function askJev<Q extends Record<string, JevQuestion>>(
  state: Entry,
  questions: Q,
  opts: { timeoutMs?: number; label?: string } = {},
): Promise<JevResult<Q> | null> {
  const key = process.env.TYPESAFE_API_KEY?.trim();
  if (!key) return null;

  const started = Date.now();
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ state, model: MODEL, questions }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn(`[jev] ${opts.label ?? 'request'} failed: HTTP ${res.status}`, (await res.text()).slice(0, 300));
      return null;
    }
    const body = (await res.json()) as { model: string; answers: JevResult<Q>['answers'] };
    return { model: body.model, answers: body.answers, latencyMs: Date.now() - started };
  } catch (err) {
    console.warn(`[jev] ${opts.label ?? 'request'} error after ${Date.now() - started}ms:`, err instanceof Error ? err.message : err);
    return null;
  }
}
