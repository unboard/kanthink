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
    const formData = await request.formData();
    const audioFile = formData.get('audio') as File | null;

    if (!audioFile) {
      return NextResponse.json({ error: 'No audio file provided' }, { status: 400 });
    }

    const transcription = await result.client.audio.transcriptions.create({
      model: 'whisper-1',
      file: audioFile,
    });

    // Record usage (fire-and-forget)
    recordUsage(userId, 'voice-transcribe').catch(() => {});

    return NextResponse.json({ text: transcription.text });
  } catch (error) {
    console.error('Transcription error:', error);
    return NextResponse.json(
      { error: 'Failed to transcribe audio' },
      { status: 500 }
    );
  }
}
