import Anthropic from '@anthropic-ai/sdk';

/**
 * The pieces every Claude call in Kanthink shares: which models can fall back when
 * they decline, how images go in, and how a JSON Schema is made acceptable to
 * structured outputs.
 *
 * Kept apart from the Gemini and OpenAI code on purpose — each provider's module
 * speaks its own SDK, and the seams (lib/ai/providers, lib/playground/generateClient)
 * choose between them.
 */

/**
 * Models that take the server-side refusal fallback. When one declines a request,
 * the API re-runs it on a model chosen by the refusal's category inside the same
 * call, instead of returning an empty answer. Documented for these ids; add others
 * only once their docs say so, because an unsupported model rejects the request.
 */
const FALLBACK_MODELS = new Set(['claude-fable-5-1', 'claude-opus-5']);
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

export function fallbackParams(model: string): { betas?: string[]; fallbacks?: 'default' } {
  return FALLBACK_MODELS.has(model) ? { betas: [FALLBACK_BETA], fallbacks: 'default' } : {};
}

/** An image for Claude: a data URL becomes base64, anything else is fetched by URL. */
export function imageBlock(url: string): Anthropic.Beta.BetaImageBlockParam | null {
  const data = /^data:(image\/(?:png|jpeg|gif|webp));base64,(.+)$/i.exec(url);
  if (data) {
    return {
      type: 'image',
      source: { type: 'base64', media_type: data[1].toLowerCase() as 'image/png', data: data[2] },
    };
  }
  if (/^https?:\/\//i.test(url)) return { type: 'image', source: { type: 'url', url } };
  return null;
}

/** Keywords structured outputs rejects. The SDK's own helpers strip these too. */
const UNSUPPORTED_KEYWORDS = ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'minLength', 'maxLength', 'minItems', 'maxItems', 'uniqueItems', 'pattern'];

/**
 * A JSON Schema as structured outputs accepts it: every object closed with
 * `additionalProperties: false`, and the constraint keywords it does not support
 * removed. Optional properties stay optional — only `required` makes them required.
 *
 * The builder declares one schema for every provider; this adapts it at the edge
 * rather than making the shared declaration obey one provider's rules.
 */
export function toClaudeSchema(schema: unknown): Record<string, unknown> {
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (!node || typeof node !== 'object') return node;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      if (UNSUPPORTED_KEYWORDS.includes(key)) continue;
      out[key] = key === 'properties' && value && typeof value === 'object'
        ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walk(v)]))
        : walk(value);
    }
    if (out.type === 'object' || out.properties) out.additionalProperties = false;
    return out;
  };
  return walk(schema) as Record<string, unknown>;
}

/** The text of a response, skipping thinking and any fallback markers. */
export function responseText(message: Anthropic.Beta.BetaMessage): string {
  return message.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
}
