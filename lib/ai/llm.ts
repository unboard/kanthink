import type { LLMProvider, LLMConfig } from './providers/types';
import { createOpenAIProvider } from './providers/openai';
import { createGoogleProvider } from './providers/google';
import { getUserByokConfigWithError, checkUsageLimit } from '../usage';

export type { LLMProvider, LLMMessage, LLMResponse, LLMConfig, LLMContentPart } from './providers/types';

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
}

/**
 * Get an LLM client for an authenticated user
 * Priority: User's BYOK > Owner's key (if user has quota) > Environment variables
 */
export async function getLLMClientForUser(userId: string): Promise<LLMClientResult> {
  // 1. Check if user has BYOK configured
  const byokResult = await getUserByokConfigWithError(userId);

  // If there was an error decrypting BYOK, return that error immediately
  // Don't fall back to usage check - the user intended to use their own key
  if (byokResult.error) {
    console.error('BYOK decryption error for user', userId, ':', byokResult.error);
    return {
      client: null,
      source: 'none',
      error: byokResult.error,
    };
  }

  if (byokResult.config?.apiKey && byokResult.config?.provider) {
    console.log(`Using BYOK for user ${userId}, provider: ${byokResult.config.provider}`);
    const client = createLLMClient({
      provider: byokResult.config.provider,
      apiKey: byokResult.config.apiKey,
      model: byokResult.config.model || undefined,
    });
    return { client, source: 'byok' };
  }

  // 2. Check if user has quota remaining
  const usageCheck = await checkUsageLimit(userId);
  if (!usageCheck.allowed) {
    return {
      client: null,
      source: 'none',
      error: usageCheck.message,
    };
  }

  // 3. Use owner's key
  const ownerApiKey = process.env.OWNER_OPENAI_API_KEY || process.env.OWNER_GOOGLE_API_KEY;
  if (ownerApiKey) {
    const provider = process.env.OWNER_OPENAI_API_KEY ? 'openai' : 'google';
    const client = createLLMClient({
      provider,
      apiKey: ownerApiKey,
    });
    return { client, source: 'owner' };
  }

  // 4. Fall back to legacy environment variables (for development)
  const legacyApiKey = process.env.OPENAI_API_KEY || process.env.GOOGLE_API_KEY;
  if (legacyApiKey) {
    const provider = process.env.OPENAI_API_KEY ? 'openai' : 'google';
    const client = createLLMClient({
      provider,
      apiKey: legacyApiKey,
    });
    return { client, source: 'env' };
  }

  return {
    client: null,
    source: 'none',
    error: 'No API key configured. Please sign in and configure your settings.',
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
