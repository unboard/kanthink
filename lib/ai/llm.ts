import type { LLMProvider, LLMConfig } from './providers/types';
import { createAnthropicProvider } from './providers/anthropic';
import { createOpenAIProvider } from './providers/openai';
import { getUserByokConfig, checkUsageLimit } from '../usage';

export type { LLMProvider, LLMMessage, LLMResponse, LLMConfig, LLMContentPart } from './providers/types';

/**
 * Create an LLM client with explicit configuration
 */
export function createLLMClient(config: LLMConfig): LLMProvider {
  switch (config.provider) {
    case 'anthropic':
      return createAnthropicProvider(config.apiKey, config.model);
    case 'openai':
      return createOpenAIProvider(config.apiKey, config.model);
    default:
      throw new Error(`Unknown LLM provider: ${config.provider}`);
  }
}

interface AIConfig {
  provider: 'anthropic' | 'openai';
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
  const byokConfig = await getUserByokConfig(userId);
  if (byokConfig?.apiKey && byokConfig?.provider) {
    const client = createLLMClient({
      provider: byokConfig.provider,
      apiKey: byokConfig.apiKey,
      model: byokConfig.model || undefined,
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
  const ownerApiKey = process.env.OWNER_OPENAI_API_KEY || process.env.OWNER_ANTHROPIC_API_KEY;
  if (ownerApiKey) {
    const provider = process.env.OWNER_OPENAI_API_KEY ? 'openai' : 'anthropic';
    const client = createLLMClient({
      provider,
      apiKey: ownerApiKey,
    });
    return { client, source: 'owner' };
  }

  // 4. Fall back to legacy environment variables (for development)
  const legacyApiKey = process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (legacyApiKey) {
    const provider = process.env.OPENAI_API_KEY ? 'openai' : 'anthropic';
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
  const provider = config?.provider || (process.env.LLM_PROVIDER as 'anthropic' | 'openai') || 'anthropic';
  const model = config?.model || process.env.LLM_MODEL;

  // Check for API key: settings store first, then env vars
  let apiKey = config?.apiKey;

  if (!apiKey) {
    // Try owner keys first
    apiKey = process.env.OWNER_OPENAI_API_KEY || process.env.OWNER_ANTHROPIC_API_KEY;

    // Fall back to legacy environment variables
    if (!apiKey) {
      if (provider === 'anthropic') {
        apiKey = process.env.ANTHROPIC_API_KEY;
      } else if (provider === 'openai') {
        apiKey = process.env.OPENAI_API_KEY;
      }
    }

    // Last resort: try any available env key
    if (!apiKey) {
      apiKey = process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY;
    }
  }

  if (!apiKey) {
    return null;
  }

  // Determine provider based on the key we're using
  let effectiveProvider: 'anthropic' | 'openai';
  if (config?.apiKey) {
    effectiveProvider = provider;
  } else if (apiKey === process.env.OWNER_OPENAI_API_KEY || apiKey === process.env.OPENAI_API_KEY) {
    effectiveProvider = 'openai';
  } else {
    effectiveProvider = 'anthropic';
  }

  switch (effectiveProvider) {
    case 'anthropic':
      return createAnthropicProvider(apiKey, model);
    case 'openai':
      return createOpenAIProvider(apiKey, model);
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
    process.env.OWNER_ANTHROPIC_API_KEY ||
    process.env.ANTHROPIC_API_KEY ||
    process.env.OPENAI_API_KEY
  );
}
