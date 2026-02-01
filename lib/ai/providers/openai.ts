import OpenAI from 'openai';
import type { LLMProvider, LLMMessage, LLMResponse, LLMContentPart } from './types';

const DEFAULT_MODEL = 'gpt-4o';
const WEB_SEARCH_MODEL = 'gpt-4o'; // Model for web search queries

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

    /**
     * Web search using OpenAI's Responses API with web_search tool
     * This allows the model to search the web for current information
     */
    async webSearch(query: string, systemPrompt?: string): Promise<LLMResponse> {
      try {
        // Use the Responses API with web_search tool
        // The API structure may vary based on OpenAI SDK version
        const responsesApi = (client as unknown as { responses: { create: (params: unknown) => Promise<unknown> } }).responses;

        if (!responsesApi?.create) {
          throw new Error('Responses API not available');
        }

        const response = await responsesApi.create({
          model: WEB_SEARCH_MODEL,
          input: query,
          instructions: systemPrompt || 'You are Kan, a helpful AI assistant. Search the web and provide accurate, up-to-date information. Cite your sources when possible.',
          tools: [{ type: 'web_search' }],
        }) as { output_text?: string; output?: Array<{ type: string; content?: Array<{ type: string; text?: string }> }> };

        // Extract the text output from the response
        let content = '';

        if (response.output_text) {
          content = response.output_text;
        } else if (response.output) {
          // Process output items
          for (const item of response.output) {
            if (item.type === 'message' && item.content) {
              for (const block of item.content) {
                if (block.type === 'text' && block.text) {
                  content += block.text;
                }
              }
            }
          }
        }

        return {
          content: content || 'I searched the web but could not find relevant information.',
        };
      } catch (error) {
        // If Responses API is not available, fall back to regular completion
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
          max_tokens: 4096,
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
