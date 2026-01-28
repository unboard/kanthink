import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getLLMClientForUser, getLLMClient, createLLMClient, type LLMProvider } from './llm';
import { recordUsage } from '@/lib/usage';

export interface AuthenticatedLLMContext {
  llm: LLMProvider;
  userId: string | null;
  recordUsageAfterSuccess: () => Promise<void>;
}

interface LegacyAIConfig {
  provider: 'anthropic' | 'openai';
  apiKey: string;
  model?: string;
}

/**
 * Get an authenticated LLM context for API routes.
 * Handles auth check, usage limits, and usage recording.
 *
 * Returns either:
 * - { context: AuthenticatedLLMContext } on success
 * - { error: NextResponse } on failure (return this directly)
 */
export async function getAuthenticatedLLM(
  requestType: string,
  legacyConfig?: LegacyAIConfig
): Promise<
  | { context: AuthenticatedLLMContext; error?: never }
  | { context?: never; error: NextResponse }
> {
  const session = await auth();
  const userId = session?.user?.id || null;

  let llm: LLMProvider | null = null;
  let usingOwnerKey = false;

  if (userId) {
    // Authenticated user - use the new system
    const result = await getLLMClientForUser(userId);
    if (!result.client) {
      return {
        error: NextResponse.json(
          { error: result.error || 'No AI access available' },
          { status: 403 }
        ),
      };
    }
    llm = result.client;
    usingOwnerKey = result.source === 'owner';
  } else if (legacyConfig?.apiKey) {
    // Legacy: unauthenticated with API key from client
    llm = createLLMClient({
      provider: legacyConfig.provider,
      apiKey: legacyConfig.apiKey,
      model: legacyConfig.model,
    });
  } else {
    // Try fallback to environment variables
    llm = getLLMClient();
  }

  if (!llm) {
    return {
      error: NextResponse.json(
        { error: 'No AI configuration available. Please sign in or add your API key.' },
        { status: 403 }
      ),
    };
  }

  // Create a function to record usage after successful request
  const recordUsageAfterSuccess = async () => {
    if (userId && usingOwnerKey) {
      await recordUsage(userId, requestType);
    }
  };

  return {
    context: {
      llm,
      userId,
      recordUsageAfterSuccess,
    },
  };
}

/**
 * Helper to check if request has valid AI access (without creating client)
 */
export async function hasAIAccess(legacyApiKey?: string): Promise<boolean> {
  const session = await auth();
  if (session?.user?.id) return true;
  if (legacyApiKey) return true;
  return !!(
    process.env.OWNER_OPENAI_API_KEY ||
    process.env.OWNER_ANTHROPIC_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.ANTHROPIC_API_KEY
  );
}
