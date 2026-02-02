import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';
import { auth } from '@/lib/auth';
import { setUserByokConfig } from '@/lib/usage';

interface SaveByokRequest {
  provider: 'openai' | 'google';
  apiKey: string;
  model?: string;
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body: SaveByokRequest = await request.json();
    const { provider, apiKey, model } = body;

    if (!provider || !apiKey) {
      return NextResponse.json(
        { error: 'Missing provider or API key' },
        { status: 400 }
      );
    }

    if (provider !== 'openai' && provider !== 'google') {
      return NextResponse.json(
        { error: 'Invalid provider. Must be "openai" or "google"' },
        { status: 400 }
      );
    }

    // Validate the API key by making a test request
    try {
      if (provider === 'openai') {
        const client = new OpenAI({ apiKey });
        await client.chat.completions.create({
          model: model || 'gpt-5',
          max_completion_tokens: 10,
          messages: [{ role: 'user', content: 'Hi' }],
        });
      } else {
        const client = new GoogleGenAI({ apiKey });
        await client.models.generateContent({
          model: model || 'gemini-2.5-flash',
          contents: [{ role: 'user', parts: [{ text: 'Hi' }] }],
          config: { maxOutputTokens: 10 },
        });
      }
    } catch (validationError) {
      console.error('API key validation failed:', validationError);

      let errorMessage = 'Invalid API key';
      if (validationError instanceof Error) {
        if (validationError.message.includes('401') || validationError.message.includes('invalid_api_key')) {
          errorMessage = 'Invalid API key';
        } else if (validationError.message.includes('429')) {
          errorMessage = 'Rate limited - try again later';
        } else if (validationError.message.includes('model')) {
          errorMessage = 'Invalid model specified';
        } else {
          errorMessage = validationError.message;
        }
      }

      return NextResponse.json(
        { error: errorMessage },
        { status: 400 }
      );
    }

    // Save the encrypted API key to the database
    await setUserByokConfig(userId, {
      provider,
      apiKey,
      model,
    });

    return NextResponse.json({
      success: true,
      provider,
      model: model || null,
    });
  } catch (error) {
    console.error('BYOK save error:', error);
    return NextResponse.json(
      { error: 'Failed to save API key' },
      { status: 500 }
    );
  }
}
