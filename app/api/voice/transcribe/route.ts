import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getOpenAIClientForUser } from '@/lib/ai/openai-client';
import { getGoogleClientForVoice } from '@/lib/ai/google-voice';
import { recordUsage } from '@/lib/usage';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;

  try {
    const formData = await request.formData();
    const audioFile = formData.get('audio') as File | null;

    if (!audioFile) {
      return NextResponse.json({ error: 'No audio file provided' }, { status: 400 });
    }

    // Try OpenAI first
    const openaiResult = await getOpenAIClientForUser(userId);
    if (openaiResult.client) {
      const transcription = await openaiResult.client.audio.transcriptions.create({
        model: 'whisper-1',
        file: audioFile,
      });
      recordUsage(userId, 'voice-transcribe').catch(() => {});
      return NextResponse.json({ text: transcription.text });
    }

    // Try Google/Gemini
    const googleResult = await getGoogleClientForVoice(userId);
    if (googleResult.client) {
      const arrayBuffer = await audioFile.arrayBuffer();
      const base64Audio = Buffer.from(arrayBuffer).toString('base64');
      const mimeType = audioFile.type || 'audio/webm';

      const response = await googleResult.client.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{
          role: 'user',
          parts: [
            { inlineData: { mimeType, data: base64Audio } },
            { text: 'Transcribe the audio above. Return ONLY the transcribed text, nothing else. No quotes, no explanation, no prefixes.' },
          ],
        }],
      });

      const text = response.text?.trim() || '';
      recordUsage(userId, 'voice-transcribe').catch(() => {});
      return NextResponse.json({ text });
    }

    return NextResponse.json({ error: 'No AI provider configured for voice.' }, { status: 400 });
  } catch (error) {
    console.error('Transcription error:', error);
    return NextResponse.json(
      { error: 'Failed to transcribe audio' },
      { status: 500 }
    );
  }
}
