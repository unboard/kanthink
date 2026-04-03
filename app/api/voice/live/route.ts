import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getUserByokConfigWithError, checkUsageLimit } from '@/lib/usage';

export const runtime = 'nodejs';

/**
 * GET /api/voice/live
 * Returns the Gemini Live API WebSocket URL with API key for
 * direct browser WebSocket connection.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;
  let apiKey: string | null = null;

  // 1. Check BYOK
  const byokResult = await getUserByokConfigWithError(userId);
  if (byokResult.config?.apiKey && byokResult.config?.provider === 'google') {
    apiKey = byokResult.config.apiKey;
  }

  // 2. Check usage quota before using owner key
  if (!apiKey) {
    const usageCheck = await checkUsageLimit(userId);
    if (!usageCheck.allowed) {
      return NextResponse.json({ error: usageCheck.message }, { status: 403 });
    }
    if (process.env.OWNER_GOOGLE_API_KEY) apiKey = process.env.OWNER_GOOGLE_API_KEY;
    else if (process.env.GOOGLE_API_KEY) apiKey = process.env.GOOGLE_API_KEY;
  }

  if (!apiKey) {
    return NextResponse.json({ error: 'No Google API key configured for voice.' }, { status: 400 });
  }

  const model = 'gemini-3.1-flash-live-preview';
  const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`;

  return NextResponse.json({ wsUrl, model });
}
