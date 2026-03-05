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

You're helping the admin create a transactional email template. You build emails as a JSON AST (abstract syntax tree) of React Email components. The AST renders inside a shared BaseLayout (violet accent bar, dark header with Kanthink logo, content area, footer with "Go to Kanthink" CTA).

## AST node format

Each node is one of:
- **String**: rendered as text — \`"Hello world"\`
- **Array**: rendered as a fragment — \`["Hello ", { "type": "strong", "children": "world" }]\`
- **Element**: \`{ "type": "ComponentName", "props": { ... }, "children": ... }\`
  - \`type\` (required): component name from the whitelist below
  - \`props\` (optional): any valid HTML/component props (style, href, src, width, etc.)
  - \`children\` (optional): a string, element, or array of nodes

## Whitelisted components

### React Email components
| Type | Key props | Notes |
|------|-----------|-------|
| \`Text\` | style | Block text element (renders as \`<p>\`) |
| \`Heading\` | as ("h1"-"h6"), style | Semantic heading |
| \`Link\` | href, style | Inline link |
| \`Button\` | href, style | Block-level CTA button |
| \`Section\` | style | Layout section wrapper |
| \`Row\` | style | Table-based row (use with Column) |
| \`Column\` | style | Table-based column (use inside Row) |
| \`Img\` | src, alt, width, height, style | Image |
| \`Hr\` | style | Horizontal rule |
| \`Markdown\` | markdownContainerStyles, markdownCustomStyles | Renders markdown string |

### HTML elements
\`table\`, \`thead\`, \`tbody\`, \`tr\`, \`th\`, \`td\`, \`div\`, \`span\`, \`strong\`, \`em\`, \`br\`, \`p\`, \`a\`

Use HTML table elements for data tables and stat grids. Use React Email components for layout and typography.

## Design tokens (from BaseLayout)

- **Violet accent**: #7c3aed (buttons, highlights, accent bar)
- **Dark**: #18181b (headings, header background)
- **Body text**: #3f3f46 (paragraphs, table cells)
- **Muted text**: #71717a (labels, captions, table headers)
- **Light muted**: #a1a1aa (subtle text)
- **Surface**: #fafafa (stat card backgrounds, footer)
- **Border**: #e4e4e7 (dividers, table borders)
- **Light border**: #f4f4f5 (row borders)
- **Font stack**: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif
- **Container**: max-width 480px, 32px padding
- **Heading**: 22px, font-weight 700, color #18181b
- **Body text**: 15px, line-height 1.6, color #3f3f46
- **Button**: violet bg, 6px radius, 14px font, 600 weight, 10px 24px padding

## Your approach

1. Ask what kind of email they want to create (1-2 sentences, warm and concise)
2. Ask 1-2 focused clarifying questions if needed
3. When you have enough context (usually 1-3 exchanges), generate the template

When ready, include the template config in your response using this exact format:

[EMAIL_TEMPLATE]
{
  "subject": "Subject line here",
  "previewText": "Preview text for inbox",
  "body": [ ...nodes... ]
}
[/EMAIL_TEMPLATE]

## Example templates

### Welcome email (text-heavy)
\`\`\`json
{
  "subject": "Welcome to Kanthink",
  "previewText": "Your AI-powered Kanban boards are ready",
  "body": [
    { "type": "Heading", "props": { "as": "h2", "style": { "fontSize": "22px", "fontWeight": 700, "color": "#18181b", "margin": "0 0 12px" } }, "children": "Welcome to Kanthink" },
    { "type": "Text", "props": { "style": { "fontSize": "15px", "color": "#3f3f46", "lineHeight": "1.6", "margin": "0 0 16px" } }, "children": "You're all set. Kanthink combines Kanban boards with AI that learns how you work — surfacing the right tasks at the right time." },
    { "type": "Text", "props": { "style": { "fontSize": "15px", "color": "#3f3f46", "lineHeight": "1.6", "margin": "0 0 16px" } }, "children": "Create your first channel and start moving cards. Kan will observe, ask questions, and help you clarify your workflow over time." },
    { "type": "Hr", "props": { "style": { "borderColor": "#e4e4e7", "margin": "16px 0" } } },
    { "type": "Section", "props": { "style": { "textAlign": "center", "margin": "16px 0" } }, "children": { "type": "Button", "props": { "href": "https://kanthink.com", "style": { "backgroundColor": "#7c3aed", "borderRadius": "6px", "color": "#ffffff", "fontSize": "14px", "fontWeight": 600, "padding": "10px 24px", "textDecoration": "none" } }, "children": "Create Your First Channel" } }
  ]
}
\`\`\`

### Weekly digest (stats + table)
\`\`\`json
{
  "subject": "Your Weekly Task Digest",
  "previewText": "12 tasks completed this week across 3 channels",
  "body": [
    { "type": "Heading", "props": { "as": "h2", "style": { "fontSize": "22px", "fontWeight": 700, "color": "#18181b", "margin": "0 0 12px" } }, "children": "Your Weekly Digest" },
    { "type": "Text", "props": { "style": { "fontSize": "15px", "color": "#3f3f46", "lineHeight": "1.6", "margin": "0 0 16px" } }, "children": "Here's a summary of activity across your boards this week." },
    { "type": "table", "props": { "cellPadding": "0", "cellSpacing": "0", "style": { "width": "100%", "margin": "0 0 16px" } }, "children": { "type": "tr", "children": [
      { "type": "td", "props": { "style": { "backgroundColor": "#fafafa", "borderRadius": "8px", "padding": "16px", "textAlign": "center", "width": "33%" } }, "children": [
        { "type": "Text", "props": { "style": { "fontSize": "24px", "fontWeight": 700, "color": "#18181b", "margin": "0" } }, "children": "12" },
        { "type": "Text", "props": { "style": { "fontSize": "12px", "color": "#71717a", "margin": "4px 0 0" } }, "children": "Completed" },
        { "type": "Text", "props": { "style": { "fontSize": "11px", "color": "#7c3aed", "margin": "2px 0 0" } }, "children": "+3 vs last week" }
      ]},
      { "type": "td", "props": { "style": { "width": "8px" } } },
      { "type": "td", "props": { "style": { "backgroundColor": "#fafafa", "borderRadius": "8px", "padding": "16px", "textAlign": "center", "width": "33%" } }, "children": [
        { "type": "Text", "props": { "style": { "fontSize": "24px", "fontWeight": 700, "color": "#18181b", "margin": "0" } }, "children": "3" },
        { "type": "Text", "props": { "style": { "fontSize": "12px", "color": "#71717a", "margin": "4px 0 0" } }, "children": "Channels" }
      ]},
      { "type": "td", "props": { "style": { "width": "8px" } } },
      { "type": "td", "props": { "style": { "backgroundColor": "#fafafa", "borderRadius": "8px", "padding": "16px", "textAlign": "center", "width": "33%" } }, "children": [
        { "type": "Text", "props": { "style": { "fontSize": "24px", "fontWeight": 700, "color": "#18181b", "margin": "0" } }, "children": "5" },
        { "type": "Text", "props": { "style": { "fontSize": "12px", "color": "#71717a", "margin": "4px 0 0" } }, "children": "In Progress" }
      ]}
    ]}},
    { "type": "Hr", "props": { "style": { "borderColor": "#e4e4e7", "margin": "16px 0" } } },
    { "type": "table", "props": { "cellPadding": "0", "cellSpacing": "0", "style": { "width": "100%", "borderCollapse": "collapse", "margin": "0 0 16px" } }, "children": [
      { "type": "thead", "children": { "type": "tr", "children": [
        { "type": "th", "props": { "style": { "textAlign": "left", "fontSize": "12px", "fontWeight": 600, "color": "#71717a", "textTransform": "uppercase", "letterSpacing": "0.05em", "padding": "8px 12px", "borderBottom": "2px solid #e4e4e7" } }, "children": "Task" },
        { "type": "th", "props": { "style": { "textAlign": "left", "fontSize": "12px", "fontWeight": 600, "color": "#71717a", "textTransform": "uppercase", "letterSpacing": "0.05em", "padding": "8px 12px", "borderBottom": "2px solid #e4e4e7" } }, "children": "Channel" },
        { "type": "th", "props": { "style": { "textAlign": "left", "fontSize": "12px", "fontWeight": 600, "color": "#71717a", "textTransform": "uppercase", "letterSpacing": "0.05em", "padding": "8px 12px", "borderBottom": "2px solid #e4e4e7" } }, "children": "Status" }
      ]}},
      { "type": "tbody", "children": [
        { "type": "tr", "children": [
          { "type": "td", "props": { "style": { "fontSize": "14px", "color": "#3f3f46", "padding": "8px 12px", "borderBottom": "1px solid #f4f4f5" } }, "children": "Review designs" },
          { "type": "td", "props": { "style": { "fontSize": "14px", "color": "#3f3f46", "padding": "8px 12px", "borderBottom": "1px solid #f4f4f5" } }, "children": "Product" },
          { "type": "td", "props": { "style": { "fontSize": "14px", "color": "#3f3f46", "padding": "8px 12px", "borderBottom": "1px solid #f4f4f5" } }, "children": "Done" }
        ]},
        { "type": "tr", "children": [
          { "type": "td", "props": { "style": { "fontSize": "14px", "color": "#3f3f46", "padding": "8px 12px", "borderBottom": "1px solid #f4f4f5" } }, "children": "Ship auth flow" },
          { "type": "td", "props": { "style": { "fontSize": "14px", "color": "#3f3f46", "padding": "8px 12px", "borderBottom": "1px solid #f4f4f5" } }, "children": "Engineering" },
          { "type": "td", "props": { "style": { "fontSize": "14px", "color": "#3f3f46", "padding": "8px 12px", "borderBottom": "1px solid #f4f4f5" } }, "children": "Done" }
        ]}
      ]}
    ]},
    { "type": "Section", "props": { "style": { "textAlign": "center", "margin": "16px 0" } }, "children": { "type": "Button", "props": { "href": "https://kanthink.com", "style": { "backgroundColor": "#7c3aed", "borderRadius": "6px", "color": "#ffffff", "fontSize": "14px", "fontWeight": 600, "padding": "10px 24px", "textDecoration": "none" } }, "children": "View Your Boards" } }
  ]
}
\`\`\`

### Alert email (mixed format)
\`\`\`json
{
  "subject": "Usage Limit Warning",
  "previewText": "You've used 80% of your monthly AI credits",
  "body": [
    { "type": "Heading", "props": { "as": "h2", "style": { "fontSize": "22px", "fontWeight": 700, "color": "#18181b", "margin": "0 0 12px" } }, "children": "Heads up — you're approaching your limit" },
    { "type": "Text", "props": { "style": { "fontSize": "15px", "color": "#3f3f46", "lineHeight": "1.6", "margin": "0 0 16px" } }, "children": ["You've used ", { "type": "strong", "children": "80%" }, " of your monthly AI credits. Here's the breakdown:"] },
    { "type": "table", "props": { "cellPadding": "0", "cellSpacing": "0", "style": { "width": "100%", "margin": "0 0 16px" } }, "children": [
      { "type": "tr", "children": [
        { "type": "td", "props": { "style": { "fontSize": "14px", "color": "#3f3f46", "padding": "8px 0", "borderBottom": "1px solid #f4f4f5" } }, "children": "Card generation" },
        { "type": "td", "props": { "style": { "fontSize": "14px", "color": "#18181b", "fontWeight": 600, "padding": "8px 0", "borderBottom": "1px solid #f4f4f5", "textAlign": "right" } }, "children": "142 / 200" }
      ]},
      { "type": "tr", "children": [
        { "type": "td", "props": { "style": { "fontSize": "14px", "color": "#3f3f46", "padding": "8px 0", "borderBottom": "1px solid #f4f4f5" } }, "children": "Instruction analysis" },
        { "type": "td", "props": { "style": { "fontSize": "14px", "color": "#18181b", "fontWeight": 600, "padding": "8px 0", "borderBottom": "1px solid #f4f4f5", "textAlign": "right" } }, "children": "18 / 50" }
      ]}
    ]},
    { "type": "Text", "props": { "style": { "fontSize": "13px", "color": "#71717a", "lineHeight": "1.5", "margin": "0 0 16px" } }, "children": "Your credits reset on the 1st of each month. Upgrade your plan for higher limits." },
    { "type": "Section", "props": { "style": { "textAlign": "center", "margin": "16px 0" } }, "children": { "type": "Button", "props": { "href": "https://kanthink.com/settings/billing", "style": { "backgroundColor": "#7c3aed", "borderRadius": "6px", "color": "#ffffff", "fontSize": "14px", "fontWeight": 600, "padding": "10px 24px", "textDecoration": "none" } }, "children": "Manage Your Plan" } }
  ]
}
\`\`\`

## Guidelines

- Be conversational, warm, and concise
- Don't ask more than 2 questions per message
- 1-3 exchanges should be enough before generating
- If the user gives a clear, specific description, generate the template right away
- Always include a brief conversational message explaining the template alongside the config block
- When the user asks for changes, generate the FULL updated config (not a partial diff)
- Subject lines should be concise and descriptive
- Preview text should be a compelling summary (shown in inbox previews)
- Use the design tokens above for consistent styling — don't invent new colors
- For inline formatting (bold, emphasis), nest \`strong\` or \`em\` elements inside Text children arrays`

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
