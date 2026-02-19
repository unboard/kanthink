import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { marked } from 'marked';
import type { Channel, Card, CardInput, Column } from '@/lib/types';
import { getLLMClientForUser, getLLMClient, type LLMMessage } from '@/lib/ai/llm';
import { auth } from '@/lib/auth';
import { recordUsage, checkAnonymousUsageLimit, recordAnonymousUsage } from '@/lib/usage';
import { createNotification } from '@/lib/notifications/createNotification';

const ANON_COOKIE_NAME = 'kanthink_anon_id';

// Configure marked for safe HTML output
marked.setOptions({
  breaks: true,  // Convert \n to <br>
  gfm: true,     // GitHub Flavored Markdown
});

// Stub ideas for fallback when no LLM is configured
const STUB_IDEAS = [
  'Try a new approach to this',
  'Consider the opposite perspective',
  'What if we simplified this?',
  'Explore related concepts',
  'Break this into smaller parts',
  'Look for patterns here',
  'Ask why three times',
  'Combine two unrelated ideas',
  'What would an expert do?',
  'Start from first principles',
];

function getRandomIdeas(count: number): string[] {
  const shuffled = [...STUB_IDEAS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function detectWebSearchIntent(instructions: string): boolean {
  if (!instructions) return false;
  const lower = instructions.toLowerCase();
  const webKeywords = [
    'youtube', 'video', 'link', 'url', 'website', 'webpage',
    'search for', 'find online', 'look up', 'browse',
    'article', 'blog post', 'podcast', 'episode',
    'reddit', 'twitter', 'github', 'stack overflow',
    'http', 'www', '.com', '.org', '.io',
  ];
  return webKeywords.some(kw => lower.includes(kw));
}

function buildColumnContext(
  channel: Channel,
  allCards: Record<string, Card>,
  targetColumnId: string
): string {
  let context = '';
  const includeBackside = channel.includeBacksideInAI ?? false;

  for (const column of channel.columns) {
    const isTarget = column.id === targetColumnId;

    // Get front-side cards in this column
    const columnCards = column.cardIds
      .map((id) => allCards[id])
      .filter(Boolean);

    // Get backside cards if enabled
    const backsideCards = includeBackside
      ? (column.backsideCardIds ?? []).map((id) => allCards[id]).filter(Boolean)
      : [];

    // Skip empty columns UNLESS it's the target column
    if (columnCards.length === 0 && backsideCards.length === 0 && !isTarget) continue;

    // Column header with target indicator
    context += `\n\n### ${column.name}${isTarget ? ' (generating here)' : ''}`;

    // Front-side cards
    if (columnCards.length > 0) {
      for (const card of columnCards) {
        context += `\n- ${card.title}`;
        // Use summary or first message content
        if (card.summary) {
          context += `: ${card.summary.slice(0, 150)}`;
        } else if (card.messages && card.messages.length > 0) {
          context += `: ${card.messages[0].content.slice(0, 150)}`;
        }
      }
    } else if (isTarget) {
      context += '\n(empty - new column)';
    }

    // Backside cards (completed)
    if (backsideCards.length > 0) {
      context += '\n\nCompleted:';
      for (const card of backsideCards) {
        context += `\n- ${card.title}`;
      }
    }
  }

  return context;
}

function buildPrompt(
  channel: Channel,
  targetColumn: Column,
  count: number,
  allCards: Record<string, Card>,
  systemInstructions?: string
): LLMMessage[] {
  // SYSTEM PROMPT: Output format with content quality guidance
  const systemPrompt = `Generate ${count} cards as a JSON array.

Each card has:
- "title": concise (1-8 words)
- "content": detailed markdown-formatted content (2-4 paragraphs minimum)

Content Guidelines:
- Write substantively - explain each idea thoroughly
- Use markdown: **bold**, *italics*, bullet lists, numbered lists, headers (##)
- Include context, rationale, implications, or examples as appropriate
- Aim for 150-400 words per card - depth matters for planning/brainstorming
- Each card should stand alone as a complete thought
- If web research data is provided, use ONLY real URLs from that data — NEVER fabricate or guess URLs

Respond with ONLY the JSON array:
[{"title": "Card Title", "content": "## Overview\\n\\nDetailed explanation of the idea...\\n\\n## Key Points\\n\\n- First important point\\n- Second important point\\n\\nFurther elaboration and context."}]`;

  // USER PROMPT: Context → Board State → TASK (column instructions LAST for max attention)
  const userParts: string[] = [];

  // 1. Background context (channel info, system guidance)
  let contextSection = `## Context\nChannel: ${channel.name}`;
  if (channel.description) {
    contextSection += `\n${channel.description}`;
  }
  if (systemInstructions?.trim()) {
    contextSection += `\n\nGeneral guidance:\n${systemInstructions.trim()}`;
  }
  if (channel.aiInstructions?.trim()) {
    contextSection += `\n\nChannel focus:\n${channel.aiInstructions.trim()}`;
  }
  userParts.push(contextSection);

  // 2. Board state (reference, shows what exists)
  const boardState = buildColumnContext(channel, allCards, targetColumn.id);
  if (boardState) {
    userParts.push(`## Current Board${boardState}`);
  }

  // 3. THE TASK - Column instructions LAST for maximum attention
  let taskSection = `## Your Task\nGenerate ${count} cards for the "${targetColumn.name}" column.`;
  if (targetColumn.instructions?.trim()) {
    taskSection += `\n\n**Column Instructions:**\n${targetColumn.instructions.trim()}`;
  }
  userParts.push(taskSection);

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userParts.join('\n\n') },
  ];
}

