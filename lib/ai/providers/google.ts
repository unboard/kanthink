import { GoogleGenAI } from '@google/genai';
import type { LLMProvider, LLMMessage, LLMResponse, LLMContentPart, LLMCompleteOptions } from './types';

const DEFAULT_MODEL = 'gemini-2.5-flash';

type GooglePart = { text: string } | { inlineData: { mimeType: string; data: string } };

// Fetch an image URL and return it as base64 inline data for Gemini vision
async function fetchImageAsInlineData(url: string): Promise<GooglePart | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') || 'image/png';
    const buffer = await res.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    return { inlineData: { mimeType: contentType, data: base64 } };
  } catch {
    return null;
  }
}

async function toGoogleContent(content: string | LLMContentPart[]): Promise<string | GooglePart[]> {
  if (typeof content === 'string') return content;
  const parts: GooglePart[] = [];
  for (const part of content) {
    if (part.type === 'text') {
      parts.push({ text: part.text });
    } else {
      const inlined = await fetchImageAsInlineData(part.image_url.url);
      if (inlined) {
        parts.push(inlined);
      } else {
        // Fallback: mention the URL as text if fetch fails
        parts.push({ text: `[Image that could not be loaded: ${part.image_url.url}]` });
      }
    }
  }
  return parts;
}

export function createGoogleProvider(apiKey: string, model?: string): LLMProvider {
  const client = new GoogleGenAI({ apiKey });
  const modelId = model || DEFAULT_MODEL;

  return {
    name: 'google',

    async complete(messages: LLMMessage[], options?: LLMCompleteOptions): Promise<LLMResponse> {
      const systemMessage = messages.find((m) => m.role === 'system');
      const nonSystemMessages = messages.filter((m) => m.role !== 'system');

      const contents = await Promise.all(nonSystemMessages.map(async (m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: typeof m.content === 'string'
          ? [{ text: m.content }]
          : await toGoogleContent(m.content) as GooglePart[],
      })));

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

      let content = '';
      try {
        content = response.text || '';
      } catch {
        // response.text can throw if response was blocked or has no candidates
        const candidate = response.candidates?.[0];
        content = candidate?.content?.parts?.map((p: { text?: string }) => p.text || '').join('') || '';
      }

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
