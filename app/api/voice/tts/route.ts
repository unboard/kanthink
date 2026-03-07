import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getOpenAIClientForUser } from '@/lib/ai/openai-client';
import { recordUsage } from '@/lib/usage';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;
  const result = await getOpenAIClientForUser(userId);

  if (!result.client) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  try {
    const { text, voice } = await request.json();

    if (!text) {
      return NextResponse.json({ error: 'No text provided' }, { status: 400 });
    }

    const response = await result.client.audio.speech.create({
      model: 'tts-1',
      voice: voice || 'nova',
      input: text,
    });

    // Record usage (fire-and-forget)
    recordUsage(userId, 'voice-tts').catch(() => {});

    // Stream the audio response directly from OpenAI
    const body = response.body;
    return new NextResponse(body as ReadableStream<Uint8Array>, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Transfer-Encoding': 'chunked',
      },
    });
  } catch (error) {
    console.error('TTS error:', error);
    return NextResponse.json(
      { error: 'Failed to generate speech' },
      { status: 500 }
    );
  }
}
