/**
 * Everything Kan can do in live voice, as Gemini function declarations.
 *
 * Shared with the Kan agent prototype (lib/kan/agent/tools.ts), which converts
 * these to Claude tools, so both speak to /api/voice/action with the same
 * arguments and the descriptions stay written once.
 */
export const VOICE_TOOLS = [
  {
    functionDeclarations: [
      {
        name: 'complete_task',
        description: 'Mark a task as completed/done',
        parameters: { type: 'OBJECT', properties: { taskId: { type: 'STRING', description: 'The task ID to complete' } }, required: ['taskId'] },
      },
      {
        name: 'create_task',
        description: 'Add a checklist item to an EXISTING card — only when the user names the card it belongs on. Everything else is a card: "make a note", "add it to <column>", "remind me", a to-do, a bug, an idea — use create_card. Without a real card, this makes a card instead. Always give a description.',
        parameters: {
          type: 'OBJECT',
          properties: {
            channelId: { type: 'STRING', description: 'Channel ID' },
            cardId: { type: 'STRING', description: 'The card this task goes on — its ID if you have it.' },
            title: { type: 'STRING', description: 'Short, action-oriented task title.' },
            description: { type: 'STRING', description: '1-3 sentences in markdown on what the task involves and why. Never empty.' },
          },
          required: ['channelId', 'cardId', 'title', 'description'],
        },
      },
      {
        name: 'create_card',
        description: 'Create a new card in a channel with a rich first message. ONE CARD PER IDEA — if you already created a card for this idea in this conversation, call add_note on it instead; more detail arriving is not a new idea, even when it is about a different part of the same feature. Choose the channel by what the card is FOR, not what it is about (an app idea about birds belongs where the user builds things, not in their birding channel), and never put a personal idea in a work channel. If you are unsure which channel, ask the user BEFORE calling this — not after.',
        parameters: {
          type: 'OBJECT',
          properties: {
            channelId: { type: 'STRING', description: 'Channel ID' },
            columnName: { type: 'STRING', description: 'Column name. Pass this ONLY if you can see that column listed for this specific channel — most channels have no "Inbox". Omit it when unsure and the card lands in the channel default.' },
            title: { type: 'STRING', description: 'Card title' },
            content: { type: 'STRING', description: 'Card first message in markdown. Use ## headers, **bold**, - bullet lists, 1. numbered lists, [links](url), > blockquotes to make it well-structured and readable.' },
            distinct: { type: 'STRING', description: 'Set to "true" ONLY after the user has explicitly said this is a separate card from one you already made in this conversation. Never set it on a first attempt, and never to get past a warning on your own judgment.' },
          },
          required: ['channelId', 'title'],
        },
      },
      {
        name: 'app_audience',
        description: 'Read how a published app is doing: how many people use it, how many paid, revenue collected, opens, and any unread feedback. Use this whenever the user asks about usage, users, sales or feedback for an app they built. Read-only — it cannot change anyone\'s access or reply to anyone. Omit appName for a summary of every published app.',
        parameters: {
          type: 'OBJECT',
          properties: {
            appName: { type: 'STRING', description: 'Name of one app, or part of it. Omit to cover every published app.' },
          },
          required: [],
        },
      },
      {
        name: 'show_app',
        description: 'Read an app built on a card: what state it is in (draft, published, or unpublished), which version is live, whether the draft has unpublished changes, its price, and its own thread — the conversation that built it, which is separate from the card thread. Use this for ANY question about an app itself rather than its sales: "what state is the launch simulator in", "is that published yet", "what did we last change", "read me the app thread", "what is left to do on it". Works for drafts that have never been published. Read-only. Prefer this over saying you cannot see an app.',
        parameters: {
          type: 'OBJECT',
          properties: {
            appName: { type: 'STRING', description: 'Name of the app, or part of it. The name of the card it lives on also works. Omit to list every app, most recently worked on first.' },
          },
          required: [],
        },
      },
      {
        name: 'add_note',
        description: 'Add a note/message to a card thread. Format the content as rich markdown.',
        parameters: {
          type: 'OBJECT',
          properties: {
            cardId: { type: 'STRING', description: 'Card ID' },
            content: { type: 'STRING', description: 'Note content in markdown. Use headers (##), bold (**text**), bullet lists (- item), numbered lists (1. item), links [text](url), and blockquotes (> text) to structure the content nicely.' },
          },
          required: ['cardId', 'content'],
        },
      },
      {
        name: 'update_task_status',
        description: 'Update a task status (not_started, in_progress, on_hold, done)',
        parameters: {
          type: 'OBJECT',
          properties: {
            taskId: { type: 'STRING', description: 'Task ID' },
            status: { type: 'STRING', description: 'New status' },
          },
          required: ['taskId', 'status'],
        },
      },
      {
        name: 'update_task',
        description: 'Directly edit a task\'s title or description/notes. Use this when the user asks to "rename" a task, "update the description", "change the wording", or otherwise modify the task content itself — NOT when they want to add a separate note or comment. Pass only the fields you intend to change.',
        parameters: {
          type: 'OBJECT',
          properties: {
            taskId: { type: 'STRING', description: 'Task ID or task title to find' },
            title: { type: 'STRING', description: 'New task title (optional — only include if updating)' },
            description: { type: 'STRING', description: 'New task description in markdown (optional — only include if updating). Replaces the existing description entirely.' },
          },
          required: ['taskId'],
        },
      },
      {
        name: 'search_cards',
        description: 'Search for cards in a specific channel by keyword, or get the most recent cards in a channel. ONLY use when the user explicitly asks to find or look up cards in a specific channel. Do NOT use for general questions like "what is going on" or "what should I work on" — answer those from the context you already have.',
        parameters: {
          type: 'OBJECT',
          properties: {
            channelId: { type: 'STRING', description: 'Channel ID or channel name to search in' },
            query: { type: 'STRING', description: 'Search keyword (optional — omit to get most recent cards)' },
            limit: { type: 'STRING', description: 'Number of results to return (default: 5)' },
          },
          required: ['channelId'],
        },
      },
      {
        name: 'show_card',
        description: 'Open a card and return its full content (title, summary, every thread message, tasks, tags) plus any apps built from it and what state they are in. Use this whenever the user wants to view, read, or hear a card — including "read me this card", "what does that card say", "open this card", or any request for card details. The tool result includes the actual thread text so you can read it aloud verbatim. For an app\'s own thread or its release state in detail, use show_app.',
        parameters: {
          type: 'OBJECT',
          properties: { cardId: { type: 'STRING', description: 'Card ID or card title' } },
          required: ['cardId'],
        },
      },
      {
        name: 'query_mixpanel',
        description: 'Query Mixpanel analytics data. Use conversationally: show overview first, then suggest properties to drill into. Use action="list_properties" to discover what properties an event has. Use action="list_values" to see values for a property. Filter with property + value params. Pass chartType when the user asks for a specific visualization (e.g. "pie chart of orders by category") — otherwise omit and a sensible default is picked. The tool returns immediately and the underlying data arrives a moment later as a system message — once it does, you CAN read it and answer questions about specific rows, totals, and which values are most common, so never claim you cannot see the data. Keep the agreed date range across follow-ups: if the user settled on "today" and then asks for a breakdown, omit dateRange so the same window carries over, and only set it when they name a new one.',
        parameters: {
          type: 'OBJECT',
          properties: {
            question: { type: 'STRING', description: 'The analytics question in natural language' },
            action: { type: 'STRING', description: 'Action: "query" (default), "list_properties" (show properties for an event), "list_values" (show values for a property)' },
            event: { type: 'STRING', description: 'Specific event name (e.g., editor_subscribe, print_order)' },
            property: { type: 'STRING', description: 'Property name to filter by or inspect values of' },
            value: { type: 'STRING', description: 'Property value to filter on' },
            dateRange: { type: 'STRING', description: 'Date range: last_7_days, last_30_days, last_90_days, or YYYY-MM-DD:YYYY-MM-DD' },
            chartType: { type: 'STRING', description: 'Optional preferred chart type: "line" (trends over time), "bar" (category comparison), "pie"/"donut" (proportional breakdown of parts in a whole), "value" (single metric). Use "pie" when the user asks for a breakdown, distribution, share, or split of a total.' },
          },
          required: ['question'],
        },
      },
      {
        name: 'kanwatch_lookup',
        description: 'Look up the user\'s Kanwatch browsing record beyond what is already in your instructions: a specific day in detail (pass date: "today", "yesterday" or YYYY-MM-DD), or pages they read on a topic in the last 30 days (pass query). Use only when they ask about their browsing, their day, or something they read or watched.',
        parameters: {
          type: 'OBJECT',
          properties: {
            date: { type: 'STRING', description: '"today", "yesterday" or YYYY-MM-DD' },
            query: { type: 'STRING', description: 'Words to find a page they read, e.g. "agents thread"' },
          },
        },
      },
      {
        name: 'kanwatch_set_priority',
        description: 'Save what today’s priority is, in the user’s words, when they tell you it (or change it). It is what the Kanwatch page shows as "This day is for".',
        parameters: {
          type: 'OBJECT',
          properties: {
            priority: { type: 'STRING', description: 'A short phrase in their words, e.g. "ship the template designer fixes"' },
          },
          required: ['priority'],
        },
      },
      {
        name: 'kanwatch_build_app',
        description: 'Build an app from a page the user read that Kanwatch flagged as an app idea. Only after they say yes. mode "new" (default) makes a card from the page and starts building a new app; "extend" adds the idea to the existing app Kanwatch said it fits (they press Update app there).',
        parameters: {
          type: 'OBJECT',
          properties: {
            query: { type: 'STRING', description: 'A few words of the page title or subject' },
            mode: { type: 'STRING', description: '"new" or "extend"' },
            channelId: { type: 'STRING', description: 'Optional: channel for the new card' },
          },
          required: ['query'],
        },
      },
      {
        name: 'archive_card',
        description: 'Archive a card (remove it from the board)',
        parameters: {
          type: 'OBJECT',
          properties: { cardId: { type: 'STRING', description: 'Card ID or card title' } },
          required: ['cardId'],
        },
      },
      {
        name: 'unarchive_card',
        description: 'Unarchive a previously archived card so it shows up on the board again. Use when the user says "unarchive X", "bring back X", or "restore X".',
        parameters: {
          type: 'OBJECT',
          properties: { cardId: { type: 'STRING', description: 'Card ID or card title (search matches archived cards too)' } },
          required: ['cardId'],
        },
      },
      {
        name: 'move_card',
        description: 'Move a card to a different column within its channel. Use when the user says "move X to Y column".',
        parameters: {
          type: 'OBJECT',
          properties: {
            cardId: { type: 'STRING', description: 'Card ID or card title' },
            columnName: { type: 'STRING', description: 'Target column name (e.g. "Done", "In Progress", "Inbox")' },
          },
          required: ['cardId', 'columnName'],
        },
      },
      {
        name: 'create_channel',
        description: "Create a new channel (board), designed from what the user asked for: its instructions, columns and shrooms. Use when they say \"make me a channel for X\" or \"create a board for Y\". Wait until they have finished describing it. Pass brief with EVERYTHING they said they want — every field, rubric, grade, audience, source rule and shroom they asked for — in their words, not condensed. Only pass columnNames when they named columns. Takes several seconds; say you're setting it up. Afterwards describe only what the result says was created.",
        parameters: {
          type: 'OBJECT',
          properties: {
            name: { type: 'STRING', description: 'Channel name, short and specific' },
            brief: { type: 'STRING', description: "Everything the user said they want this channel and its shrooms to do, as fully as they said it. Do not summarize — a long brief makes a better channel." },
            columnNames: {
              type: 'ARRAY',
              items: { type: 'STRING' },
              description: 'ONLY when the user explicitly named columns. Otherwise omit.',
            },
          },
          required: ['name', 'brief'],
        },
      },
      {
        name: 'update_channel',
        description: "Change an existing channel's standing instructions, description or name — e.g. \"also have it consider X\". Use appendInstructions to add a requirement; use instructions only to rewrite them entirely. This does not change shrooms. Never say you updated a channel unless this succeeded.",
        parameters: {
          type: 'OBJECT',
          properties: {
            channelId: { type: 'STRING', description: 'Channel ID or name' },
            appendInstructions: { type: 'STRING', description: "A requirement to add to the channel's instructions, in full" },
            instructions: { type: 'STRING', description: 'Replacement instructions — only when the user wants them rewritten' },
            description: { type: 'STRING', description: 'New one-line description' },
            name: { type: 'STRING', description: 'New channel name' },
          },
          required: ['channelId'],
        },
      },
      {
        name: 'build_app',
        description: "Build a working app from a card, using everything written on the card's thread as the brief. Use when the user says \"build it\", \"make an app out of this\", \"turn this into a prototype\", or \"prototype this\". Takes a minute or two — tell the user you're starting, then confirm when it lands. The result appears on the card's App tab with a preview link.",
        parameters: {
          type: 'OBJECT',
          properties: {
            cardId: { type: 'STRING', description: 'Card ID or card title to build from' },
            prompt: { type: 'STRING', description: 'Optional extra direction beyond what the thread already says' },
            modelId: { type: 'STRING', description: 'Optional model to build with; leave empty for Auto. gemini-3.1-pro-preview is the strong cheap default (a new app is about $0.10), gemini-3.8-flash the fastest, gpt-5.6-sol for complex apps (about $0.25), gpt-6-astra only for hard apps where quality beats cost (about $0.80, up to $1.70). Claude models need an Anthropic key. Only pick one when the user names a model or the app clearly needs more than the default.' },
          },
          required: ['cardId'],
        },
      },
      {
        name: 'draft_email',
        description: 'Draft an email for the user to review before sending. This does NOT send it — it creates a draft on screen. Do NOT read the email content aloud. Infer the best style from context (tone, recipient, purpose) — do NOT ask the user to pick a style. Available styles: professional (formal business), casual (friendly), newsletter (bold header banner), update (channel/project update with label).',
        parameters: {
          type: 'OBJECT',
          properties: {
            to: { type: 'STRING', description: 'Recipient email address' },
            subject: { type: 'STRING', description: 'Email subject line' },
            body: { type: 'STRING', description: 'Email body. Use ## for section headers, - for bullet lists, > for callout quotes, and numbered lists. Bold with **text**. Write naturally — the template handles formatting.' },
            style: { type: 'STRING', description: 'Email style: professional, casual, newsletter, or update' },
            recipientName: { type: 'STRING', description: 'Recipient first name for greeting (optional)' },
            cardTitle: { type: 'STRING', description: 'Title of a referenced Kanthink card (optional)' },
            cardId: { type: 'STRING', description: 'ID of a referenced Kanthink card for linking (optional)' },
            ctaText: { type: 'STRING', description: 'Call-to-action button text (optional)' },
            ctaUrl: { type: 'STRING', description: 'Call-to-action button URL (optional)' },
          },
          required: ['to', 'subject', 'body'],
        },
      },
      {
        name: 'generate_image',
        description: 'Generate an image using AI. Creates a visual image preview on screen. Do NOT describe the generated image in detail — just confirm you\'re generating it and let the visual card appear.',
        parameters: {
          type: 'OBJECT',
          properties: {
            prompt: { type: 'STRING', description: 'Detailed image description/prompt' },
            aspectRatio: { type: 'STRING', description: 'Aspect ratio: 1:1 (default), 3:4, 4:3, 9:16, 16:9' },
          },
          required: ['prompt'],
        },
      },
    ],
  },
  { googleSearch: {} },
];