function markdownToHtml(markdown: string): string {
  try {
    // Handle escaped newlines from JSON
    const unescaped = markdown.replace(/\\n/g, '\n');
    const html = marked.parse(unescaped);
    // marked.parse returns string | Promise<string>, but with sync options it's string
    return typeof html === 'string' ? html : markdown;
  } catch {
    return markdown;
  }
}

function parseResponse(content: string): CardInput[] {
  try {
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.warn('No JSON array found in LLM response');
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) {
      console.warn('LLM response is not an array');
      return [];
    }

    return parsed
      .filter((item) => item && typeof item.title === 'string')
      .map((item) => ({
        title: item.title.trim(),
        // Convert markdown content to HTML
        content: typeof item.content === 'string'
          ? markdownToHtml(item.content.trim())
          : '',
      }));
  } catch (error) {
    console.warn('Failed to parse LLM response:', error);
    return [];
  }
}

interface GenerateRequest {
  channel: Channel;
  count: number;
  cards: Record<string, Card>;
  targetColumnId?: string;
  systemInstructions?: string;
}

export async function POST(request: Request) {
  try {
    // Check authentication
    const session = await auth();
    const userId = session?.user?.id;

    const body: GenerateRequest = await request.json();
    const { channel, count, cards, targetColumnId, systemInstructions } = body;

    // Validate required fields
    if (!channel) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Find target column by ID, or fall back to first column
    const targetColumn = targetColumnId
      ? channel.columns.find((c) => c.id === targetColumnId) || channel.columns[0]
      : channel.columns[0];

    // Get LLM client
    let llm;
    let usingOwnerKey = false;
    let anonId: string | null = null;

    if (userId) {
      // Authenticated user - check BYOK first, then owner key
      const result = await getLLMClientForUser(userId);
      if (!result.client) {
        return NextResponse.json(
          { error: result.error || 'No AI access available' },
          { status: 403 }
        );
      }
      llm = result.client;
      usingOwnerKey = result.source === 'owner';
    } else {
      // Anonymous user - check usage limit and get/create anon ID
      const cookieStore = await cookies();
      anonId = cookieStore.get(ANON_COOKIE_NAME)?.value || `anon_${crypto.randomUUID()}`;

      const usageCheck = await checkAnonymousUsageLimit(anonId);
      if (!usageCheck.allowed) {
        const response = NextResponse.json(
          { error: usageCheck.message, code: 'ANONYMOUS_LIMIT_REACHED' },
          { status: 403 }
        );
        // Set cookie even on error so we track this user
        response.cookies.set(ANON_COOKIE_NAME, anonId, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 60 * 60 * 24 * 365, // 1 year
        });
        return response;
      }

      // Try to get owner key for anonymous users
      llm = getLLMClient();
      if (!llm) {
        return NextResponse.json(
          { error: 'AI service not available' },
          { status: 503 }
        );
      }
      usingOwnerKey = true;
    }

    // Build prompt with column context
    const messages = buildPrompt(channel, targetColumn, count || 5, cards || {}, systemInstructions);

    // Web research: check channel instructions and column instructions for web intent
    const allInstructions = [channel.aiInstructions, targetColumn.instructions].filter(Boolean).join(' ');
    if (llm.webSearch && detectWebSearchIntent(allInstructions)) {
      try {
        const searchQuery = allInstructions.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
        const webResult = await llm.webSearch(
          searchQuery,
          `Search the web and return detailed, factual information including real URLs. The user needs real links and data for a Kanban board called "${channel.name}". Return specific URLs, titles, and descriptions.`
        );
        if (webResult.content) {
          const userMsg = messages[messages.length - 1];
          const currentContent = userMsg.content as string;

          // Build a verified URL list from annotations (these are real, crawled URLs)
          let verifiedUrlSection = '';
          if (webResult.webSearchResults && webResult.webSearchResults.length > 0) {
            const urlList = webResult.webSearchResults
              .map((r) => `- ${r.title}: ${r.url}`)
              .join('\n');
            verifiedUrlSection = `\n\n### Verified URLs (use ONLY these)\n${urlList}`;
          }

          userMsg.content = currentContent + `\n\n## Web Research (real data from the internet)\nIMPORTANT: Use ONLY the verified URLs listed below. Do NOT invent or hallucinate any URLs. If no verified URLs are listed, do not include any URLs.\n\n${webResult.content}${verifiedUrlSection}`;
        }
      } catch (e) {
        console.warn('Web search failed, proceeding without:', e);
      }
    }

    // Build debug info
    const debug = {
      systemPrompt: messages[0].content,
      userPrompt: messages[1].content,
      rawResponse: '',
    };

    try {
      const llmResponse = await llm.complete(messages);
      debug.rawResponse = llmResponse.content;
      const generatedCards = parseResponse(llmResponse.content);

      if (generatedCards.length === 0) {
        return NextResponse.json({
          cards: getRandomIdeas(count || 5).map((idea) => ({
            title: idea,
            content: '<p>AI generation failed. Please try again.</p>',
          })),
          debug,
        });
      }

      // Record usage if using owner's key
      if (usingOwnerKey) {
        if (userId) {
          await recordUsage(userId, 'generate-cards');
        } else if (anonId) {
          await recordAnonymousUsage(anonId, 'generate-cards');
        }
      }

      // Notify user
      if (userId) {
        createNotification({
          userId,
          type: 'ai_generation_completed',
          title: 'Cards generated',
          body: `${generatedCards.length} card(s) generated for "${channel.name}"`,
          data: { channelId: channel.id },
        }).catch(() => {});
      }

      // Build response
      const response = NextResponse.json({
        cards: generatedCards.slice(0, count || 5),
        debug,
      });

      // Set anonymous cookie if needed
      if (anonId) {
        response.cookies.set(ANON_COOKIE_NAME, anonId, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 60 * 60 * 24 * 365, // 1 year
        });
      }

      return response;
    } catch (llmError) {
      console.error('LLM error:', llmError);
      debug.rawResponse = `Error: ${llmError instanceof Error ? llmError.message : 'Unknown error'}`;

      // Retry once
      try {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const retryResponse = await llm.complete(messages);
        debug.rawResponse = retryResponse.content;
        const generatedCards = parseResponse(retryResponse.content);
        if (generatedCards.length > 0) {
          // Record usage if using owner's key
          if (usingOwnerKey) {
            if (userId) {
              await recordUsage(userId, 'generate-cards');
            } else if (anonId) {
              await recordAnonymousUsage(anonId, 'generate-cards');
            }
          }

          const retryJsonResponse = NextResponse.json({
            cards: generatedCards.slice(0, count || 5),
            debug,
          });

          // Set anonymous cookie if needed
          if (anonId) {
            retryJsonResponse.cookies.set(ANON_COOKIE_NAME, anonId, {
              httpOnly: true,
              secure: process.env.NODE_ENV === 'production',
              sameSite: 'lax',
              maxAge: 60 * 60 * 24 * 365, // 1 year
            });
          }

          return retryJsonResponse;
        }
      } catch (retryError) {
        console.error('LLM retry failed:', retryError);
        debug.rawResponse += `\nRetry error: ${retryError instanceof Error ? retryError.message : 'Unknown error'}`;
      }

      // Return fallback
      return NextResponse.json({
        cards: getRandomIdeas(count || 5).map((idea) => ({
          title: idea,
          content: '<p>AI generation encountered an error. Please try again.</p>',
        })),
        debug,
      });
    }
  } catch (error) {
    console.error('Generate cards error:', error);
    return NextResponse.json(
      { error: 'Failed to generate cards' },
      { status: 500 }
    );
  }
}
