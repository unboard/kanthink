import { NextResponse } from 'next/server'
import { getLLMClientForUser, type LLMMessage } from '@/lib/ai/llm'
import { auth, isAdmin } from '@/lib/auth'
import { recordUsage } from '@/lib/usage'
import { extractEmailConfig, cleanDisplayResponse } from '@/lib/emails/extractEmailConfig'
import type { EmailConfig } from '@/lib/emails/dynamicRenderer'

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

You're helping the admin create a transactional email template. You build emails as a JSON AST of React Email components. The AST renders inside a shared BaseLayout (violet accent bar, dark header with Kanthink logo, content area, footer with "Go to Kanthink" CTA).

## IMPORTANT: Default styles are applied automatically

The renderer applies Kanthink design tokens automatically to these components: Heading, Text, Button, Hr, th, td. **You do NOT need to specify style props for these** — just use type and children. Only add a style prop when you need to override a specific default (e.g., a different color or font size).

Default styles applied:
- Heading: 22px, bold, dark color, bottom margin
- Text: 15px, body color, 1.6 line-height, bottom margin
- Button: violet bg, 6px radius, white text, padding
- Hr: light border, vertical margin
- th: uppercase, muted color, left-aligned, bottom border
- td: 14px, body color, padding, light bottom border

## AST node format

Each node is one of:
- **String**: \`"Hello world"\`
- **Array**: \`["Hello ", { "type": "strong", "children": "world" }]\`
- **Element**: \`{ "type": "ComponentName", "props": { ... }, "children": ... }\`
  - \`type\` (required): component name
  - \`props\` (optional): only needed for href, src, or style overrides
  - \`children\` (optional): string, element, or array of nodes

## Available components

React Email: Text, Heading (use "as" prop for h1-h6), Link (href), Button (href), Section, Row, Column, Img (src, alt, width, height), Hr, Markdown
HTML: table, thead, tbody, tr, th, td, div, span, strong, em, br, p, a

## Design tokens

Violet accent #7c3aed | Dark #18181b | Body text #3f3f46 | Muted #71717a | Surface #fafafa | Border #e4e4e7

## Output format

When ready, include the template in your response using this exact format:

[EMAIL_TEMPLATE]
{
  "subject": "Subject line",
  "previewText": "Preview text for inbox",
  "body": [ ...nodes... ]
}
[/EMAIL_TEMPLATE]

## Example templates

### Welcome email
\`\`\`json
{
  "subject": "Welcome to Kanthink",
  "previewText": "Your AI-powered Kanban boards are ready",
  "body": [
    { "type": "Heading", "children": "Welcome to Kanthink" },
    { "type": "Text", "children": "You're all set. Kanthink combines Kanban boards with AI that learns how you work — surfacing the right tasks at the right time." },
    { "type": "Text", "children": "Create your first channel and start moving cards. Kan will observe, ask questions, and help you clarify your workflow over time." },
    { "type": "Hr" },
    { "type": "Section", "props": { "style": { "textAlign": "center", "margin": "16px 0" } }, "children": { "type": "Button", "props": { "href": "https://kanthink.com" }, "children": "Create Your First Channel" } }
  ]
}
\`\`\`

### Weekly digest (stats + table)
\`\`\`json
{
  "subject": "Your Weekly Task Digest",
  "previewText": "12 tasks completed this week across 3 channels",
  "body": [
    { "type": "Heading", "children": "Your Weekly Digest" },
    { "type": "Text", "children": "Here's a summary of activity across your boards this week." },
    { "type": "table", "props": { "cellPadding": "0", "cellSpacing": "0", "style": { "width": "100%", "margin": "0 0 16px" } }, "children": { "type": "tr", "children": [
      { "type": "td", "props": { "style": { "backgroundColor": "#fafafa", "borderRadius": "8px", "padding": "16px", "textAlign": "center", "width": "33%", "borderBottom": "none" } }, "children": [
        { "type": "Text", "props": { "style": { "fontSize": "24px", "fontWeight": 700, "color": "#18181b", "margin": "0" } }, "children": "12" },
        { "type": "Text", "props": { "style": { "fontSize": "12px", "color": "#71717a", "margin": "4px 0 0" } }, "children": "Completed" }
      ]},
      { "type": "td", "props": { "style": { "width": "8px", "borderBottom": "none" } } },
      { "type": "td", "props": { "style": { "backgroundColor": "#fafafa", "borderRadius": "8px", "padding": "16px", "textAlign": "center", "width": "33%", "borderBottom": "none" } }, "children": [
        { "type": "Text", "props": { "style": { "fontSize": "24px", "fontWeight": 700, "color": "#18181b", "margin": "0" } }, "children": "3" },
        { "type": "Text", "props": { "style": { "fontSize": "12px", "color": "#71717a", "margin": "4px 0 0" } }, "children": "Channels" }
      ]}
    ]}},
    { "type": "Hr" },
    { "type": "table", "props": { "cellPadding": "0", "cellSpacing": "0", "style": { "width": "100%", "borderCollapse": "collapse", "margin": "0 0 16px" } }, "children": [
      { "type": "thead", "children": { "type": "tr", "children": [
        { "type": "th", "children": "Task" },
        { "type": "th", "children": "Channel" },
        { "type": "th", "children": "Status" }
      ]}},
      { "type": "tbody", "children": [
        { "type": "tr", "children": [
          { "type": "td", "children": "Review designs" },
          { "type": "td", "children": "Product" },
          { "type": "td", "children": "Done" }
        ]}
      ]}
    ]},
    { "type": "Section", "props": { "style": { "textAlign": "center", "margin": "16px 0" } }, "children": { "type": "Button", "props": { "href": "https://kanthink.com" }, "children": "View Your Boards" } }
  ]
}
\`\`\`

## Guidelines

- Be conversational, warm, and concise (1-3 exchanges before generating)
- If the user gives a clear description, generate the template right away
- Always include a brief message explaining the template alongside the config block
- Generate the FULL config on changes (not a partial diff)
- Don't invent new colors — use the design tokens
- For bold/emphasis, nest \`strong\`/\`em\` inside Text children arrays
- Keep JSON compact — omit props when defaults suffice`

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

      const emailConfig: EmailConfig | null = extractEmailConfig(responseText)
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
