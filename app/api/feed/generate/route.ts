import { NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { marked } from 'marked';
import { auth } from '@/lib/auth';
import { getLLMClientForUser, type LLMMessage } from '@/lib/ai/llm';
import { recordUsage } from '@/lib/usage';
import type { FeedCard, FeedCardType } from '@/lib/types';

// Allow up to 60s for web search + LLM generation
export const maxDuration = 60;

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

function buildSearchQuery(channels: ChannelInfo[], channelFilter?: string): string {
  if (channelFilter) {
    const ch = channels.find((c) => c.id === channelFilter);
    if (ch) {
      return [ch.name, ch.description].filter(Boolean).join(': ').slice(0, 200);
    }
  }
  // For You: combine top channel names into one query
  const topChannels = channels.slice(0, 4).map((ch) => ch.name);
  return `Latest insights about: ${topChannels.join(', ')}`;
}

function buildFeedPrompt(
  channels: ChannelInfo[],
  webResearch: string,
  count: number,
  excludeTitles: string[],
  channelFilter?: string
): LLMMessage[] {
  const channelContext = channels
    .map((ch) => {
      const parts = [`- **${ch.name}**`];
      if (ch.description) parts.push(`: ${ch.description}`);
      if (ch.aiInstructions) parts.push(` (Focus: ${ch.aiInstructions.slice(0, 100)})`);
      return parts.join('');
    })
    .join('\n');

  const systemPrompt = `You are Kan, an AI that generates a personalized learning feed. Output a JSON array of ${count} cards.

3 card types (mix them):
- "appetizer" (~30%): 1-2 short paragraphs. A single insight/fact/tip. Short catchy title.
- "main_course" (~50%): 3-5 paragraphs with ## headers and examples. Include sources when available.
- "dessert" (~20%): 2-3 paragraphs connecting ideas across different topics. Sparks curiosity.

Each card object:
{"title":"...","content":"markdown text","type":"appetizer|main_course|dessert","sourceChannelId":"...","sourceChannelName":"...","sources":[{"url":"...","title":"..."}],"suggestedCoverImageQuery":"2-3 words"}

Rules:
- sources array can be empty if no real URL available
- suggestedCoverImageQuery only needed for main_course
- ONLY use real URLs from the web research section — never fabricate URLs
- Keep content concise but substantive
- Respond with ONLY the JSON array, no other text`;

  const userParts: string[] = [];
  userParts.push(`## Channels\n${channelContext}`);

  if (channelFilter) {
    const ch = channels.find((c) => c.id === channelFilter);
    if (ch) userParts.push(`Focus on "${ch.name}" content.`);
  }

  if (webResearch) {
    // Trim web research to avoid blowing up the prompt
    const trimmed = webResearch.slice(0, 3000);
    userParts.push(`## Web Research\n${trimmed}`);
  }

  if (excludeTitles.length > 0) {
    userParts.push(`Avoid these topics: ${excludeTitles.slice(-15).join(', ')}`);
  }

  userParts.push(`Generate ${count} cards as a JSON array.`);

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
    const { channels, channelFilter, count = 8, excludeTitles = [] } = body;

    if (!channels || channels.length === 0) {
      return NextResponse.json({ error: 'No channels provided' }, { status: 400 });
    }

    // Cap count to avoid token overflow (4096 output tokens ≈ 8-10 cards max)
    const safeCount = Math.min(count, 10);

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

    // Web search phase: single search with a timeout to avoid blocking
    let webResearch = '';
    if (llm.webSearch) {
      const query = buildSearchQuery(channels, channelFilter);
      try {
        const searchPromise = llm.webSearch(
          query,
          'Return factual information with real URLs. Be concise.'
        );
        // Race with a 10-second timeout — don't let web search block generation
        const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 10000));
        const searchResult = await Promise.race([searchPromise, timeoutPromise]);
        if (searchResult && searchResult.content) {
          webResearch = searchResult.content;
        }
      } catch (e) {
        console.warn('Feed web search failed, proceeding without:', e);
      }
    }

    // Build prompt and generate
    const messages = buildFeedPrompt(channels, webResearch, safeCount, excludeTitles, channelFilter);

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
