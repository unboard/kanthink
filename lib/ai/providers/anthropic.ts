import Anthropic from '@anthropic-ai/sdk';
import { providerGroup } from '../modelCatalog';
import { fallbackParams, imageBlock, responseText } from '../anthropic';
import type { LLMProvider, LLMMessage, LLMResponse, LLMContentPart, LLMCompleteOptions } from './types';

// From the catalogue — see the note in the OpenAI provider.
const DEFAULT_MODEL = providerGroup('anthropic').defaultModel;

/**
 * Where to go when a model runs out of output room. Haiku and Sonnet step up to
 * Opus; Opus is the top, so a retry loop has a floor.
 */
const ESCALATION_TOP = 'claude-opus-5-5';

function roomierModel(modelId: string): string | null {
  return modelId === ESCALATION_TOP || /fable|opus/.test(modelId) ? null : ESCALATION_TOP;
}

function toContent(content: string | LLMContentPart[]): string | Anthropic.Beta.BetaContentBlockParam[] {
  if (typeof content === 'string') return content;
  return content.flatMap((part): Anthropic.Beta.BetaContentBlockParam[] => {
    if (part.type === 'text') return part.text ? [{ type: 'text', text: part.text }] : [];
    const image = imageBlock(part.image_url.url);
    return image ? [image] : [{ type: 'text', text: `[Image that could not be loaded: ${part.image_url.url}]` }];
  });
}

export function createAnthropicProvider(apiKey: string, model?: string): LLMProvider {
  const client = new Anthropic({ apiKey });
  const modelId = model || DEFAULT_MODEL;

  return {
    name: 'anthropic',
    model: modelId,

    escalate(): LLMProvider | null {
      const next = roomierModel(modelId);
      return next ? createAnthropicProvider(apiKey, next) : null;
    },

    async complete(messages: LLMMessage[], options?: LLMCompleteOptions): Promise<LLMResponse> {
      const system = messages
        .filter((m) => m.role === 'system')
        .map((m) => (typeof m.content === 'string' ? m.content : m.content.map((p) => (p.type === 'text' ? p.text : '')).join('\n')))
        .join('\n\n');
      const turns: Anthropic.Beta.BetaMessageParam[] = messages
        .filter((m): m is LLMMessage & { role: 'user' | 'assistant' } => m.role !== 'system')
        .map((m) => ({ role: m.role, content: toContent(m.content) }));
      // The conversation has to open with the user.
      if (turns[0]?.role !== 'user') turns.unshift({ role: 'user', content: '(conversation continues)' });

      // Thinking is left to each model's default: adaptive on Opus, Sonnet and
      // Fable, off on Haiku. It spends from max_tokens, like Gemini's does.
      const response = await client.beta.messages.create({
        model: modelId,
        max_tokens: options?.maxTokens || 4096,
        ...(system ? { system } : {}),
        messages: turns,
        ...fallbackParams(modelId),
      });

      return {
        content: responseText(response),
        truncated: response.stop_reason === 'max_tokens',
        usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
      };
    },
  };
}
