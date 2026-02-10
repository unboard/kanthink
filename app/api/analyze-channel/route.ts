import { NextResponse } from 'next/server';
import type { Channel, Card } from '@/lib/types';
import { getLLMClientForUser, type LLMMessage } from '@/lib/ai/llm';
import { auth } from '@/lib/auth';
import { recordUsage } from '@/lib/usage';
import { detectDrift, buildFeedbackContext, type DriftInsight } from '@/lib/ai/feedbackAnalyzer';
import { createNotification } from '@/lib/notifications/createNotification';

interface InsightResult {
  question: string;  // Keep as "question" for backward compatibility with store
  context: string;
  suggestedAnswers: string[];  // Keep for backward compatibility, will be empty
}

interface AnalysisResult {
  questions: InsightResult[];  // Keep as "questions" for backward compatibility
}

function buildColumnContext(channel: Channel, allCards: Record<string, Card>): string {
  let context = '';
  const includeBackside = channel.includeBacksideInAI ?? false;

  for (const column of channel.columns) {
    const columnCards = column.cardIds
      .map((id) => allCards[id])
      .filter(Boolean);

    const backsideCards = includeBackside
      ? (column.backsideCardIds ?? []).map((id) => allCards[id]).filter(Boolean)
      : [];

    if (columnCards.length === 0 && backsideCards.length === 0) continue;

    if (columnCards.length > 0) {
      context += `\n\n${column.name}:`;
      for (const card of columnCards) {
        context += `\n- "${card.title}"`;
        // Include summary or first message as context
        if (card.summary) {
          context += `: ${card.summary}`;
        } else if (card.messages && card.messages.length > 0) {
          context += `: ${card.messages[0].content.slice(0, 200)}`;
        }
      }
    }

    if (backsideCards.length > 0) {
      context += `\n\n${column.name} (completed):`;
      for (const card of backsideCards) {
        context += `\n- "${card.title}"`;
      }
    }
  }

  return context;
}

function buildAnalysisPrompt(
  channel: Channel,
  allCards: Record<string, Card>
): LLMMessage[] {
  const systemPrompt = `You surface OBSERVATIONS about user behavior patterns to prompt reflection and curiosity.

## Your Role: Insight Surfacer

You observe patterns in how users interact with their board (what they like, dislike, delete) and surface those observations. You do NOT ask users to make decisions or change settings. You simply help them SEE patterns they might not notice.

## GOOD observations (specific, thought-provoking):
- "You've moved 5 vegan dishes to Dislike but kept all the chicken dishes. There's a clear protein preference emerging."
- "Interesting pattern: the cards you like (Butter Chicken, Chiles Rellenos) are all rich, hearty comfort foods."
- "You're focusing on print product-specific content in 'Category Pages' while 'Blog Pages' has more general topics."

## BAD observations (generic, or asking for decisions):
- "Should we avoid vegan dishes?" ← Don't ask for decisions
- "What type of content do you prefer?" ← Too generic, doesn't reference specific behavior
- "Would you like me to change the instructions?" ← Never offer to change things

## Rules
- State what you OBSERVE, don't ask what to DO about it
- Reference SPECIFIC card titles or clear patterns
- Be curious and thought-provoking, not prescriptive
- End with a period, not a question mark (observations, not questions)
- Keep it brief - one clear observation per insight
- NEVER offer to change settings, instructions, or board configuration

Respond with valid JSON:
{
  "questions": [
    {
      "question": "Your observation statement here.",
      "context": "Why this is interesting: [brief explanation of the pattern]",
      "suggestedAnswers": []
    }
  ]
}

Generate 1-2 observations. If there's not enough behavior data, return an empty array.`;

  let userPrompt = `Analyze this Kanban channel and ask questions to help refine what cards should be generated:\n\n`;
  userPrompt += `Channel name: "${channel.name}"\n`;

  if (channel.description) {
    userPrompt += `Description: ${channel.description}\n`;
  }

  if (channel.aiInstructions) {
    userPrompt += `\nCurrent instructions for card generation:\n"${channel.aiInstructions}"\n`;
  } else {
    userPrompt += `\nNo instructions set yet - this is a new channel.\n`;
  }

  const columnContext = buildColumnContext(channel, allCards);
  if (columnContext) {
    userPrompt += `\nExisting cards on the board:`;
    userPrompt += columnContext;
  } else {
    userPrompt += `\nThe board is currently empty.`;
  }

  // Add previously answered questions as context
  const answeredQuestions = (channel.questions ?? []).filter(q => q.status === 'answered');
  if (answeredQuestions.length > 0) {
    userPrompt += `\n\nUser has previously shared these preferences:`;
    for (const q of answeredQuestions.slice(-5)) {
      userPrompt += `\n- ${q.answer}`;
    }
  }

  // Add feedback context - what types of content are being accepted/rejected
  const feedbackContext = buildFeedbackContext(channel, allCards);
  if (feedbackContext) {
    userPrompt += `\n\n## User Behavior Analysis (BASE YOUR QUESTIONS ON THIS)\n${feedbackContext}`;
  }

  userPrompt += `\n\n## Your Task
Look at the SPECIFIC cards and their placement above. Surface observations that:
1. Reference actual card names or clear patterns you see
2. Are thought-provoking - help the user notice something interesting
3. Are stated as observations, NOT questions asking for decisions

State what you observe. Do NOT ask what to do about it. End with periods, not question marks.`;

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];
}

