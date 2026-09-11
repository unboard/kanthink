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
    outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
  };
}

async function runOpenAI(request: StructuredRequest): Promise<StructuredResponse> {
  const client = new OpenAI({ apiKey: request.apiKey });

  const response = await client.chat.completions.create(
    {
      model: request.model.id,
      messages: [
        { role: 'system', content: request.systemInstruction },
        {
          role: 'user',
          content: [
            { type: 'text', text: request.userText },
            ...request.images.map((image) => ({
              type: 'image_url' as const,
              // The SDK takes images as data URLs rather than as separate parts.
              image_url: { url: `data:${image.mimeType};base64,${image.data}` },
            })),
          ],
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: request.schemaName,
          // Non-strict on purpose. Strict mode requires every property to be
          // required and additionalProperties false throughout, and these schemas
          // have genuinely optional fields — a cosmetic patch has no design notes.
          strict: false,
          schema: request.schema,
        },
      },
      max_completion_tokens: request.maxOutputTokens,
      reasoning_effort: request.model.reasoningEffort ?? 'medium',
    },
    { signal: request.signal },
  );

  const choice = response.choices[0];
  return {
    text: choice?.message?.content ?? null,
    truncated: choice?.finish_reason === 'length',
    inputTokens: response.usage?.prompt_tokens ?? 0,
    outputTokens: response.usage?.completion_tokens ?? 0,
  };
}
