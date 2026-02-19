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
      // Search for NEW things in this interest area
      return `new breakthroughs trends research 2025 2026 ${ch.name} ${ch.description || ''}`.slice(0, 200);
    }
  }
  // For You: pick a random channel to search — variety over breadth
  const pick = channels[Math.floor(Math.random() * Math.min(channels.length, 4))];
  return `surprising facts trends new research 2025 2026 ${pick.name} ${pick.description || ''}`.slice(0, 200);
}

function buildFeedPrompt(
  channels: ChannelInfo[],
  webResearch: string,
  count: number,
  excludeTitles: string[],
  channelFilter?: string
): LLMMessage[] {
  // Extract just the interest topics — NOT channel metadata
  const interests = channels.map((ch) => {
    return { id: ch.id, name: ch.name, topic: [ch.name, ch.description].filter(Boolean).join(' — ') };
  });

  const interestList = interests.map((i) => `- ${i.topic} [id:${i.id}, name:${i.name}]`).join('\n');

  const systemPrompt = `You generate a personalized discovery feed. The user has these interests:

${interestList}

Your job: find things they DON'T already know. Teach them something new. Surprise them.

CRITICAL RULES:
- NEVER describe or summarize the user's interests back to them ("Did you know mini apps are great?" = BAD)
- NEVER generate generic observations about their topics ("Business ideas are trending" = BAD)
- DO find specific facts, stories, techniques, research, people, tools, or events related to their interests
- Every card should make someone say "oh, I didn't know that" or "that's useful"
- Use the web research data for real, specific, current information
- If no web research available, draw from your knowledge but be SPECIFIC (names, numbers, dates, examples)

Card types:
- "appetizer" (~30%): One specific surprising fact or practical tip. 1-2 sentences of content. Title is punchy (3-6 words).
- "main_course" (~50%): A specific topic explored with real examples. 2-4 short paragraphs. Use ## headers. Include source URLs when available.
- "dessert" (~20%): An unexpected connection between TWO of the user's interest areas. Specific, not vague.

JSON format — respond with ONLY this array:
[{"title":"...","content":"markdown","type":"appetizer|main_course|dessert","sourceChannelId":"id","sourceChannelName":"name","sources":[{"url":"...","title":"..."}],"suggestedCoverImageQuery":"2-3 words"}]

sources can be [] if no real URL. suggestedCoverImageQuery only for main_course. NEVER fabricate URLs.`;

  const userParts: string[] = [];

  if (channelFilter) {
    const ch = channels.find((c) => c.id === channelFilter);
    if (ch) {
      userParts.push(`Focus on discoveries related to: ${ch.name}${ch.description ? ' — ' + ch.description : ''}`);
    }
  }

  if (webResearch) {
    const trimmed = webResearch.slice(0, 3000);
    userParts.push(`## Recent web findings (use these for real facts + URLs)\n${trimmed}`);
  }

  if (excludeTitles.length > 0) {
    userParts.push(`Already shown (skip similar): ${excludeTitles.slice(-15).join(', ')}`);
  }

  userParts.push(`Generate ${count} cards. Be specific and surprising.`);

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
          'Find specific recent news, research, tools, techniques, or stories. Include real URLs. Be specific — names, numbers, examples. Skip generic overviews.'
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
