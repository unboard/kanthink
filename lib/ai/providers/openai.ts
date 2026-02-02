import OpenAI from 'openai';
import type { LLMProvider, LLMMessage, LLMResponse, LLMContentPart } from './types';

const DEFAULT_MODEL = 'gpt-4.1';

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
        max_completion_tokens: 4096,
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

    /**
     * Web search using OpenAI's Responses API with web_search tool
     * https://platform.openai.com/docs/guides/tools-web-search
     */
    async webSearch(query: string, systemPrompt?: string): Promise<LLMResponse> {
      try {
        // OpenAI Responses API with web_search tool
        const response = await client.responses.create({
          model: modelId,
          input: query,
          instructions: systemPrompt || 'You are Kan, a helpful AI assistant. Search the web and provide accurate, up-to-date information. Cite your sources when possible.',
          tools: [{ type: 'web_search' }],
        });

        // The response has output_text for the final text response
        const content = response.output_text || '';

        return {
          content: content || 'I searched the web but could not find relevant information.',
        };
      } catch (error) {
        // If Responses API fails, fall back to regular completion
        console.error('Web search error (falling back to regular completion):', error);

        const fallbackMessages: LLMMessage[] = [
          {
            role: 'system',
            content: systemPrompt || 'You are Kan, a helpful AI assistant.',
          },
          {
            role: 'user',
            content: query,
          },
        ];

        const response = await client.chat.completions.create({
          model: modelId,
          max_completion_tokens: 4096,
          messages: fallbackMessages.map((m) => ({
            role: m.role,
            content: m.content as string,
          })),
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
      }
    },
  };
}
