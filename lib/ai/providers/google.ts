import { GoogleGenAI } from '@google/genai';
import type { LLMProvider, LLMMessage, LLMResponse, LLMContentPart } from './types';

const DEFAULT_MODEL = 'gemini-2.5-flash';

function toGoogleContent(content: string | LLMContentPart[]): string | Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> {
  if (typeof content === 'string') return content;
  return content.map((part) => {
    if (part.type === 'text') {
      return { text: part.text };
    }
    // For images, Gemini expects inline data or file URI
    // URL images need to be fetched and converted to base64
    // For now, we'll just include a text placeholder - image support can be enhanced later
    return { text: `[Image: ${part.image_url.url}]` };
  });
}

export function createGoogleProvider(apiKey: string, model?: string): LLMProvider {
  const client = new GoogleGenAI({ apiKey });
  const modelId = model || DEFAULT_MODEL;

  return {
    name: 'google',

    async complete(messages: LLMMessage[]): Promise<LLMResponse> {
      // Extract system message if present
      const systemMessage = messages.find((m) => m.role === 'system');
      const nonSystemMessages = messages.filter((m) => m.role !== 'system');

      // Build contents array for Gemini
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
          maxOutputTokens: 4096,
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
  };
}
