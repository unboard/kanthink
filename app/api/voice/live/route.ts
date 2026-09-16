import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { auth } from '@/lib/auth';
import { resolveProviderKeys } from '@/lib/ai/keys';
import { LIVE_PROVIDERS, isLiveProvider, type LiveProvider } from '@/lib/voice/liveProviders';

export const runtime = 'nodejs';

/** The live model each provider connects to. */
const LIVE_MODELS: Record<LiveProvider, string> = {
  google: 'gemini-3.1-flash-live-preview',
  // gpt-live-1 is OpenAI's model for natural, expressive voice conversation, as
  // distinct from the gpt-realtime-* reasoning models. Voice mode here is a
  // conversation with tools, not a reasoning session, so this is the right one.
  openai: 'gpt-live-1',
};

/**
 * GET /api/voice/live?provider=google|openai
 *
 * Hands the browser what it needs to open a live-voice socket directly.
 *
 * The two providers authenticate differently and the difference matters. Gemini
 * takes the API key in the URL, so the key itself goes to the browser — acceptable
 * only because it is the same key the client already uses for live voice and
 * Google's live endpoint offers nothing else. OpenAI mints a short-lived ephemeral
 * secret instead, so the real key never leaves the server; the browser passes the
 * ephemeral one through the WebSocket subprotocol, because a browser cannot set an
 * Authorization header on a WebSocket and OpenAI rejects credentials in the query
 * string outright.
 *
 * The session is deliberately minted almost empty. Instructions and tool
 * declarations are built client-side from the live board state and run to tens of
 * kilobytes; sending them through a `session.update` on connect keeps this route
 * from having to know any of it.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const requested = new URL(request.url).searchParams.get('provider');
  const provider: LiveProvider = isLiveProvider(requested) ? requested : 'google';

  // Having a key for one provider no longer implies not having the other — the
  // quota check already applies to shared keys and leaves a user's own unmetered.
  const { keys, error, quotaExhausted, quotaMessage } = await resolveProviderKeys(session.user.id);
  if (error) {
    return NextResponse.json({ error }, { status: 400 });
  }

  const apiKey = keys[provider]?.apiKey;
  if (!apiKey) {
    if (quotaExhausted) {
      return NextResponse.json({ error: quotaMessage }, { status: 403 });
    }
    const name = provider === 'openai' ? 'OpenAI' : 'Google';
    return NextResponse.json(
      { error: `${LIVE_PROVIDERS[provider].label} needs a ${name} API key. Add one in Settings → AI.` },
      { status: 400 },
    );
  }

  const model = LIVE_MODELS[provider];

  if (provider === 'openai') {
    try {
      const client = new OpenAI({ apiKey });
      const secret = await client.realtime.clientSecrets.create({
        session: { type: 'realtime', model },
        // Long enough to cover a slow connect on a bad phone signal, short enough
        // that a leaked one is worthless. The session itself outlives the secret.
        expires_after: { anchor: 'created_at', seconds: 120 },
      });

      return NextResponse.json({
        provider,
        model,
        wsUrl: `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`,
        clientSecret: secret.value,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not start an OpenAI voice session';
      console.error('[voice/live] OpenAI session mint failed:', message);
      return NextResponse.json({ error: message }, { status: 502 });
    }
  }

  return NextResponse.json({
    provider,
    model,
    wsUrl: `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`,
  });
}
