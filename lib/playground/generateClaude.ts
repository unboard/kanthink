import Anthropic from '@anthropic-ai/sdk';
import { fallbackParams, responseText, toClaudeSchema } from '@/lib/ai/anthropic';
import type { StructuredRequest, StructuredResponse } from './generateClient';

/**
 * The app builder's one call, on Claude.
 *
 * Streamed and collected with finalMessage(): builds ask for up to 32K output
 * tokens, which the SDK will not send as a plain request for fear of the HTTP
 * timeout. Nothing is shown as it streams — the builder wants the whole JSON.
 *
 * Thinking is each model's own adaptive default; `effort` is how hard it tries,
 * mapped from the same reasoningEffort the OpenAI models use. Thinking spends from
 * max_tokens, so a build that thinks long and writes long comes back `truncated`,
 * exactly as it does on Gemini.
 */
export async function runClaude(request: StructuredRequest): Promise<StructuredResponse> {
  const client = new Anthropic({ apiKey: request.apiKey });
  const model = request.model.id;
  // Haiku 4.5 takes no effort setting; everything newer does.
  const effort = /haiku/.test(model) ? undefined : request.model.reasoningEffort ?? 'high';

  const stream = client.beta.messages.stream(
    {
      model,
      max_tokens: request.maxOutputTokens,
      system: request.systemInstruction,
      messages: [{
        role: 'user',
        content: [
          ...request.images.map((image) => ({
            type: 'image' as const,
            source: { type: 'base64' as const, media_type: image.mimeType as 'image/png', data: image.data },
          })),
          { type: 'text' as const, text: request.userText },
        ],
      }],
      output_config: {
        ...(effort ? { effort } : {}),
        format: { type: 'json_schema', schema: toClaudeSchema(request.schema) },
      },
      ...fallbackParams(model),
    },
    { signal: request.signal },
  );
  const message = await stream.finalMessage();

  // A decline returns no JSON; say nothing usable came back rather than hand the
  // parser an empty string.
  const text = message.stop_reason === 'refusal' ? '' : responseText(message);
  return {
    text: text || null,
    truncated: message.stop_reason === 'max_tokens',
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
  };
}
