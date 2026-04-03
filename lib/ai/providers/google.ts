import { GoogleGenAI } from '@google/genai';
import type { LLMProvider, LLMMessage, LLMResponse, LLMContentPart, LLMCompleteOptions } from './types';

const DEFAULT_MODEL = 'gemini-2.5-flash';

function toGoogleContent(content: string | LLMContentPart[]): string | Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> {
  if (typeof content === 'string') return content;
  return content.map((part) => {
    if (part.type === 'text') {
      return { text: part.text };
    }
    return { text: `[Image: ${part.image_url.url}]` };
  });
}

export function createGoogleProvider(apiKey: string, model?: string): LLMProvider {
  const client = new GoogleGenAI({ apiKey });
  const modelId = model || DEFAULT_MODEL;

  return {
    name: 'google',

    async complete(messages: LLMMessage[], options?: LLMCompleteOptions): Promise<LLMResponse> {
      const systemMessage = messages.find((m) => m.role === 'system');
      const nonSystemMessages = messages.filter((m) => m.role !== 'system');

      const contents = nonSystemMessages.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: typeof m.content === 'string'
          ? [{ text: m.content }]
          : toGoogleContent(m.content) as Array<{ text: string }>,
      }));

      const response = await client.models.generateContent({
        model: modelId,
        contents,
        config: {
          maxOutputTokens: options?.maxTokens || 4096,
          systemInstruction: typeof systemMessage?.content === 'string'
            ? systemMessage.content
            : undefined,
        },
      });

      const content = response.text || '';

      return {
        content,
        usage: response.usageMetadata
          ? {
              inputTokens: response.usageMetadata.promptTokenCount || 0,
              outputTokens: response.usageMetadata.candidatesTokenCount || 0,
            }
          : undefined,
      };
    },

    async webSearch(query: string, systemPrompt?: string): Promise<LLMResponse> {
      const contents = [{ role: 'user' as const, parts: [{ text: query }] }];

      const searchSystemPrompt = systemPrompt
        ? `${systemPrompt}\n\nIMPORTANT: You have access to Google Search. Always use the search results to provide real, verified URLs. Never make up or guess URLs — only include URLs that come from the search results.`
        : 'Search the web and provide helpful information with real, verified URLs from the search results. Never make up URLs.';

      const response = await client.models.generateContent({
        model: modelId,
        contents,
        config: {
          systemInstruction: searchSystemPrompt,
          tools: [{ googleSearch: {} }],
        },
      });

      const content = response.text || '';

      // Extract grounding metadata for citations
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const groundingMeta = (response.candidates?.[0] as any)?.groundingMetadata;
      const webSearchResults = groundingMeta?.groundingChunks
        ?.filter((chunk: { web?: { uri: string; title: string } }) => chunk.web)
        .map((chunk: { web: { uri: string; title: string } }) => ({
          url: chunk.web.uri,
          title: chunk.web.title || '',
          snippet: '',
        })) || [];

      return {
        content,
        webSearchResults,
        usage: response.usageMetadata
          ? {
              inputTokens: response.usageMetadata.promptTokenCount || 0,
              outputTokens: response.usageMetadata.candidatesTokenCount || 0,
            }
          : undefined,
      };
    },
  };
}
