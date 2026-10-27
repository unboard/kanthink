import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import type { PlaygroundModel } from './models';

/**
 * The one call the app builder makes, over whichever provider the model belongs to.
 *
 * The builder needs exactly four things from a model: a system prompt, a user turn
 * that may carry images, JSON matching a schema, and the token counts back. Both
 * SDKs can do all four; they disagree only about spelling. So this is a seam rather
 * than an abstraction layer — one function, two implementations, and the generator
 * above it stays written the way it was.
 *
 * Schemas are declared once here in JSON Schema, which is what OpenAI's structured
 * output takes directly and what Gemini accepts too, so a change to the shape of a
 * build cannot drift between providers.
 */

export interface StructuredRequest {
  model: PlaygroundModel;
  apiKey: string;
  systemInstruction: string;
  userText: string;
  /** Base64 image parts the model should look at. */
  images: { mimeType: string; data: string }[];
  /** JSON Schema the response must match. */
  schema: Record<string, unknown>;
  /** A name for the schema. OpenAI requires one; Gemini ignores it. */
  schemaName: string;
  maxOutputTokens: number;
  signal: AbortSignal;
}

export interface StructuredResponse {
  /** Raw JSON text. Null when the model returned nothing usable. */
  text: string | null;
  /**
   * The response hit the output ceiling and is therefore incomplete.
   *
   * Worth its own flag rather than letting JSON.parse fail: "Unexpected end of JSON
   * input" explains nothing to someone whose app was simply too long.
   */
  truncated: boolean;
  inputTokens: number;
  outputTokens: number;
}

export async function runStructured(request: StructuredRequest): Promise<StructuredResponse> {
  if (request.model.provider === 'anthropic') {
    // Its own module: Claude speaks a third SDK, and it lives apart from these two.
    const { runClaude } = await import('./generateClaude');
    return runClaude(request);
  }
  return request.model.provider === 'openai'
    ? runOpenAI(request)
    : runGemini(request);
}

async function runGemini(request: StructuredRequest): Promise<StructuredResponse> {
  const client = new GoogleGenAI({ apiKey: request.apiKey });

  const response = await client.models.generateContent({
    model: request.model.id,
    contents: [{
      role: 'user',
      parts: [
        { text: request.userText },
        ...request.images.map((image) => ({ inlineData: image })),
      ],
    }],
    config: {
      systemInstruction: request.systemInstruction,
      responseMimeType: 'application/json',
      // The SDK's responseSchema is JSON-Schema-shaped, so the shared declaration
      // goes in as-is rather than being rebuilt in the SDK's own enum types.
      responseSchema: request.schema as never,
      maxOutputTokens: request.maxOutputTokens,
      thinkingConfig: request.model.thinkingBudget > 0
        ? { thinkingBudget: request.model.thinkingBudget }
        : undefined,
      abortSignal: request.signal,
    },
  });

  return {
    text: response.text ?? null,
    // Gemini counts thinking against maxOutputTokens, so a run that thinks too hard
    // returns truncated JSON with this reason.
    truncated: response.candidates?.[0]?.finishReason === 'MAX_TOKENS',
    inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
    // Thinking is billed at the output rate but reported apart from the answer.
    outputTokens: (response.usageMetadata?.candidatesTokenCount ?? 0) + (response.usageMetadata?.thoughtsTokenCount ?? 0),
  };
}

/** How often a background build is checked on. */
const POLL_MS = 2_000;

/**
 * OpenAI builds run as background responses, polled until done.
 *
 * A build used to be one request held open until the whole app was written. The
 * flagship models can think for minutes, and Node's fetch gives up on a response
 * with no headers after 300s; the SDK then retried the same build twice, so a long
 * GPT-6 build ended at the generator's deadline, having been paid for up to three
 * times. A background response returns at once and every poll is short, so the
 * only limit left is our own deadline.
 */
async function runOpenAI(request: StructuredRequest): Promise<StructuredResponse> {
  // No silent retries: a retried build is a second bill for the same app.
  const client = new OpenAI({ apiKey: request.apiKey, maxRetries: 0 });

  let response = await client.responses.create(
    {
      model: request.model.id,
      instructions: request.systemInstruction,
      input: [{
        role: 'user',
        content: [
          { type: 'input_text', text: request.userText },
          ...request.images.map((image) => ({
            type: 'input_image' as const,
            detail: 'auto' as const,
            image_url: `data:${image.mimeType};base64,${image.data}`,
          })),
        ],
      }],
      text: {
        format: {
          type: 'json_schema',
          name: request.schemaName,
          // Non-strict on purpose. Strict mode requires every property to be
          // required and additionalProperties false throughout, and these schemas
          // have genuinely optional fields — a cosmetic patch has no design notes.
          strict: false,
          schema: request.schema,
        },
      },
      max_output_tokens: request.maxOutputTokens,
      reasoning: { effort: request.model.reasoningEffort ?? 'medium' },
      background: true,
      // Background mode keeps the response on OpenAI's side so it can be polled.
      store: true,
    },
    { signal: request.signal },
  );

  // Past the deadline, stop the work on OpenAI's side too, not just our wait for it.
  const cancel = () => { client.responses.cancel(response.id).catch(() => {}); };
  request.signal.addEventListener('abort', cancel, { once: true });
  try {
    while (response.status === 'queued' || response.status === 'in_progress') {
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      request.signal.throwIfAborted();
      response = await client.responses.retrieve(response.id, {}, { signal: request.signal });
    }
  } finally {
    request.signal.removeEventListener('abort', cancel);
  }

  if (response.status === 'failed' || response.status === 'cancelled') {
    throw new Error(response.error?.message || `OpenAI build ${response.status}`);
  }

  return {
    text: response.output_text || null,
    truncated: response.status === 'incomplete' && response.incomplete_details?.reason === 'max_output_tokens',
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
  };
}
