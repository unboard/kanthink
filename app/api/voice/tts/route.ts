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
    const { text, voice } = await request.json();

    if (!text) {
      return NextResponse.json({ error: 'No text provided' }, { status: 400 });
    }

    // Try OpenAI first
    const openaiResult = await getOpenAIClientForUser(userId);
    if (openaiResult.client) {
      const response = await openaiResult.client.audio.speech.create({
        model: 'tts-1',
        voice: voice || 'nova',
        input: text,
      });
      recordUsage(userId, 'voice-tts').catch(() => {});
      const body = response.body;
      return new NextResponse(body as ReadableStream<Uint8Array>, {
        headers: {
          'Content-Type': 'audio/mpeg',
          'Transfer-Encoding': 'chunked',
        },
      });
    }

    // Try Google/Gemini TTS
    const googleResult = await getGoogleClientForVoice(userId);
    if (googleResult.client) {
      const response = await googleResult.client.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{
          role: 'user',
          parts: [{ text: `Read this text aloud naturally: "${text}"` }],
        }],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: voice || 'Kore',
              },
            },
          },
        },
      });

      // Extract audio data from response
      const candidate = response.candidates?.[0];
      const parts = candidate?.content?.parts || [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const audioPart = parts.find((p: any) => p.inlineData?.mimeType?.startsWith('audio/'));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const inlineData = (audioPart as any)?.inlineData;
      if (inlineData?.data) {
        const audioBuffer = Buffer.from(inlineData.data, 'base64');
        recordUsage(userId, 'voice-tts').catch(() => {});
        return new NextResponse(audioBuffer, {
          headers: { 'Content-Type': inlineData.mimeType || 'audio/wav' },
        });
      }

      return NextResponse.json({ error: 'Gemini did not return audio' }, { status: 500 });
    }

    return NextResponse.json({ error: 'No AI provider configured for voice.' }, { status: 400 });
  } catch (error) {
    console.error('TTS error:', error);
    return NextResponse.json(
      { error: 'Failed to generate speech' },
      { status: 500 }
    );
  }
}
