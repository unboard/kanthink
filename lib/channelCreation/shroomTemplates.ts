/**
 * Pre-built Shroom templates that AI can pull from based on use case.
 * These represent common high-value workflows for our target personas:
 * product managers, solo entrepreneurs, developers, creators.
 */

export interface ShroomTemplate {
  id: string;
  title: string;
  description: string;
  action: 'generate' | 'modify' | 'move';
  instructions: string;
  cardCount?: number;
  // Which intents/use cases this template is good for
  tags: string[];
  // Emoji or icon identifier
  icon: string;
}

export const SHROOM_TEMPLATES: ShroomTemplate[] = [
  // === RESEARCH & TRACKING ===
  {
    id: 'find-competitors',
    title: 'Find Competitors',
    description: 'Discover companies in your space',
    action: 'generate',
    instructions: 'Research and identify competitors in this market. For each competitor, note their main product, target audience, key differentiators, and approximate size/stage. Focus on both direct competitors and adjacent players.',
    cardCount: 5,
    tags: ['competitors', 'research', 'tracking', 'market'],
    icon: '🔍',
  },
  {
    id: 'track-competitor-moves',
    title: 'Track Competitor Updates',
    description: 'Surface recent news and changes',
    action: 'generate',
    instructions: 'Find recent news, product launches, funding announcements, and strategic moves from competitors. Prioritize actionable intelligence over general news. Include source links where possible.',
    cardCount: 5,
    tags: ['competitors', 'tracking', 'news'],
    icon: '📡',
  },
  {
    id: 'industry-trends',
    title: 'Surface Industry Trends',
    description: 'What\'s happening in your space',
    action: 'generate',
    instructions: 'Identify emerging trends, shifts in the market, new technologies, and changing customer behaviors relevant to this industry. Focus on trends that could impact product strategy.',
    cardCount: 5,
    tags: ['tracking', 'trends', 'research', 'market'],
    icon: '📈',
  },

  // === IDEATION & PRODUCT ===
  {
    id: 'generate-ideas',
    title: 'Brainstorm Ideas',
    description: 'Generate fresh concepts and angles',
    action: 'generate',
    instructions: 'Generate creative product ideas, feature concepts, or business angles. Each idea should have a clear value proposition and target user. Think outside the box but stay grounded in real user needs.',
    cardCount: 5,
    tags: ['ideas', 'product', 'brainstorm', 'features'],
    icon: '💡',
  },
  {
    id: 'write-prd',
    title: 'Draft PRD',
    description: 'Turn an idea into a product spec',
    action: 'modify',
    instructions: 'For each card, expand it into a lightweight PRD format: Problem statement, proposed solution, key user stories, success metrics, and open questions. Keep it concise but complete enough to share with a team.',
    tags: ['product', 'prd', 'planning', 'specs'],
    icon: '📋',
  },
  {
    id: 'user-problems',
    title: 'Find User Problems',
    description: 'Surface pain points worth solving',
    action: 'generate',
    instructions: 'Identify common user problems, frustrations, and unmet needs in this domain. For each problem, note who experiences it, how severe it is, and what current workarounds exist. Prioritize problems that are frequent and painful.',
    cardCount: 5,
    tags: ['ideas', 'research', 'users', 'problems'],
    icon: '😤',
  },
  {
    id: 'swot-analysis',
    title: 'SWOT Analysis',
    description: 'Strengths, weaknesses, opportunities, threats',
    action: 'generate',
    instructions: 'Generate a SWOT analysis with separate cards for: key Strengths to leverage, Weaknesses to address, Opportunities to pursue, and Threats to monitor. Be specific and actionable.',
    cardCount: 4,
    tags: ['product', 'strategy', 'analysis', 'planning'],
    icon: '⚖️',
  },

  // === PLANNING & TASKS ===
  {
    id: 'break-down-tasks',
    title: 'Break Down Work',
    description: 'Split big tasks into smaller steps',
    action: 'modify',
    instructions: 'For each card, break it down into smaller, actionable subtasks. Each subtask should be completable in a single work session. Add any dependencies or blockers that should be noted.',
    tags: ['tasks', 'planning', 'project'],
    icon: '✂️',
  },
  {
    id: 'estimate-effort',
    title: 'Estimate & Prioritize',
    description: 'Add effort estimates and priority',
    action: 'modify',
    instructions: 'For each task, add a rough effort estimate (small/medium/large) and suggest a priority level based on impact vs effort. Note any dependencies that affect sequencing.',
    tags: ['tasks', 'planning', 'prioritization'],
    icon: '⏱️',
  },
  {
    id: 'identify-risks',
    title: 'Identify Risks',
    description: 'Surface potential blockers',
    action: 'generate',
    instructions: 'Identify potential risks, blockers, and things that could go wrong with this project. For each risk, note the likelihood, impact, and possible mitigation strategies.',
    cardCount: 5,
    tags: ['tasks', 'planning', 'risks', 'project'],
    icon: '⚠️',
  },

  // === LEARNING & RESEARCH ===
  {
    id: 'find-resources',
    title: 'Find Learning Resources',
    description: 'Articles, videos, courses',
    action: 'generate',
    instructions: 'Find high-quality learning resources: articles, tutorials, videos, courses, and documentation. Prioritize practical, well-explained content over comprehensive but dense material. Include a mix of beginner and advanced resources.',
    cardCount: 5,
    tags: ['learning', 'research', 'resources'],
    icon: '📚',
  },
  {
    id: 'key-concepts',
    title: 'Explain Key Concepts',
    description: 'Break down what you need to know',
    action: 'generate',
    instructions: 'Identify and explain the key concepts someone needs to understand in this area. Each card should cover one concept clearly, with practical examples. Build from foundational to advanced.',
    cardCount: 5,
    tags: ['learning', 'concepts', 'education'],
    icon: '🧠',
  },
  {
    id: 'summarize-content',
    title: 'Summarize & Extract',
    description: 'Pull out key insights',
    action: 'modify',
    instructions: 'For each card, summarize the key insights, takeaways, and actionable points. Highlight what\'s most important and what can be applied immediately.',
    tags: ['learning', 'reading', 'summary'],
    icon: '📝',
  },

  // === CONTENT & CREATION ===
  {
    id: 'content-ideas',
    title: 'Generate Content Ideas',
    description: 'Topics for posts, videos, articles',
    action: 'generate',
    instructions: 'Generate content ideas that would resonate with the target audience. Each idea should have a clear hook, angle, and format suggestion (post, thread, video, article). Focus on ideas that provide genuine value.',
    cardCount: 5,
    tags: ['ideas', 'content', 'creator', 'marketing'],
    icon: '✍️',
  },
  {
    id: 'outline-content',
    title: 'Create Outlines',
    description: 'Structure your content',
    action: 'modify',
    instructions: 'For each content idea, create a detailed outline: intro hook, main sections with key points, examples to include, and a strong conclusion/CTA. Make it ready to write from.',
    tags: ['content', 'creator', 'writing'],
    icon: '📑',
  },
];

