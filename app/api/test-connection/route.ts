import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

export async function POST(request: Request) {
  try {
    const { provider, apiKey, model } = await request.json();

    if (!provider || !apiKey) {
      return NextResponse.json(
        { success: false, error: 'Missing provider or API key' },
        { status: 400 }
      );
    }

    if (provider === 'anthropic') {
      const client = new Anthropic({ apiKey });
      // Make a minimal request to test the key
      await client.messages.create({
        model: model || 'claude-sonnet-4-20250514',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi' }],
      });
      return NextResponse.json({ success: true, provider: 'anthropic' });
    }

    if (provider === 'openai') {
      const client = new OpenAI({ apiKey });
      // Make a minimal request to test the key
      await client.chat.completions.create({
        model: model || 'gpt-4o',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi' }],
      });
      return NextResponse.json({ success: true, provider: 'openai' });
    }

    return NextResponse.json(
      { success: false, error: 'Unknown provider' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Connection test failed:', error);

    // Extract useful error message
    let errorMessage = 'Connection failed';
    if (error instanceof Error) {
      if (error.message.includes('401') || error.message.includes('invalid_api_key')) {
        errorMessage = 'Invalid API key';
      } else if (error.message.includes('429')) {
        errorMessage = 'Rate limited - try again later';
      } else if (error.message.includes('model')) {
        errorMessage = 'Invalid model specified';
      } else {
        errorMessage = error.message;
      }
    }

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 400 }
    );
  }
}
