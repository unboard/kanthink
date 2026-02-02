import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { auth } from '@/lib/auth';
import { getLLMClientForUser, getLLMClient, type LLMProvider } from './llm';
import { recordUsage, checkAnonymousUsageLimit, recordAnonymousUsage } from '@/lib/usage';

const ANON_COOKIE_NAME = 'kanthink_anon_id';

export interface AuthenticatedLLMContext {
  llm: LLMProvider;
  userId: string | null;
  anonId?: string;
  isAnonymous: boolean;
  recordUsageAfterSuccess: () => Promise<void>;
}

/**
 * Get or create an anonymous user ID from cookies
 */
export async function getOrCreateAnonId(): Promise<string> {
  const cookieStore = await cookies();
  let anonId = cookieStore.get(ANON_COOKIE_NAME)?.value;

  if (!anonId) {
    anonId = `anon_${crypto.randomUUID()}`;
    // Note: Cookie will be set in the response by the API route
  }

  return anonId;
}

/**
 * Get an authenticated LLM context for API routes.
 * Handles auth check, usage limits, and usage recording.
 *
 * Supports both authenticated users and anonymous users:
 * - Authenticated users: BYOK first, then owner key with user limits
 * - Anonymous users: Owner key with anonymous limits (10 requests/month)
 *
 * Returns either:
 * - { context: AuthenticatedLLMContext } on success
 * - { error: NextResponse } on failure (return this directly)
 */
export async function getAuthenticatedLLM(
  requestType: string
): Promise<
  | { context: AuthenticatedLLMContext; error?: never; anonId?: string }
  | { context?: never; error: NextResponse; anonId?: string }
> {
  const session = await auth();
  const userId = session?.user?.id || null;

  let llm: LLMProvider | null = null;
  let usingOwnerKey = false;
  let anonId: string | undefined = undefined;

  if (userId) {
    // Authenticated user - check BYOK first, then owner key
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
  } else {
    // Anonymous user - check usage limit first
    anonId = await getOrCreateAnonId();

    const usageCheck = await checkAnonymousUsageLimit(anonId);
    if (!usageCheck.allowed) {
      return {
        error: NextResponse.json(
          { error: usageCheck.message, code: 'ANONYMOUS_LIMIT_REACHED' },
          { status: 403 }
        ),
        anonId,
      };
    }

    // Try to get owner key for anonymous users
    const ownerApiKey = process.env.OWNER_OPENAI_API_KEY || process.env.OWNER_GOOGLE_API_KEY;
    if (ownerApiKey) {
      llm = getLLMClient();
      usingOwnerKey = true;
    }
  }

  if (!llm) {
    return {
      error: NextResponse.json(
        { error: 'No AI configuration available. Please try again later.' },
        { status: 503 }
      ),
      anonId,
    };
  }

  // Create a function to record usage after successful request
  const recordUsageAfterSuccess = async () => {
    if (userId && usingOwnerKey) {
      // Authenticated user using owner key
      await recordUsage(userId, requestType);
    } else if (!userId && anonId && usingOwnerKey) {
      // Anonymous user using owner key
      await recordAnonymousUsage(anonId, requestType);
    }
  };

  return {
    context: {
      llm,
      userId,
      anonId,
      isAnonymous: !userId,
      recordUsageAfterSuccess,
    },
    anonId,
  };
}

/**
 * Helper to check if request has valid AI access (without creating client)
 * Both authenticated and anonymous users can have access if owner key is configured
 */
export async function hasAIAccess(): Promise<boolean> {
  // Owner key allows both authenticated and anonymous users
  return !!(
    process.env.OWNER_OPENAI_API_KEY ||
    process.env.OWNER_GOOGLE_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.GOOGLE_API_KEY
  );
}

export { ANON_COOKIE_NAME };