/**
 * Get shroom templates that match given tags
 */
export function getTemplatesForTags(tags: string[]): ShroomTemplate[] {
  const loweredTags = tags.map(t => t.toLowerCase());

  return SHROOM_TEMPLATES.filter(template =>
    template.tags.some(tag => loweredTags.includes(tag))
  ).sort((a, b) => {
    // Sort by number of matching tags (most relevant first)
    const aMatches = a.tags.filter(t => loweredTags.includes(t)).length;
    const bMatches = b.tags.filter(t => loweredTags.includes(t)).length;
    return bMatches - aMatches;
  });
}

/**
 * Get recommended templates based on intent and topic
 */
export function getRecommendedTemplates(
  intent: string,
  topic?: string
): ShroomTemplate[] {
  const tags: string[] = [];

  // Map intent to tags
  switch (intent) {
    case 'learning':
      tags.push('learning', 'research', 'resources', 'concepts');
      break;
    case 'ideas':
      tags.push('ideas', 'product', 'brainstorm', 'features');
      break;
    case 'tasks':
      tags.push('tasks', 'planning', 'project');
      break;
    case 'tracking':
      tags.push('tracking', 'competitors', 'trends', 'news');
      break;
  }

  // Add topic-specific tags
  if (topic) {
    const lowerTopic = topic.toLowerCase();
    if (lowerTopic.includes('competitor')) tags.push('competitors');
    if (lowerTopic.includes('product') || lowerTopic.includes('feature')) tags.push('product', 'prd');
    if (lowerTopic.includes('content') || lowerTopic.includes('creator')) tags.push('content', 'creator');
    if (lowerTopic.includes('market') || lowerTopic.includes('industry')) tags.push('market', 'trends');
  }

  return getTemplatesForTags(tags).slice(0, 4); // Return top 4 matches
}

export interface ChannelContext {
  topic?: string;      // e.g., "brainstorm and develop product ideas"
  details?: string;    // e.g., "SaaS and B2B products"
  channelName?: string;
}

/**
 * Inject channel context into template instructions.
 * Makes generic templates specific to the user's actual use case.
 */
function contextualizeInstructions(
  baseInstructions: string,
  context: ChannelContext
): string {
  const { topic, details } = context;

  // Build context string
  const contextParts: string[] = [];
  if (details) {
    contextParts.push(details);
  } else if (topic) {
    contextParts.push(topic);
  }

  if (contextParts.length === 0) {
    return baseInstructions;
  }

  const contextStr = contextParts.join(' - ');

  // Inject context at the start of instructions
  return `Focus on: ${contextStr}.\n\n${baseInstructions}`;
}

/**
 * Convert a template to an instruction card format.
 * Injects channel context to make instructions specific and actionable.
 */
export function templateToInstructionCard(
  template: ShroomTemplate,
  targetColumnName: string,
  context?: ChannelContext
) {
  const instructions = context
    ? contextualizeInstructions(template.instructions, context)
    : template.instructions;

  return {
    title: template.title,
    instructions,
    action: template.action,
    targetColumnName: template.action === 'modify' ? 'board' : targetColumnName,
    cardCount: template.cardCount,
  };
}
