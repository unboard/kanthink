import { NextResponse } from 'next/server';
import { createLLMClient } from '@/lib/ai/llm';
import type { LLMMessage } from '@/lib/ai/providers/types';
import { buildCampaignPrompt } from '@/lib/snailblast/prompt';
import { emptyCampaign, type CampaignState } from '@/lib/snailblast/campaign';
import { derivePanel } from '@/lib/snailblast/panels';
import { parseCampaignReply } from '@/lib/snailblast/parse';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_MESSAGES = 60;
const MAX_CHARS = 4000;

interface ChatRequest {
  messages: { role: 'user' | 'assistant'; content: string }[];
  state?: CampaignState;
}

/** Matches the mcs-chat resolution order: owner OpenAI key first, Google as fallback. */
function resolveClient() {
  if (process.env.OWNER_OPENAI_API_KEY) {
    return createLLMClient({ provider: 'openai', apiKey: process.env.OWNER_OPENAI_API_KEY, model: 'gpt-4.1' });
  }
  if (process.env.OPENAI_API_KEY) {
    return createLLMClient({ provider: 'openai', apiKey: process.env.OPENAI_API_KEY, model: 'gpt-4.1' });
  }
  const google = process.env.OWNER_GOOGLE_API_KEY || process.env.GOOGLE_API_KEY;
  if (google) {
    return createLLMClient({ provider: 'google', apiKey: google, model: 'gemini-2.5-flash' });
  }
  return null;
}

export async function POST(req: Request) {
  let body: ChatRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const messages = Array.isArray(body.messages) ? body.messages.slice(-MAX_MESSAGES) : [];
  if (messages.length === 0) {
    return NextResponse.json({ error: 'No messages provided' }, { status: 400 });
  }
  if (messages.some((m) => typeof m.content !== 'string' || m.content.length > MAX_CHARS)) {
    return NextResponse.json({ error: 'Message too long' }, { status: 400 });
  }

  const client = resolveClient();
  if (!client) {
    return NextResponse.json({ error: 'No AI provider configured.' }, { status: 503 });
  }

  const state = body.state ?? emptyCampaign();

  const llmMessages: LLMMessage[] = [
    { role: 'system', content: buildCampaignPrompt(state) },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  try {
    const response = await client.complete(llmMessages, { maxTokens: 900 });

    const parsed = parseCampaignReply(response.content);

    if (!parsed.reply || typeof parsed.reply !== 'string') {
      return NextResponse.json({ error: 'Empty response from model' }, { status: 502 });
    }

    return NextResponse.json({
      reply: parsed.reply,
      updates: parsed.updates ?? null,
      panel: derivePanel(
        parsed.panel,
        parsed.reply,
        state,
        parsed.updates,
        [...messages].reverse().find((m) => m.role === 'user')?.content ?? ''
      ),
      chips: Array.isArray(parsed.chips) ? parsed.chips.slice(0, 3) : [],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Chat failed';
    console.error('[SnailBlast chat]', message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
