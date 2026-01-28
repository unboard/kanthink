import Anthropic from '@anthropic-ai/sdk';
import type { LLMProvider, LLMMessage, LLMResponse, LLMContentPart } from './types';

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';

function toAnthropicContent(content: string | LLMContentPart[]): string | Anthropic.ContentBlockParam[] {
  if (typeof content === 'string') return content;
  return content.map((part) => {
    if (part.type === 'text') {
      return { type: 'text' as const, text: part.text };
    }
    return {
      type: 'image' as const,
      source: {
        type: 'url' as const,
        url: part.image_url.url,
      },
    };
  });
}

export function createAnthropicProvider(apiKey: string, model?: string): LLMProvider {
  const client = new Anthropic({ apiKey });
  const modelId = model || DEFAULT_MODEL;

  return {
    name: 'anthropic',

    async complete(messages: LLMMessage[]): Promise<LLMResponse> {
      // Extract system message if present (system is always string)
      const systemMessage = messages.find((m) => m.role === 'system');
      const nonSystemMessages = messages.filter((m) => m.role !== 'system');

      const response = await client.messages.create({
        model: modelId,
        max_tokens: 4096,
        system: typeof systemMessage?.content === 'string'
          ? systemMessage.content
          : undefined,
        messages: nonSystemMessages.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: toAnthropicContent(m.content),
        })),
      });

      // Extract text content from response
      const textBlock = response.content.find((block) => block.type === 'text');
      const content = textBlock?.type === 'text' ? textBlock.text : '';

      return {
        content,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
      };
    },
  };
}
