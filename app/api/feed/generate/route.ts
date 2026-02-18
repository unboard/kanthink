import { NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { marked } from 'marked';
import { auth } from '@/lib/auth';
import { getLLMClientForUser, getLLMClient, type LLMMessage } from '@/lib/ai/llm';
import { recordUsage, checkUsageLimit } from '@/lib/usage';
import type { FeedCard, FeedCardType } from '@/lib/types';

marked.setOptions({ breaks: true, gfm: true });

interface ChannelInfo {
  id: string;
  name: string;
  description: string;
  aiInstructions: string;
}

interface GenerateFeedRequest {
  channels: ChannelInfo[];
  channelFilter?: string;      // channelId or omitted for "For You"
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

function buildSearchQueries(channels: ChannelInfo[], channelFilter?: string): string[] {
  if (channelFilter) {
    const ch = channels.find((c) => c.id === channelFilter);
    if (ch) {
      const topic = [ch.name, ch.description, ch.aiInstructions].filter(Boolean).join(' ').slice(0, 200);
      return [topic];
    }
  }
  // For You: pick up to 3 most descriptive channels
  const sorted = [...channels]
    .filter((c) => c.description || c.aiInstructions)
    .sort((a, b) => {
      const aLen = (a.description?.length || 0) + (a.aiInstructions?.length || 0);
      const bLen = (b.description?.length || 0) + (b.aiInstructions?.length || 0);
      return bLen - aLen;
    })
    .slice(0, 3);
  return sorted.map((ch) =>
    [ch.name, ch.description, ch.aiInstructions].filter(Boolean).join(' ').slice(0, 200)
  );
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
      if (ch.description) parts.push(`  Description: ${ch.description}`);
      if (ch.aiInstructions) parts.push(`  Focus: ${ch.aiInstructions}`);
      return parts.join('\n');
    })
    .join('\n');

  const systemPrompt = `You are Kan, an AI learning assistant that generates personalized feed content. You create three types of content cards:

**appetizer** (30% of cards): Quick bites - 1-2 paragraphs. A single insight, fact, or tip. Think "TIL" or "Quick tip". Titles are catchy and short (3-6 words).

**main_course** (50% of cards): Deep dives - 3-6 paragraphs with markdown headers (##), examples, and practical application. Substantial enough to learn something real. Include source URLs when available. Titles are descriptive (5-10 words).

**dessert** (20% of cards): Cross-topic connections - 2-3 paragraphs connecting ideas from different channel topics unexpectedly. "Did you know X from [Channel A] relates to Y from [Channel B]?" Sparks curiosity. Titles hint at the connection.

Each card MUST include:
- "title": concise, engaging title
- "content": markdown-formatted content (appropriate depth for the type)
- "type": one of "appetizer", "main_course", "dessert"
- "sourceChannelId": the channel ID that inspired this card
- "sourceChannelName": that channel's name
- "sources": array of {"url": "...", "title": "..."} from web research (can be empty for appetizers)
- "suggestedCoverImageQuery": 2-3 word search query for a cover photo (only for main_course cards)

Use ONLY real URLs from the web research data. NEVER fabricate URLs.
Content should be factual, current, and genuinely interesting.
Write in a warm, engaging tone — informative but not academic.

Respond with ONLY a JSON array:
[{"title": "...", "content": "...", "type": "...", "sourceChannelId": "...", "sourceChannelName": "...", "sources": [...], "suggestedCoverImageQuery": "..."}]`;

  const userParts: string[] = [];

  userParts.push(`## User's Channels\n${channelContext}`);

  if (channelFilter) {
    const ch = channels.find((c) => c.id === channelFilter);
    if (ch) {
      userParts.push(`## Focus: Generate content specifically about "${ch.name}"`);
    }
  }

  if (webResearch) {
    userParts.push(`## Web Research (real, current data)\nIMPORTANT: Use ONLY real URLs below. Never invent URLs.\n\n${webResearch}`);
  }

  if (excludeTitles.length > 0) {
    userParts.push(`## Already Shown (avoid similar topics)\n${excludeTitles.slice(-30).join(', ')}`);
  }

  userParts.push(`## Task\nGenerate exactly ${count} feed cards. Mix: ~30% appetizer, ~50% main_course, ~20% dessert. Make them genuinely interesting and varied.`);

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userParts.join('\n\n') },
  ];
}

