import { NextResponse } from 'next/server'
import { getLLMClientForUser, type LLMMessage } from '@/lib/ai/llm'
import { auth, isAdmin } from '@/lib/auth'
import { recordUsage } from '@/lib/usage'
import { extractEmailConfig, cleanDisplayResponse } from '@/lib/emails/extractEmailConfig'
import type { EmailContentConfig } from '@/lib/emails/dynamicRenderer'

interface BuilderChatRequest {
  userMessage: string
  isInitialGreeting?: boolean
  context: {
    conversationHistory: Array<{
      role: 'user' | 'assistant'
      content: string
    }>
  }
}

function buildPrompt(
  userMessage: string,
  isInitialGreeting: boolean,
  conversationHistory: BuilderChatRequest['context']['conversationHistory']
): LLMMessage[] {
  const systemPrompt = `You are Kan, a helpful AI assistant for Kanthink — a Kanban app with AI-powered email capabilities.

You're helping the admin create a transactional email template. You build emails using a sections-based content format that renders inside a shared BaseLayout (violet accent bar, dark header with Kanthink logo, content area, footer with "Go to Kanthink" CTA).

## Available section types

- **heading**: \`{ "type": "heading", "text": "..." }\` — 22px bold dark heading
- **paragraph**: \`{ "type": "paragraph", "text": "..." }\` — 15px body text, zinc color
- **table**: \`{ "type": "table", "headers": ["Col1", "Col2"], "rows": [["a", "b"]] }\` — data table with header row
- **cta**: \`{ "type": "cta", "text": "Button Text", "url": "https://..." }\` — centered violet button
- **divider**: \`{ "type": "divider" }\` — horizontal rule
- **stats**: \`{ "type": "stats", "items": [{ "label": "Tasks", "value": "12", "change": "+3" }] }\` — stat cards in a row (change is optional)
- **list**: \`{ "type": "list", "items": ["Item 1", "Item 2"], "ordered": false }\` — bulleted or numbered list

## Design context

The BaseLayout already provides:
- Violet accent bar at the top
- Dark header with Kanthink mushroom logo
- White content area (your sections render here)
- Footer with "Go to Kanthink" button and tagline
- Max width 480px, system font stack
- Colors: violet #7c3aed, dark #18181b, body text #3f3f46, muted #71717a

Keep emails concise and scannable. Use headings to structure, tables for data, stats for metrics, and paragraphs sparingly.

## Your approach

1. Ask what kind of email they want to create (1-2 sentences, warm and concise)
2. Ask 1-2 focused clarifying questions if needed (e.g., what data should the table show, what's the CTA)
3. When you have enough context (usually 1-3 exchanges), generate the template

When ready, include the template config in your response using this exact format:

[EMAIL_TEMPLATE]
{
  "subject": "Your Weekly Task Digest",
  "previewText": "Here's what happened this week on your boards",
  "sections": [
    { "type": "heading", "text": "Your Weekly Digest" },
    { "type": "paragraph", "text": "Here's a summary of activity across your boards this week." },
    { "type": "stats", "items": [{ "label": "Tasks completed", "value": "12", "change": "+3 vs last week" }] },
    { "type": "table", "headers": ["Task", "Channel", "Status"], "rows": [["Review designs", "Product", "Done"]] },
    { "type": "cta", "text": "View Your Boards", "url": "https://kanthink.com" }
  ]
}
[/EMAIL_TEMPLATE]

## Guidelines

- Be conversational, warm, and concise
- Don't ask more than 2 questions per message
- 1-3 exchanges should be enough before generating
- If the user gives a clear, specific description, generate the template right away
- Always include a brief conversational message explaining the template alongside the config block
- When the user asks for changes, generate the FULL updated config (not a partial diff)
- Subject lines should be concise and descriptive
- Preview text should be a compelling summary (shown in inbox previews)`

  const messages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
  ]

  for (const msg of conversationHistory) {
    messages.push({ role: msg.role, content: msg.content })
  }

  if (isInitialGreeting) {
    messages.push({
      role: 'user',
      content: 'I want to create a new email template. Give me a brief greeting (1-2 sentences) and ask what kind of email I want to build.',
    })
  } else {
    messages.push({ role: 'user', content: userMessage })
  }

  return messages
}

export async function POST(request: Request) {
  try {
    const body: BuilderChatRequest = await request.json()
    const { userMessage, isInitialGreeting, context } = body

    if (!context) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (!isInitialGreeting && !userMessage) {
      return NextResponse.json({ error: 'Missing user message' }, { status: 400 })
    }

    const session = await auth()
    const userId = session?.user?.id
    const email = session?.user?.email

    if (!userId || !email || !isAdmin(email)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const result = await getLLMClientForUser(userId)
    if (!result.client) {
      return NextResponse.json(
        { error: result.error || 'No AI access available.' },
        { status: 403 }
      )
    }

    const llm = result.client
    const usingOwnerKey = result.source === 'owner'

    const messages = buildPrompt(
      userMessage || '',
      isInitialGreeting ?? false,
      context.conversationHistory
    )

    try {
      const response = await llm.complete(messages)
      const responseText = response.content

      if (usingOwnerKey) {
        await recordUsage(userId, 'email-builder-chat')
      }

      const emailConfig: EmailContentConfig | null = extractEmailConfig(responseText)
      const displayResponse = emailConfig
        ? cleanDisplayResponse(responseText)
        : responseText

      return NextResponse.json({
        success: true,
        response: displayResponse,
        emailConfig,
      })
    } catch (llmError) {
      console.error('LLM error:', llmError)
      return NextResponse.json(
        { error: `LLM error: ${llmError instanceof Error ? llmError.message : 'Unknown error'}` },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('Email builder chat error:', error)
    return NextResponse.json({ error: 'Failed to get AI response' }, { status: 500 })
  }
}
