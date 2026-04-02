import { NextResponse } from 'next/server';
import { getLLMClientForUser, type LLMMessage, type LLMContentPart } from '@/lib/ai/llm';
import { auth } from '@/lib/auth';
import { recordUsage } from '@/lib/usage';

export const runtime = 'nodejs';

interface ChannelSummary {
  id: string;
  name: string;
  description?: string;
  isBookmarks?: boolean;
  columns: {
    name: string;
    cards: { id: string; title: string; summary?: string; tags?: string[] }[];
  }[];
}

interface OperatorChatRequest {
  message: string;
  imageUrls?: string[];
  history: { role: 'user' | 'assistant'; content: string }[];
  channels: ChannelSummary[];
}

function buildSystemPrompt(channels: ChannelSummary[]): string {
  const channelContext = channels.map((ch) => {
    const cols = ch.columns.map((col) => {
      const cards = col.cards.length > 0
        ? col.cards.map((c) => {
          let desc = `    - ${c.title} (id:${c.id})`;
          if (c.tags?.length) desc += ` [${c.tags.join(', ')}]`;
          if (c.summary) desc += ` — ${c.summary}`;
          return desc;
        }).join('\n')
        : '    (empty)';
      return `  ${col.name} (${col.cards.length}):\n${cards}`;
    }).join('\n');
    const label = ch.isBookmarks ? '🔖' : '📋';
    return `${label} ${ch.name} (channelId:${ch.id})${ch.isBookmarks ? ' [BOOKMARKS CHANNEL]' : ''}${ch.description ? ` — ${ch.description}` : ''}\n${cols}`;
  }).join('\n\n');

  const totalCards = channels.reduce(
    (sum, ch) => sum + ch.columns.reduce((s, col) => s + col.cards.length, 0), 0
  );

  return `You are Kan, the AI operator for Kanthink — a smart Kanban workspace.

You are the user's central hub. They come to you to:
- Ask questions about anything across their channels and cards
- Get suggestions on what to work on next
- Think through ideas and get feedback
- Route new information to the right channel
- Get summaries and overviews of their workspace

## YOUR WORKSPACE (${channels.length} channels, ${totalCards} cards)

${channelContext || '(No channels yet)'}

## KAN BOOKMARKS

The channel marked [BOOKMARKS CHANNEL] is "Kan Bookmarks" — a special system channel where users save links, articles, and snippets from the web. When the user asks "what's in my bookmarks?" or "what have I saved?", look at this channel's cards. It's different from regular channels — it's a personal knowledge capture tool, not a project workspace.

## HOW TO RESPOND

- Be conversational, warm, and concise. You're a smart collaborator, not a formal assistant.
- When referencing cards or channels, be specific — name them and ALWAYS link them.
- If the user shares an idea, help them think it through. Suggest which channel it might belong in.
- If asked "what should I work on?", look at cards across channels and suggest priorities.
- If asked about a specific topic, search across all channels for relevant cards.
- Use markdown for formatting. Keep responses focused — 2-4 paragraphs max unless they ask for detail.
- Don't list every card unless asked. Summarize and highlight what's important.
- If you don't know something that isn't in the workspace data, say so honestly.

## LINKING — CRITICAL

ALWAYS use clickable kanthink:// links when mentioning specific cards or channels from the workspace data:
- Cards: [Card Title](kanthink://card/CARD_ID) — use the id shown as "id:XXX" in the data above
- Channels: [Channel Name](kanthink://channel/CHANNEL_ID) — use the channelId shown as "channelId:XXX" in the data above

Rules:
- ONLY link things that have a real ID in the workspace data above. Never create links to generic concepts, features, or abstract ideas.
- If you mention a card or channel that exists in the data, ALWAYS link it with its actual ID.
- Do NOT create markdown links with empty hrefs, anchors (#), or made-up URLs. If something doesn't have an ID in the data, just use plain bold text instead.
- Never use regular http:// URLs for internal Kanthink references — always use kanthink:// protocol.

## RESPONSE FORMAT

Respond with valid JSON:
{
  "response": "Your message (markdown supported with kanthink:// links)"
}

Always respond with valid JSON. The "response" field is required.`;
}

function parseResponse(raw: string): { response: string } {
  try {
    let json = raw.trim();
    if (json.startsWith('```json')) json = json.slice(7);
    else if (json.startsWith('```')) json = json.slice(3);
    if (json.endsWith('```')) json = json.slice(0, -3);
    json = json.trim();

    const parsed = JSON.parse(json);
    if (typeof parsed.response === 'string') {
      return { response: parsed.response };
    }
  } catch {
    // Fall through to plain text
  }
  return { response: raw };
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: OperatorChatRequest = await request.json();
    const { message, imageUrls, history, channels } = body;

    if (!message && (!imageUrls || imageUrls.length === 0)) {
      return NextResponse.json({ error: 'Missing message' }, { status: 400 });
    }

    const result = await getLLMClientForUser(session.user.id);
    if (!result.client) {
      return NextResponse.json(
        { error: result.error || 'No AI access available.' },
        { status: 403 },
      );
    }

    const llm = result.client;
    const usingOwnerKey = result.source === 'owner';

    const messages: LLMMessage[] = [
      { role: 'system', content: buildSystemPrompt(channels) },
    ];

    // Add conversation history (last 20 messages)
    const recentHistory = history.slice(-20);
    for (const msg of recentHistory) {
      messages.push({ role: msg.role, content: msg.content });
    }

    // Add current message
    if (imageUrls && imageUrls.length > 0) {
      const parts: LLMContentPart[] = [];
      if (message) parts.push({ type: 'text', text: message });
      for (const url of imageUrls) {
        parts.push({ type: 'image_url', image_url: { url } });
      }
      messages.push({ role: 'user', content: parts });
    } else {
      messages.push({ role: 'user', content: message });
    }

    const llmResponse = await llm.complete(messages);

    if (usingOwnerKey) {
      await recordUsage(session.user.id, 'operator-chat');
    }

    const parsed = parseResponse(llmResponse.content);

    return NextResponse.json(parsed);
  } catch (error) {
    console.error('Operator chat error:', error);
    return NextResponse.json({ error: 'Failed to get AI response' }, { status: 500 });
  }
}
