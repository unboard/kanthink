import { NextResponse } from 'next/server';
import { createLLMClient, getLLMClientForUser, type LLMMessage, type LLMProvider } from '@/lib/ai/llm';
import { auth } from '@/lib/auth';
import { recordUsage } from '@/lib/usage';

interface GuideStep {
  id: string;
  message: string;
  options: Array<{
    label: string;
    value: string;
    description?: string;
  }>;
  allowCustom?: boolean;
  customPlaceholder?: string;
}

interface ChannelStructure {
  channelName: string;
  channelDescription: string;
  instructions: string;
  columns: Array<{
    name: string;
    description: string;
    isAiTarget?: boolean;
  }>;
  instructionCards: Array<{
    title: string;
    instructions: string;
    action: 'generate' | 'modify' | 'move';
    targetColumnName: string;
    cardCount?: number;
  }>;
}

interface GuideResult {
  channelName: string;
  channelDescription: string;
  instructions: string;
  choices: Record<string, string>;
  structure?: ChannelStructure;
}

interface GuideRequest {
  action: 'start' | 'continue';
  channelName?: string;
  choices: Record<string, string>;
  choiceLabels?: Record<string, string>;
  lastChoice?: { stepId: string; value: string; label?: string };
  aiConfig: {
    provider: 'anthropic' | 'openai';
    apiKey: string;
    model?: string;
  };
}

// Generate a dynamic, contextual response after the detail step
async function generateContextualWorkflowStep(
  choices: Record<string, string>,
  choiceLabels: Record<string, string>,
  llm: LLMProvider
): Promise<GuideStep> {

  const purposeLabel = choiceLabels.purpose || choices.purpose;
  const topicLabel = choiceLabels.topic || choices.topic;
  const detailLabel = choiceLabels.detail || choices.detail;
  const subject = detailLabel || topicLabel;

  const systemPrompt = `You help users set up a Kanban channel in Kanthink.

ABOUT KANTHINK:
Kanthink is a text-based kanban board for organizing ideas, information, and tasks.
Cards contain titles, messages, and tags. Users move cards between columns to categorize and track them.

YOUR TASK:
Generate a brief acknowledgment of their topic and suggest 3 workflow options with columns that serve their stated goal.

COLUMN GUIDELINES:
- Each column needs a clear purpose - users should know what belongs there
- Columns can be: progress stages, categories, time buckets, priority levels, or evaluative groupings
- Choose structures that help the user achieve their stated goal
- Don't suggest columns that imply content types the app doesn't support (visual designs, sketches, mockups, physical items)
- Focus on how users will organize and evaluate information, not on domain-specific production processes

EXAMPLES OF GOOD STRUCTURES:
- For collecting ideas: "Inbox → Interesting → Worth Pursuing → Parked"
- For research: "To Explore → Researching → Key Insights → Reference"
- For tracking news: "New → Important → Reviewed → Archive"
- For planning: "Ideas → This Week → Today → Done"
- For evaluation: "Unsorted → Like → Dislike → Undecided"
- For learning: "Topics to Learn → Studying → Understood"

Respond in JSON only (no markdown):
{
  "acknowledgment": "A brief 1-sentence acknowledgment that shows you understand their goal. Be specific, not generic.",
  "options": [
    {
      "label": "Column1 → Column2 → Column3",
      "value": "workflow-1",
      "description": "Brief explanation of what each column is for"
    },
    {
      "label": "Column1 → Column2 → Column3",
      "value": "workflow-2",
      "description": "Brief explanation of what each column is for"
    },
    {
      "label": "Column1 → Column2 → Column3",
      "value": "workflow-3",
      "description": "Brief explanation of what each column is for"
    }
  ]
}

Make column names contextual to their topic while serving their organizational goal.`;

  const userPrompt = `User's goal: ${purposeLabel}
Category: ${topicLabel}
Specific focus: ${subject}

Generate an acknowledgment and 3 workflow options that help this user organize information about "${subject}". The columns should serve their goal of "${purposeLabel}".`;

  const messages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  try {
    const response = await llm.complete(messages);
    let jsonStr = response.content;
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }

    const result = JSON.parse(jsonStr.trim());

    return {
      id: 'workflow',
      message: `${result.acknowledgment}\n\nHow would you like to organize your board?`,
      options: result.options || [],
      allowCustom: true,
      customPlaceholder: "Describe your preferred workflow...",
    };
  } catch (err) {
    console.error('Failed to generate contextual workflow:', err);
    // Fallback to static options
    return {
      id: 'workflow',
      message: `Great choice! "${subject}" is a fascinating area to explore.\n\nHow would you like to organize your board?`,
      options: [
        { label: "Discover → Review → Archive", value: "discover-review", description: "Explore and curate the best content" },
        { label: "To Learn → Learning → Learned", value: "learning", description: "Track your learning progress" },
        { label: "New → Important → Reference", value: "curation", description: "Build a reference library" },
      ],
      allowCustom: true,
      customPlaceholder: "Describe your preferred workflow...",
    };
  }
}

