import { GoogleGenAI } from '@google/genai';
import { resolveProviderKeys } from './keys';

export interface GoogleVoiceResult {
  client: GoogleGenAI | null;
  source: 'byok' | 'owner' | 'env' | 'none';
  error?: string;
}

/**
 * A Google GenAI client for the things only Gemini does here: live voice,
 * transcription, TTS and image generation.
 *
 * This used to refuse outright if the account's single saved key was OpenAI's —
 * correct at the time, because there was only ever one key, but it meant saving an
 * OpenAI key silently turned voice off. Keys are now held per provider, so having
 * one for OpenAI says nothing about whether there is one for Google.
 */
export async function getGoogleClientForVoice(userId: string): Promise<GoogleVoiceResult> {
  const { keys, error, quotaExhausted, quotaMessage } = await resolveProviderKeys(userId);

  if (error) {
    return { client: null, source: 'none', error };
  }

  const google = keys.google;
  if (google) {
    return { client: new GoogleGenAI({ apiKey: google.apiKey }), source: google.source };
  }

  if (quotaExhausted) {
    return { client: null, source: 'none', error: quotaMessage };
  }

  return {
    client: null,
    source: 'none',
    error: 'Voice and image generation need a Google API key. Add one in Settings → AI.',
  };
}
