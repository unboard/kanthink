import { NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { marked } from 'marked';
import { auth } from '@/lib/auth';
import { getLLMClientForUser, type LLMMessage } from '@/lib/ai/llm';
import { recordUsage } from '@/lib/usage';
import type { FeedCard, FeedCardType } from '@/lib/types';

export const maxDuration = 30;

marked.setOptions({ breaks: true, gfm: true });

interface ChannelInfo {
  id: string;
  name: string;
  description: string;
  aiInstructions: string;
}

interface GenerateFeedRequest {
  channels: ChannelInfo[];
  channelFilter?: string;
  count: number;
  excludeTitles: string[];
}

interface RawFeedCard {
  title: string;
  content: string;
  type: FeedCardType;
  sourceChannelId: string;
  sourceChannelName: string;
  sources: { url: string; title: string }[];
  suggestedCoverImageQuery?: string;
}

function markdownToHtml(markdown: string): string {
  try {
    const unescaped = markdown.replace(/\\n/g, '\n');
    const html = marked.parse(unescaped);
    return typeof html === 'string' ? html : markdown;
  } catch {
    return markdown;
  }
}

function buildFeedPrompt(
  channels: ChannelInfo[],
  count: number,
  excludeTitles: string[],
  channelFilter?: string
): LLMMessage[] {
  const interests = channels.map((ch) => {
    return { id: ch.id, name: ch.name, topic: [ch.name, ch.description].filter(Boolean).join(' — ') };
  });

  const interestList = interests.map((i) => `- ${i.topic} [id:${i.id}, name:${i.name}]`).join('\n');

  const systemPrompt = `You generate a discovery feed. The user's interests:

${interestList}

Your job: teach them something NEW they don't already know. Surprise them with specific facts, techniques, stories, tools, or research related to their interests.

RULES:
- NEVER summarize their interests back ("Did you know X is great?" = BAD)
- NEVER generate generic observations ("X is trending" = BAD)
- BE SPECIFIC: names, numbers, dates, real examples
- Every card = "oh, I didn't know that" or "that's useful"
- sources array should be [] (no web data available)
- suggestedCoverImageQuery only for main_course type

Card types:
- "appetizer" (~30%): One surprising fact or tip. 1-2 sentences. Punchy title.
- "main_course" (~50%): Specific topic with examples. 2-3 short paragraphs. Use ## headers.
- "dessert" (~20%): Unexpected connection between TWO of their interests. Specific.

Respond ONLY with a JSON array:
[{"title":"...","content":"markdown","type":"appetizer|main_course|dessert","sourceChannelId":"id","sourceChannelName":"name","sources":[],"suggestedCoverImageQuery":"2-3 words"}]`;

  const userParts: string[] = [];

  if (channelFilter) {
    const ch = channels.find((c) => c.id === channelFilter);
    if (ch) {
      userParts.push(`Focus on: ${ch.name}${ch.description ? ' — ' + ch.description : ''}`);
    }
  }

  if (excludeTitles.length > 0) {
    userParts.push(`Skip similar to: ${excludeTitles.slice(-10).join(', ')}`);
  }

  userParts.push(`Generate ${count} cards.`);

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userParts.join('\n\n') },
  ];
}

function parseResponse(content: string): RawFeedCard[] {
  try {
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.warn('Feed: No JSON array found in response');
      return [];
    }
    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) return [];

    const validTypes = new Set(['appetizer', 'main_course', 'dessert']);
    return parsed
      .filter(
        (item) =>
          item &&
          typeof item.title === 'string' &&
          typeof item.content === 'string' &&
          typeof item.type === 'string'
      )
      .map((item) => ({
        ...item,
        type: validTypes.has(item.type) ? item.type : 'appetizer',
        sources: Array.isArray(item.sources) ? item.sources : [],
      }));
  } catch (e) {
    console.warn('Feed: Failed to parse response:', e);
    return [];
  }
}

function buildCoverImageUrl(query?: string): string | undefined {
  if (!query) return undefined;
  const encoded = encodeURIComponent(query.trim());
  return `https://source.unsplash.com/800x400/?${encoded}`;
}

function toFeedCards(rawCards: RawFeedCard[], channels: ChannelInfo[]): FeedCard[] {
  return rawCards.map((raw) => ({
    id: nanoid(),
    title: raw.title,
    content: markdownToHtml(raw.content),
    type: raw.type as FeedCardType,
    sourceChannelId: raw.sourceChannelId || channels[0]?.id || '',
    sourceChannelName: raw.sourceChannelName || channels[0]?.name || '',
    sources: raw.sources.filter((s) => s && s.url && s.title),
    coverImageUrl: raw.type === 'main_course' ? buildCoverImageUrl(raw.suggestedCoverImageQuery) : undefined,
    createdAt: new Date().toISOString(),
  }));
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body: GenerateFeedRequest = await request.json();
    const { channels, channelFilter, count = 5, excludeTitles = [] } = body;

    if (!channels || channels.length === 0) {
      return NextResponse.json({ error: 'No channels provided' }, { status: 400 });
    }

    const safeCount = Math.min(count, 8);

    // Get LLM client
    const result = await getLLMClientForUser(userId);
    if (!result.client) {
      return NextResponse.json(
        { error: result.error || 'No AI access available' },
        { status: 403 }
      );
    }
    const llm = result.client;
    const usingOwnerKey = result.source === 'owner';

    // Single LLM call — no web search (too expensive for a feed)
    const messages = buildFeedPrompt(channels, safeCount, excludeTitles, channelFilter);

    try {
      const llmResponse = await llm.complete(messages);
      const rawCards = parseResponse(llmResponse.content);

      if (rawCards.length === 0) {
        console.warn('Feed: LLM returned 0 parseable cards');
        return NextResponse.json({ cards: [] });
      }

      const feedCards = toFeedCards(rawCards, channels);

      if (usingOwnerKey) {
        recordUsage(userId, 'feed-generate').catch(() => {});
      }

      return NextResponse.json({ cards: feedCards });
    } catch (llmError) {
      console.error('Feed LLM error:', llmError);
      return NextResponse.json({ cards: [], error: 'Generation failed' });
    }
  } catch (error) {
    console.error('Feed generate error:', error);
    return NextResponse.json({ error: 'Failed to generate feed' }, { status: 500 });
  }
}