// Contextual messages that explain what we're building
function getContextualMessage(stepId: string, choices: Record<string, string>, lastChoice?: string): string {
  if (stepId === 'purpose') {
    return "Let's create a new channel. Channels are AI-powered spaces that generate and organize cards based on your goals. What would you like this channel to help you with?";
  }

  if (stepId === 'topic') {
    const purposeContext: Record<string, string> = {
      learning: "Great choice! Learning channels work by generating cards with insights, questions, and resources. The AI will curate ideas and help you explore topics deeply.",
      content: "Content channels are perfect for ideation. The AI will generate cards with ideas, drafts, and prompts that you can develop further.",
      tasks: "Task channels help you stay organized. The AI can break down projects, suggest next steps, and help prioritize what matters.",
      tracking: "Tracking channels keep you informed. The AI monitors topics and surfaces relevant updates as cards you can review and act on.",
    };
    return purposeContext[choices.purpose] || "Now let's narrow down what you want to focus on.";
  }

  if (stepId === 'workflow') {
    return "Now I'll set up the columns for your board. Columns represent different stages or categories for your cards. How do you want to organize things?";
  }

  if (stepId === 'style') {
    return "Almost done! This affects how the AI generates content for you — whether it dives deep or keeps things snappy.";
  }

  return "";
}

// Topics that need follow-up to ask what specifically
const TOPICS_NEEDING_DETAIL: Record<string, string> = {
  'subject': 'What subject do you want to explore?',
  'technical': 'What technology or skill do you want to learn?',
  'product': 'What kind of product or business area?',
  'creative': 'What type of creative work?',
  'work': 'What project or area of work?',
  'side': 'What side project are you working on?',
  'goals': 'What goal are you working toward?',
  'news': 'What industry or field?',
  'competitors': 'What company or space are you tracking?',
  'tech': 'What technologies are you following?',
  'people': 'Who do you want to follow?',
};

