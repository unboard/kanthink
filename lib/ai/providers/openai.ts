import OpenAI from 'openai';
import type { LLMProvider, LLMMessage, LLMResponse, LLMContentPart } from './types';

const DEFAULT_MODEL = 'gpt-4o';

function toOpenAIContent(content: string | LLMContentPart[]): string | OpenAI.Chat.Completions.ChatCompletionContentPart[] {
  if (typeof content === 'string') return content;
  return content.map((part) => {
    if (part.type === 'text') {
      return { type: 'text' as const, text: part.text };
    }
    return {
      type: 'image_url' as const,
      image_url: { url: part.image_url.url },
    };
  });
}

export function createOpenAIProvider(apiKey: string, model?: string): LLMProvider {
  const client = new OpenAI({ apiKey });
  const modelId = model || DEFAULT_MODEL;

  return {
    name: 'openai',

    async complete(messages: LLMMessage[]): Promise<LLMResponse> {
      const response = await client.chat.completions.create({
        model: modelId,
        max_tokens: 4096,
        messages: messages.map((m) => ({
          role: m.role,
          content: toOpenAIContent(m.content),
        })) as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
      });

      const content = response.choices[0]?.message?.content || '';

      return {
        content,
        usage: response.usage
          ? {
              inputTokens: response.usage.prompt_tokens,
              outputTokens: response.usage.completion_tokens,
            }
          : undefined,
      };
    },
  };
}
