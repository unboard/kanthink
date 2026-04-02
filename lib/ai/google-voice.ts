import { GoogleGenAI } from '@google/genai';
import { getUserByokConfigWithError, checkUsageLimit } from '../usage';

export interface GoogleVoiceResult {
  client: GoogleGenAI | null;
  source: 'byok' | 'owner' | 'env' | 'none';
  error?: string;
}

/**
 * Get a Google GenAI client for voice features (transcription/TTS).
 * Returns null if the user's provider is OpenAI.
 */
export async function getGoogleClientForVoice(userId: string): Promise<GoogleVoiceResult> {
  // 1. Check BYOK
  const byokResult = await getUserByokConfigWithError(userId);

  if (byokResult.error) {
    return { client: null, source: 'none', error: byokResult.error };
  }

  if (byokResult.config?.apiKey && byokResult.config?.provider) {
    if (byokResult.config.provider !== 'google') {
      return { client: null, source: 'none', error: 'Google voice requires a Google API key.' };
    }
    return {
      client: new GoogleGenAI({ apiKey: byokResult.config.apiKey }),
      source: 'byok',
    };
  }

  // 2. Check usage quota
  const usageCheck = await checkUsageLimit(userId);
  if (!usageCheck.allowed) {
    return { client: null, source: 'none', error: usageCheck.message };
  }

  // 3. Owner key (Google)
  if (process.env.OWNER_GOOGLE_API_KEY) {
    return {
      client: new GoogleGenAI({ apiKey: process.env.OWNER_GOOGLE_API_KEY }),
      source: 'owner',
    };
  }

  // 4. Legacy env
  if (process.env.GOOGLE_API_KEY) {
    return {
      client: new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY }),
      source: 'env',
    };
  }

  return {
    client: null,
    source: 'none',
    error: 'No Google API key configured.',
  };
}