// Dynamic flow based on choices
function getNextStep(choices: Record<string, string>): { step: GuideStep; stepId: string; needsDynamicGeneration?: boolean } | null {
  // Step 1: Purpose
  if (!choices.purpose) {
    return {
      stepId: 'purpose',
      step: {
        id: 'purpose',
        message: getContextualMessage('purpose', choices),
        options: [
          { label: "Learning & Research", value: "learning", description: "Explore topics, find insights, build knowledge" },
          { label: "Ideas & Brainstorming", value: "content", description: "Generate creative ideas and content" },
          { label: "Projects & Tasks", value: "tasks", description: "Organize work and track progress" },
          { label: "Monitoring & Tracking", value: "tracking", description: "Stay updated on topics that matter" },
        ],
        allowCustom: true,
        customPlaceholder: "Describe what you want to do...",
      },
    };
  }

  // Step 2: Topic/Focus - more specific based on purpose
  if (!choices.topic) {
    const topicOptions: Record<string, GuideStep['options']> = {
      learning: [
        { label: "Books & Reading", value: "books", description: "Book recommendations and reading insights" },
        { label: "Technical Skills", value: "technical", description: "Programming, tools, and tech concepts" },
        { label: "Personal Growth", value: "growth", description: "Psychology, productivity, life skills" },
        { label: "A Specific Subject", value: "subject", description: "Deep dive into one topic" },
      ],
      content: [
        { label: "Writing Ideas", value: "writing", description: "Blog posts, essays, articles" },
        { label: "Product Concepts", value: "product", description: "Features, apps, business ideas" },
        { label: "Creative Projects", value: "creative", description: "Art, music, design inspiration" },
        { label: "General Brainstorming", value: "brainstorm", description: "Open-ended idea generation" },
      ],
      tasks: [
        { label: "Work Projects", value: "work", description: "Professional tasks and deadlines" },
        { label: "Side Projects", value: "side", description: "Personal projects and hobbies" },
        { label: "Goals & Habits", value: "goals", description: "Long-term objectives and routines" },
        { label: "Daily Planning", value: "daily", description: "Day-to-day task management" },
      ],
      tracking: [
        { label: "Industry & News", value: "news", description: "Trends and developments" },
        { label: "Competitors", value: "competitors", description: "What others are doing" },
        { label: "Technologies", value: "tech", description: "Tools, frameworks, updates" },
        { label: "People & Creators", value: "people", description: "Influencers, experts, creators" },
      ],
    };

    const options = topicOptions[choices.purpose] || topicOptions.content;

    return {
      stepId: 'topic',
      step: {
        id: 'topic',
        message: getContextualMessage('topic', choices),
        options,
        allowCustom: true,
        customPlaceholder: "Be more specific about your focus...",
      },
    };
  }

  // Step 2.5: Detail - ask for specifics if the topic needs it
  if (!choices.detail && TOPICS_NEEDING_DETAIL[choices.topic]) {
    return {
      stepId: 'detail',
      step: {
        id: 'detail',
        message: TOPICS_NEEDING_DETAIL[choices.topic],
        options: [], // No predefined options - user must type
        allowCustom: true,
        customPlaceholder: "Type your answer...",
      },
    };
  }

  // Step 3: Workflow preference - affects column structure
  // This step is now generated dynamically by the POST handler for personalized options
  if (!choices.workflow) {
    return {
      stepId: 'workflow',
      step: {
        id: 'workflow',
        message: '', // Will be replaced by dynamic generation
        options: [],
        allowCustom: true,
        customPlaceholder: "Describe your preferred workflow...",
      },
      needsDynamicGeneration: true,
    };
  }

  // Step 4: AI Style
  if (!choices.style) {
    return {
      stepId: 'style',
      step: {
        id: 'style',
        message: getContextualMessage('style', choices),
        options: [
          { label: "Thoughtful & Deep", value: "thoughtful", description: "Detailed, nuanced, thorough" },
          { label: "Quick & Actionable", value: "practical", description: "Concise, to-the-point, useful" },
          { label: "Creative & Surprising", value: "creative", description: "Unexpected angles, novel ideas" },
          { label: "Balanced", value: "balanced", description: "Mix of depth and brevity" },
        ],
        allowCustom: true,
        customPlaceholder: "Describe your preferred style...",
      },
    };
  }

  // All steps complete
  return null;
}

