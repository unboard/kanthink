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
        const response = await client.responses.create({
          model: modelId,
          input: query,
          instructions: systemPrompt || 'You are Kan, a helpful AI assistant. Search the web and provide accurate, up-to-date information. Cite your sources when possible.',
          tools: [{ type: 'web_search' }],
        });

        const content = response.output_text || '';

        // Extract verified URLs from url_citation annotations in response.output
        const webSearchResults: { url: string; title: string; snippet: string }[] = [];
        const seenUrls = new Set<string>();

        for (const item of response.output) {
          if (item.type === 'message' && item.content) {
            for (const block of item.content) {
              if (block.type === 'output_text' && block.annotations) {
                for (const ann of block.annotations) {
                  if (ann.type === 'url_citation' && ann.url && !seenUrls.has(ann.url)) {
                    seenUrls.add(ann.url);
                    webSearchResults.push({
                      url: ann.url,
                      title: ann.title || '',
                      snippet: '',
                    });
                  }
                }
              }
            }
          }
        }

        return {
          content: content || 'I searched the web but could not find relevant information.',
          webSearchResults: webSearchResults.length > 0 ? webSearchResults : undefined,
        };
      } catch (error) {
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