function parseAnalysisResponse(content: string): AnalysisResult {
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('No JSON object found in analysis response');
      return { questions: [] };
    }

    const parsed = JSON.parse(jsonMatch[0]);

    const result: AnalysisResult = {
      questions: [],
    };

    if (Array.isArray(parsed.questions)) {
      result.questions = parsed.questions
        .filter((q: unknown) => {
          if (typeof q !== 'object' || q === null) return false;
          const obj = q as Record<string, unknown>;
          return (
            typeof obj.question === 'string' &&
            typeof obj.context === 'string' &&
            Array.isArray(obj.suggestedAnswers)
          );
        })
        .slice(0, 3)
        .map((q: { question: string; context: string; suggestedAnswers: string[] }) => ({
          question: q.question,
          context: q.context,
          suggestedAnswers: q.suggestedAnswers.filter((a: unknown) => typeof a === 'string').slice(0, 3),
        }));
    }

    return result;
  } catch (error) {
    console.warn('Failed to parse analysis response:', error);
    return { questions: [] };
  }
}

interface AnalyzeRequest {
  channel: Channel;
  cards: Record<string, Card>;
}

export async function POST(request: Request) {
  try {
    const body: AnalyzeRequest = await request.json();
    const { channel, cards } = body;

    if (!channel) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Detect drift (works regardless of auth)
    const driftInsights = detectDrift(channel, cards || {});

    // Get LLM client - requires authentication
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      // Return drift insights without AI analysis for unauthenticated users
      return NextResponse.json({ questions: [], driftInsights });
    }

    const result = await getLLMClientForUser(userId);
    if (!result.client) {
      return NextResponse.json({ questions: [], driftInsights });
    }

    const llm = result.client;
    const usingOwnerKey = result.source === 'owner';

    const messages = buildAnalysisPrompt(channel, cards || {});

    const debug = {
      systemPrompt: messages[0].content,
      userPrompt: messages[1].content,
      rawResponse: '',
    };

    try {
      const response = await llm.complete(messages);
      debug.rawResponse = response.content;

      const result = parseAnalysisResponse(response.content);

      if (userId && usingOwnerKey) {
        await recordUsage(userId, 'analyze-channel');
      }

      // Notify about questions and drift
      if (result.questions.length > 0) {
        createNotification({
          userId,
          type: 'ai_clarifying_questions',
          title: 'New insights from Kan',
          body: `${result.questions.length} observation(s) for "${channel.name}"`,
          data: { channelId: channel.id },
        }).catch(() => {});
      }

      if (driftInsights.length > 0) {
        createNotification({
          userId,
          type: 'drift_detected',
          title: 'Channel drift detected',
          body: `Kan noticed pattern changes in "${channel.name}"`,
          data: { channelId: channel.id },
        }).catch(() => {});
      }

      return NextResponse.json({
        ...result,
        driftInsights,
        debug,
      });
    } catch (llmError) {
      console.error('LLM error during analysis:', llmError);
      debug.rawResponse = `Error: ${llmError instanceof Error ? llmError.message : 'Unknown error'}`;

      return NextResponse.json({
        questions: [],
        driftInsights,
        error: 'Analysis failed. Please try again.',
        debug,
      });
    }
  } catch (error) {
    console.error('Analyze channel error:', error);
    return NextResponse.json(
      { error: 'Failed to analyze channel' },
      { status: 500 }
    );
  }
}