async function generateChannelStructure(
  choices: Record<string, string>,
  choiceLabels: Record<string, string>,
  channelName: string | undefined,
  llm: LLMProvider
): Promise<GuideResult> {

  const systemPrompt = `You are helping create an AI-powered Kanban channel. Based on the user's choices, generate a complete channel configuration.

The channel will have:
- A name and description
- Columns (3-4) that represent stages/categories for cards
- AI instructions that guide what content to generate
- 1-2 instruction cards (pre-built AI actions users can run)

IMPORTANT: The first column should typically be where AI generates new cards (isAiTarget: true).

Respond with valid JSON only (no markdown):
{
  "channelName": "Name (2-4 words)",
  "channelDescription": "One sentence describing the channel's purpose",
  "columns": [
    { "name": "Column Name", "description": "What goes here", "isAiTarget": true/false }
  ],
  "instructions": "2-4 sentences telling the AI what kind of cards to generate, what topics to focus on, and what style to use. Be specific and actionable.",
  "instructionCards": [
    {
      "title": "Action Name (e.g., 'Generate Ideas', 'Find Resources')",
      "instructions": "REQUIRED: 2-3 sentences describing what this action does. Tell the AI what to generate, what angle to take, and what makes a good result. Example: 'Generate product feature ideas focused on user pain points. Each idea should include a problem statement and proposed solution. Prioritize ideas that improve user workflow efficiency.'",
      "action": "generate",
      "targetColumnName": "Which column to put results",
      "cardCount": 5
    }
  ]
}

CRITICAL: Every instructionCard MUST have a non-empty "instructions" field with actual content. This field tells the AI what to do when the user runs this action. Without it, the action won't work.`;

  // Use human-readable labels for better AI understanding
  const purposeLabel = choiceLabels.purpose || choices.purpose;
  const baseTopicLabel = choiceLabels.topic || choices.topic;
  const detailLabel = choiceLabels.detail || choices.detail;
  const workflowLabel = choiceLabels.workflow || choices.workflow;
  const styleLabel = choiceLabels.style || choices.style;

  // Combine topic with detail if provided (e.g., "Technical Skills" + "Rust programming" = "Rust programming")
  const topicLabel = detailLabel || baseTopicLabel;
  const fullContext = detailLabel ? `${baseTopicLabel}: ${detailLabel}` : baseTopicLabel;

  const userPrompt = `Create a channel for a user who wants to:
- PURPOSE: "${purposeLabel}"
- CATEGORY: "${baseTopicLabel}"
${detailLabel ? `- SPECIFIC TOPIC: "${detailLabel}"` : ''}
- WORKFLOW STYLE: "${workflowLabel}"
- CONTENT TONE: "${styleLabel}"
${channelName ? `- SUGGESTED NAME: "${channelName}"` : ''}

IMPORTANT: Generate content that is SPECIFICALLY about "${topicLabel}". Do NOT use generic placeholders.

The channel name should reflect "${topicLabel}" specifically.
The AI instructions must tell the AI exactly what kind of "${topicLabel}" content to generate.
Each instruction card MUST have detailed instructions (2-3 sentences) explaining what to generate and how. These instructions power the action - without them, the action does nothing.

Example: If the user wants to learn "Rust programming", the channel might be "Rust Learning" with instructions like "Generate learning resources, concepts, and exercises for Rust programming. Cover ownership, borrowing, lifetimes, and async patterns. Focus on practical examples."

Make every field specific to what the user actually chose: "${fullContext}".`;

  const messages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  const response = await llm.complete(messages);

  try {
    // Extract JSON from response
    let jsonStr = response.content;
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }

    const structure: ChannelStructure = JSON.parse(jsonStr.trim());

    // Validate and provide defaults
    if (!structure.columns || structure.columns.length === 0) {
      structure.columns = [
        { name: 'Inbox', description: 'New items', isAiTarget: true },
        { name: 'Review', description: 'Items to evaluate', isAiTarget: false },
        { name: 'Done', description: 'Completed items', isAiTarget: false },
      ];
    }

    if (!structure.instructionCards || structure.instructionCards.length === 0) {
      structure.instructionCards = [{
        title: 'Generate Cards',
        instructions: structure.instructions,
        action: 'generate',
        targetColumnName: structure.columns[0].name,
        cardCount: 5,
      }];
    } else {
      // Ensure each instruction card has instructions - fall back to channel instructions if missing
      structure.instructionCards = structure.instructionCards.map(ic => ({
        ...ic,
        instructions: ic.instructions?.trim() || structure.instructions || '',
      }));
    }

    return {
      channelName: channelName || structure.channelName || 'New Channel',
      channelDescription: structure.channelDescription || `A channel for ${choices.purpose}`,
      instructions: structure.instructions || '',
      choices,
      structure,
    };
  } catch (err) {
    console.error('Failed to parse AI response:', err, response.content);

    // Fallback with sensible defaults based on workflow choice
    const workflowColumns: Record<string, ChannelStructure['columns']> = {
      'explore-review': [
        { name: 'Explore', description: 'New discoveries', isAiTarget: true },
        { name: 'Review', description: 'Worth a closer look' },
        { name: 'Apply', description: 'Put into practice' },
      ],
      'queue-reading': [
        { name: 'Queue', description: 'To read', isAiTarget: true },
        { name: 'Reading', description: 'Currently reading' },
        { name: 'Done', description: 'Finished' },
      ],
      'development': [
        { name: 'Ideas', description: 'Raw ideas', isAiTarget: true },
        { name: 'Developing', description: 'Work in progress' },
        { name: 'Ready', description: 'Ready to use' },
      ],
      'kanban': [
        { name: 'To Do', description: 'Pending tasks', isAiTarget: true },
        { name: 'Doing', description: 'In progress' },
        { name: 'Done', description: 'Completed' },
      ],
      'timeboxed': [
        { name: 'Backlog', description: 'All tasks', isAiTarget: true },
        { name: 'This Week', description: 'Current focus' },
        { name: 'Today', description: "Today's priorities" },
        { name: 'Done', description: 'Completed' },
      ],
    };

    const columns = workflowColumns[choices.workflow] || workflowColumns.kanban;
    const fallbackInstructions = `Generate ${styleLabel} content about ${topicLabel}. Focus on ${purposeLabel}. Create cards that are actionable and relevant.`;
    const fallbackName = channelName || topicLabel || 'New Channel';

    return {
      channelName: fallbackName,
      channelDescription: `A channel for ${purposeLabel} focused on ${topicLabel}`,
      instructions: fallbackInstructions,
      choices,
      structure: {
        channelName: fallbackName,
        channelDescription: `A channel for ${purposeLabel} focused on ${topicLabel}`,
        instructions: fallbackInstructions,
        columns,
        instructionCards: [{
          title: `Generate ${topicLabel}`,
          instructions: fallbackInstructions,
          action: 'generate',
          targetColumnName: columns[0].name,
          cardCount: 5,
        }],
      },
    };
  }
}

