import type { LLMProvider, LLMConfig } from './providers/types';
import { createOpenAIProvider } from './providers/openai';
import { createGoogleProvider } from './providers/google';
import { resolveProviderKeys } from './keys';
import { getModelPreferences, resolveSurfaceModel, type AiSurface } from './modelPreferences';

export type { LLMProvider, LLMMessage, LLMResponse, LLMConfig, LLMContentPart, LLMCompleteOptions } from './providers/types';
export type { AiSurface } from './modelPreferences';

/**
 * Create an LLM client with explicit configuration
 */
export function createLLMClient(config: LLMConfig): LLMProvider {
  switch (config.provider) {
    case 'openai':
      return createOpenAIProvider(config.apiKey, config.model);
    case 'google':
      return createGoogleProvider(config.apiKey, config.model);
    default:
      throw new Error(`Unknown LLM provider: ${config.provider}`);
  }
}

interface AIConfig {
  provider: 'openai' | 'google';
  apiKey: string;
  model?: string;
  systemInstructions?: string;
}

export interface LLMClientResult {
  client: LLMProvider | null;
  source: 'byok' | 'owner' | 'env' | 'none';
  error?: string;
  /**
   * A specific model was asked for and could not be used — there is no key for its
   * provider. The client returned is the account default; callers that care can say so
   * rather than silently running on something else.
   */
  requestedModelUnavailable?: boolean;
}

/**
 * A caller's model preference — a shroom's per-run override, say.
 *
 * Honoured only when we hold a key for that provider. A key belongs to one provider, so
 * picking an OpenAI model with only a Google key configured cannot work, and falling back
 * to the default beats failing the run.
 */
export interface PreferredModel {
  provider: 'openai' | 'google';
  model: string;
}

/**
 * Get an LLM client for an authenticated user.
 *
 * Three inputs decide the model, in descending authority:
 *
 *   1. `preferred` — an explicit per-call override (a shroom pinned to a model).
 *   2. the account's override for this `surface`, if it set one.
 *   3. the account default.
 *
 * ...and then whichever provider we actually hold a key for, which is the step that
 * used to be silent. A key used to belong to the account rather than to a provider,
 * so asking for an OpenAI model on a Google key quietly ran Gemini instead. Keys are
 * now held per provider, and when a preference still cannot be honoured the caller
 * is told via `requestedModelUnavailable` rather than left to assume it was.
 */
export async function getLLMClientForUser(
  userId: string,
  preferred?: PreferredModel,
  surface?: AiSurface
): Promise<LLMClientResult> {
  const { keys, error, quotaExhausted, quotaMessage } = await resolveProviderKeys(userId);

  if (error) {
    // A key that exists but cannot be decrypted is not the same as no key. The user
    // intended to use their own, so say so rather than silently spending quota.
    return { client: null, source: 'none', error };
  }

  const held = Object.keys(keys) as PreferredModel['provider'][];
  if (held.length === 0) {
    if (quotaExhausted) {
      return { client: null, source: 'none', error: quotaMessage };
    }
    return {
      client: null,
      source: 'none',
      error: 'No API key configured. Please sign in and configure your settings.',
    };
  }

  // An explicit per-call preference outranks anything stored, but only if we can
  // actually call it.
  if (preferred) {
    const key = keys[preferred.provider];
    if (key) {
      return {
        client: createLLMClient({ provider: preferred.provider, apiKey: key.apiKey, model: preferred.model }),
        source: key.source,
      };
    }
  }

  const preferences = await getModelPreferences(userId);
  const resolved = resolveSurfaceModel(preferences, surface, keys);
  if (!resolved) {
    return { client: null, source: 'none', error: 'No API key configured.' };
  }

  const key = keys[resolved.provider]!;
  return {
    client: createLLMClient({ provider: resolved.provider, apiKey: key.apiKey, model: resolved.model }),
    source: key.source,
    // Either the caller asked for a provider we hold no key for, or the account's
    // own preference names one. Both mean "you are not running what you chose".
    requestedModelUnavailable: (!!preferred && !keys[preferred.provider]) || resolved.fellBack,
  };
}

/**
 * Get an LLM client using provided config, falling back to environment variables
 * Returns null if no API key is configured
 * @deprecated Use getLLMClientForUser for authenticated requests
 */
export function getLLMClient(config?: Partial<AIConfig>): LLMProvider | null {
  // Priority: config from settings store > environment variables
  const provider = config?.provider || (process.env.LLM_PROVIDER as 'openai' | 'google') || 'openai';
  const model = config?.model || process.env.LLM_MODEL;

  // Check for API key: settings store first, then env vars
  let apiKey = config?.apiKey;

  if (!apiKey) {
    // Try owner keys first
    apiKey = process.env.OWNER_OPENAI_API_KEY || process.env.OWNER_GOOGLE_API_KEY;

    // Fall back to legacy environment variables
    if (!apiKey) {
      if (provider === 'openai') {
        apiKey = process.env.OPENAI_API_KEY;
      } else if (provider === 'google') {
        apiKey = process.env.GOOGLE_API_KEY;
      }
    }

    // Last resort: try any available env key
    if (!apiKey) {
      apiKey = process.env.OPENAI_API_KEY || process.env.GOOGLE_API_KEY;
    }
  }

  if (!apiKey) {
    return null;
  }

  // Determine provider based on the key we're using
  let effectiveProvider: 'openai' | 'google';
  if (config?.apiKey) {
    effectiveProvider = provider;
  } else if (apiKey === process.env.OWNER_OPENAI_API_KEY || apiKey === process.env.OPENAI_API_KEY) {
    effectiveProvider = 'openai';
  } else {
    effectiveProvider = 'google';
  }

  switch (effectiveProvider) {
    case 'openai':
      return createOpenAIProvider(apiKey, model);
    case 'google':
      return createGoogleProvider(apiKey, model);
    default:
      return null;
  }
}

/**
 * Check if LLM is configured (either via settings or env vars)
 */
export function isLLMConfigured(config?: Partial<AIConfig>): boolean {
  if (config?.apiKey) return true;
  return !!(
    process.env.OWNER_OPENAI_API_KEY ||
    process.env.OWNER_GOOGLE_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.GOOGLE_API_KEY
  );
}
