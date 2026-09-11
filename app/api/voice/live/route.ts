import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { resolveProviderKeys } from '@/lib/ai/keys';

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

  // Live voice is Gemini-only, but having an OpenAI key no longer implies not
  // having a Google one — resolveProviderKeys already applies the quota check to
  // shared keys and leaves the user's own key unmetered.
  const { keys, error, quotaExhausted, quotaMessage } = await resolveProviderKeys(userId);
  if (error) {
    return NextResponse.json({ error }, { status: 400 });
  }
  const apiKey = keys.google?.apiKey;
  if (!apiKey) {
    if (quotaExhausted) {
      return NextResponse.json({ error: quotaMessage }, { status: 403 });
    }
    return NextResponse.json(
      { error: 'Live voice needs a Google API key. Add one in Settings → AI.' },
      { status: 400 },
    );
  }

  const model = 'gemini-3.1-flash-live-preview';
  const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`;

  return NextResponse.json({ wsUrl, model });
}