export async function POST(request: Request) {
  try {
    const body: GuideRequest = await request.json();
    const { action, channelName, choices, choiceLabels = {}, aiConfig } = body;

    // Lazily resolve the LLM client only when AI is actually needed.
    // Early steps (start, static continue) are purely static and don't require auth or keys.
    let _llmCache: { llm: LLMProvider; userId?: string; usingOwnerKey: boolean } | null = null;

    async function requireLLM() {
      if (_llmCache) return _llmCache;

      const session = await auth();
      const userId = session?.user?.id;

      if (userId) {
        const result = await getLLMClientForUser(userId);
        if (!result.client) {
          throw new Error(result.error || 'No AI access available');
        }
        _llmCache = { llm: result.client, userId, usingOwnerKey: result.source === 'owner' };
        return _llmCache;
      }

      if (aiConfig?.apiKey) {
        const client = createLLMClient({
          provider: aiConfig.provider,
          apiKey: aiConfig.apiKey,
          model: aiConfig.model,
        });
        _llmCache = { llm: client, usingOwnerKey: false };
        return _llmCache;
      }

      throw new Error('Please sign in or configure an API key in Settings.');
    }

    if (action === 'start') {
      const next = getNextStep({});
      if (next) {
        return NextResponse.json({ step: next.step });
      }
    }

    if (action === 'continue') {
      const next = getNextStep(choices);

      if (next) {
        // Check if this step needs dynamic AI generation
        if (next.needsDynamicGeneration && next.stepId === 'workflow') {
          try {
            const { llm, userId, usingOwnerKey } = await requireLLM();
            const dynamicStep = await generateContextualWorkflowStep(choices, choiceLabels, llm);
            if (userId && usingOwnerKey) {
              await recordUsage(userId, 'instruction-guide');
            }
            return NextResponse.json({ step: dynamicStep });
          } catch (err) {
            console.error('Failed to generate dynamic step:', err);
            // Fall back to static step
            return NextResponse.json({ step: next.step });
          }
        }
        return NextResponse.json({ step: next.step });
      } else {
        // All steps complete - generate full channel structure
        try {
          const { llm, userId, usingOwnerKey } = await requireLLM();
          const result = await generateChannelStructure(choices, choiceLabels, channelName, llm);
          if (userId && usingOwnerKey) {
            await recordUsage(userId, 'instruction-guide');
          }

          // Build a summary message explaining what was created
          const structure = result.structure;
          const columnNames = structure?.columns.map(c => c.name).join(' → ') || 'Inbox → Review → Done';
          const topicLabel = choiceLabels.topic || choices.topic;

          return NextResponse.json({
            complete: true,
            result,
            message: `I've designed your channel with a ${columnNames} workflow focused on ${topicLabel}.`,
          });
        } catch (err) {
          console.error('Failed to generate channel structure:', err);
          const message = err instanceof Error ? err.message : 'Failed to generate channel configuration';
          return NextResponse.json(
            { error: message },
            { status: 500 }
          );
        }
      }
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Instruction guide error:', error);
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 }
    );
  }
}
