import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import type { TaskNote } from '@/lib/types';
import { getLLMClientForUser, getLLMClient, type LLMMessage, type LLMContentPart } from '@/lib/ai/llm';
import { auth } from '@/lib/auth';
import { recordUsage, checkAnonymousUsageLimit, recordAnonymousUsage } from '@/lib/usage';

const ANON_COOKIE_NAME = 'kanthink_anon_id';

export const runtime = 'nodejs';

interface TaskChatRequest {
  taskId: string;
  questionContent: string;
  imageUrls?: string[];
  context: {
    taskTitle: string;
    taskStatus: string;
    parentCardTitle?: string;
    channelName: string;
    channelDescription: string;
    previousNotes: TaskNote[];
  };
}

function buildPrompt(
  questionContent: string,
  context: TaskChatRequest['context'],
  imageUrls?: string[],
): LLMMessage[] {
  const { taskTitle, taskStatus, parentCardTitle, channelName, channelDescription, previousNotes } = context;

  const cardContext = parentCardTitle ? `\n- Parent card: "${parentCardTitle}"` : '';

  const statusLabels: Record<string, string> = {
    done: 'done (complete)',
    in_progress: 'in_progress (actively being worked on)',
    on_hold: 'on_hold (paused or blocked)',
    not_started: 'not_started (hasn\'t begun)',
  };
  const statusLabel = statusLabels[taskStatus] ?? taskStatus;

  const systemPrompt = `You are Kan, the AI assistant inside Kanthink — a Kanban board app.

Task statuses: not_started (hasn't begun), in_progress (being worked on), on_hold (paused/blocked), done (complete).

Context:
- Task: "${taskTitle}" (status: ${statusLabel})${cardContext}
- Channel: "${channelName}"${channelDescription ? ` - ${channelDescription}` : ''}

Guidelines:
- Keep responses concise and actionable
- Focus on helping with the specific task
- You can suggest next steps, provide information, or help break down the work
- Respond in plain text or markdown (not JSON)`;

  const messages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
  ];

  // Add previous notes as conversation history (last 10)
  const recentNotes = previousNotes.slice(-10);
  for (const note of recentNotes) {
    if (note.authorName === 'Kan') {
      messages.push({ role: 'assistant', content: note.content });
    } else {
      const imageRef = note.imageUrls?.length
        ? `\n[Attached images: ${note.imageUrls.join(', ')}]`
        : '';
      messages.push({ role: 'user', content: `${note.content}${imageRef}` });
    }
  }

  // Add the current question — with images if present
  if (imageUrls && imageUrls.length > 0) {
    const parts: LLMContentPart[] = [];
    if (questionContent) {
      parts.push({ type: 'text', text: questionContent });
    }
    for (const url of imageUrls) {
      parts.push({ type: 'image_url', image_url: { url } });
    }
    messages.push({ role: 'user', content: parts });
  } else {
    messages.push({ role: 'user', content: questionContent });
  }

  return messages;
}

export async function POST(request: Request) {
  try {
    const body: TaskChatRequest = await request.json();
    const { questionContent, imageUrls, context } = body;

    if ((!questionContent && (!imageUrls || imageUrls.length === 0)) || !context) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Get LLM client
    const session = await auth();
    const userId = session?.user?.id;

    let llm;
    let usingOwnerKey = false;
    let anonId: string | null = null;

    if (userId) {
      const result = await getLLMClientForUser(userId);
      if (!result.client) {
        return NextResponse.json(
          { error: result.error || 'No AI access available. Configure your API key in Settings.' },
          { status: 403 }
        );
      }
      llm = result.client;
      usingOwnerKey = result.source === 'owner';
    } else {
      const cookieStore = await cookies();
      anonId = cookieStore.get(ANON_COOKIE_NAME)?.value || `anon_${crypto.randomUUID()}`;

      const usageCheck = await checkAnonymousUsageLimit(anonId);
      if (!usageCheck.allowed) {
        const response = NextResponse.json(
          { error: usageCheck.message, code: 'ANONYMOUS_LIMIT_REACHED' },
          { status: 403 }
        );
        response.cookies.set(ANON_COOKIE_NAME, anonId, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 60 * 60 * 24 * 365,
        });
        return response;
      }

      llm = getLLMClient();
      if (!llm) {
        return NextResponse.json(
          { error: 'AI service not available' },
          { status: 503 }
        );
      }
      usingOwnerKey = true;
    }

    const messages = buildPrompt(questionContent, context, imageUrls);

    try {
      const llmResponse = await llm.complete(messages);

      if (usingOwnerKey) {
        if (userId) {
          await recordUsage(userId, 'task-chat');
        } else if (anonId) {
          await recordAnonymousUsage(anonId, 'task-chat');
        }
      }

      const response = NextResponse.json({
        success: true,
        response: llmResponse.content,
      });

      if (anonId) {
        response.cookies.set(ANON_COOKIE_NAME, anonId, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 60 * 60 * 24 * 365,
        });
      }

      return response;
    } catch (llmError) {
      console.error('LLM error:', llmError);
      return NextResponse.json(
        { error: `LLM error: ${llmError instanceof Error ? llmError.message : 'Unknown error'}` },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Task chat error:', error);
    return NextResponse.json(
      { error: 'Failed to get AI response' },
      { status: 500 }
    );
  }
}
