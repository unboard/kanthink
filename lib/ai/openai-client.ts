import OpenAI from 'openai';
import { getUserByokConfigWithError, checkUsageLimit } from '../usage';

export interface OpenAIClientResult {
  client: OpenAI | null;
  source: 'byok' | 'owner' | 'env' | 'none';
  error?: string;
}

/**
 * Get a raw OpenAI SDK client for a user (for Whisper/TTS APIs).
 * Returns null if the resolved provider is Google.
 */
export async function getOpenAIClientForUser(userId: string): Promise<OpenAIClientResult> {
  // 1. Check BYOK
  const byokResult = await getUserByokConfigWithError(userId);

  if (byokResult.error) {
    return { client: null, source: 'none', error: byokResult.error };
  }

  if (byokResult.config?.apiKey && byokResult.config?.provider) {
    if (byokResult.config.provider !== 'openai') {
      return { client: null, source: 'none', error: 'Voice features require an OpenAI API key.' };
    }
    return {
      client: new OpenAI({ apiKey: byokResult.config.apiKey }),
      source: 'byok',
    };
  }

  // 2. Check usage quota
  const usageCheck = await checkUsageLimit(userId);
  if (!usageCheck.allowed) {
    return { client: null, source: 'none', error: usageCheck.message };
  }

  // 3. Owner key
  if (process.env.OWNER_OPENAI_API_KEY) {
    return {
      client: new OpenAI({ apiKey: process.env.OWNER_OPENAI_API_KEY }),
      source: 'owner',
    };
  }

  // Owner key is Google — voice not available
  if (process.env.OWNER_GOOGLE_API_KEY) {
    return { client: null, source: 'none', error: 'Voice features require an OpenAI API key.' };
  }

  // 4. Legacy env
  if (process.env.OPENAI_API_KEY) {
    return {
      client: new OpenAI({ apiKey: process.env.OPENAI_API_KEY }),
      source: 'env',
    };
  }

  return {
    client: null,
    source: 'none',
    error: 'No OpenAI API key configured. Voice requires OpenAI.',
  };
}