function parseResponse(content: string): RawFeedCard[] {
  try {
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item) =>
        item &&
        typeof item.title === 'string' &&
        typeof item.content === 'string' &&
        typeof item.type === 'string'
    );
  } catch {
    return [];
  }
}

function buildCoverImageUrl(query?: string): string | undefined {
  if (!query) return undefined;
  const encoded = encodeURIComponent(query.trim());
  return `https://source.unsplash.com/800x400/?${encoded}`;
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body: GenerateFeedRequest = await request.json();
    const { channels, channelFilter, count = 15, excludeTitles = [] } = body;

    if (!channels || channels.length === 0) {
      return NextResponse.json({ error: 'No channels provided' }, { status: 400 });
    }

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

    // Web search phase
    let webResearch = '';
    if (llm.webSearch) {
      const queries = buildSearchQueries(channels, channelFilter);
      const searchResults: string[] = [];

      for (const query of queries) {
        try {
          const searchResult = await llm.webSearch(
            `Latest interesting facts, insights, and developments about: ${query}`,
            'Search for current, factual information. Return URLs, titles, key facts, and interesting insights. Focus on recent developments and practical knowledge.'
          );
          if (searchResult.content) {
            searchResults.push(searchResult.content);
          }
        } catch (e) {
          console.warn('Feed web search failed for query:', e);
        }
      }

      webResearch = searchResults.join('\n\n---\n\n');
    }

    // Build prompt and generate
    const messages = buildFeedPrompt(channels, webResearch, count, excludeTitles, channelFilter);

    try {
      const llmResponse = await llm.complete(messages);
      const rawCards = parseResponse(llmResponse.content);

      if (rawCards.length === 0) {
        return NextResponse.json({ cards: [] });
      }

      // Convert to FeedCard objects
      const feedCards: FeedCard[] = rawCards.map((raw) => ({
        id: nanoid(),
        title: raw.title,
        content: markdownToHtml(raw.content),
        type: raw.type as FeedCardType,
        sourceChannelId: raw.sourceChannelId || channels[0].id,
        sourceChannelName: raw.sourceChannelName || channels[0].name,
        sources: Array.isArray(raw.sources) ? raw.sources.filter((s) => s.url && s.title) : [],
        coverImageUrl: raw.type === 'main_course' ? buildCoverImageUrl(raw.suggestedCoverImageQuery) : undefined,
        createdAt: new Date().toISOString(),
      }));

      // Record usage
      if (usingOwnerKey) {
        await recordUsage(userId, 'feed-generate');
      }

      return NextResponse.json({ cards: feedCards });
    } catch (llmError) {
      console.error('Feed LLM error:', llmError);

      // Retry once
      try {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const retryResponse = await llm.complete(messages);
        const rawCards = parseResponse(retryResponse.content);

        const feedCards: FeedCard[] = rawCards.map((raw) => ({
          id: nanoid(),
          title: raw.title,
          content: markdownToHtml(raw.content),
          type: raw.type as FeedCardType,
          sourceChannelId: raw.sourceChannelId || channels[0].id,
          sourceChannelName: raw.sourceChannelName || channels[0].name,
          sources: Array.isArray(raw.sources) ? raw.sources.filter((s) => s.url && s.title) : [],
          coverImageUrl: raw.type === 'main_course' ? buildCoverImageUrl(raw.suggestedCoverImageQuery) : undefined,
          createdAt: new Date().toISOString(),
        }));

        if (usingOwnerKey) {
          await recordUsage(userId, 'feed-generate');
        }

        return NextResponse.json({ cards: feedCards });
      } catch (retryError) {
        console.error('Feed LLM retry failed:', retryError);
      }

      return NextResponse.json({ cards: [] });
    }
  } catch (error) {
    console.error('Feed generate error:', error);
    return NextResponse.json({ error: 'Failed to generate feed' }, { status: 500 });
  }
}
