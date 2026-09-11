import OpenAI from 'openai';
import { resolveProviderKeys } from './keys';

export interface OpenAIClientResult {
  client: OpenAI | null;
  source: 'byok' | 'owner' | 'env' | 'none';
  error?: string;
}

/**
 * A raw OpenAI SDK client, for the endpoints the shared LLM interface does not
 * cover — Whisper, TTS, and image generation as a last resort.
 *
 * Like its Google counterpart, this used to refuse if the account's single saved
 * key belonged to the other provider. Keys are per provider now, so holding a
 * Google key no longer means OpenAI is unavailable.
 */
export async function getOpenAIClientForUser(userId: string): Promise<OpenAIClientResult> {
  const { keys, error, quotaExhausted, quotaMessage } = await resolveProviderKeys(userId);

  if (error) {
    return { client: null, source: 'none', error };
  }

  const openai = keys.openai;
  if (openai) {
    return { client: new OpenAI({ apiKey: openai.apiKey }), source: openai.source };
  }

  if (quotaExhausted) {
    return { client: null, source: 'none', error: quotaMessage };
  }

  return {
    client: null,
    source: 'none',
    error: 'This needs an OpenAI API key. Add one in Settings → AI.',
  };
}
