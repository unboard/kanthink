/**
 * Smart Shroom (instruction card) generation based on channel intent.
 * Different intents get different types of AI assistance.
 */

import type { ChannelIntent } from './inferIntent';

export interface GeneratedShroom {
  title: string;
  instructions: string;
  action: 'generate' | 'modify' | 'move';
  targetColumnName: string;
  cardCount?: number;
}

export interface GeneratedColumn {
  name: string;
  description: string;
  isAiTarget?: boolean;
}

export interface WorkflowSuggestion {
  label: string;
  value: string;
  description: string;
  columns: string[];
}

/**
 * Get workflow suggestions based on intent.
 * These are the column structure options for the user to choose from.
 */
export function getWorkflowSuggestions(intent: ChannelIntent): WorkflowSuggestion[] {
  switch (intent) {
    case 'learning':
      return [
        {
          label: 'To Learn → Learning → Understood',
          value: 'learning-progress',
          description: 'Track your learning journey from discovery to mastery',
          columns: ['To Learn', 'Learning', 'Understood'],
        },
        {
          label: 'Discover → Review → Reference',
          value: 'discover-review',
          description: 'Explore and curate the best resources',
          columns: ['Discover', 'Review', 'Reference'],
        },
        {
          label: 'Queue → Reading → Archive',
          value: 'reading-queue',
          description: 'Perfect for a reading list',
          columns: ['Queue', 'Reading', 'Archive'],
        },
      ];

    case 'ideas':
      return [
        {
          label: 'Inbox → Promising → Develop',
          value: 'idea-pipeline',
          description: 'Filter and refine your best ideas',
          columns: ['Inbox', 'Promising', 'Develop'],
        },
        {
          label: 'Spark → Draft → Ready',
          value: 'creative-flow',
          description: 'Evolve ideas into finished pieces',
          columns: ['Spark', 'Draft', 'Ready'],
        },
        {
          label: 'Raw → Like → Dislike',
          value: 'evaluate',
          description: 'Sort ideas by gut reaction',
          columns: ['Raw', 'Like', 'Dislike'],
        },
      ];

    case 'tasks':
      return [
        {
          label: 'Backlog → This Week → Done',
          value: 'timeboxed',
          description: 'Focus on what matters this week',
          columns: ['Backlog', 'This Week', 'Done'],
        },
        {
          label: 'To Do → Doing → Done',
          value: 'kanban',
          description: 'Classic progress tracking',
          columns: ['To Do', 'Doing', 'Done'],
        },
        {
          label: 'Ideas → Planning → Active → Done',
          value: 'project-stages',
          description: 'From concept to completion',
          columns: ['Ideas', 'Planning', 'Active', 'Done'],
        },
      ];

    case 'tracking':
      return [
        {
          label: 'New → Important → Reviewed',
          value: 'news-flow',
          description: 'Stay on top of updates',
          columns: ['New', 'Important', 'Reviewed'],
        },
        {
          label: 'Watching → Flagged → Archive',
          value: 'monitor',
          description: 'Track what needs attention',
          columns: ['Watching', 'Flagged', 'Archive'],
        },
        {
          label: 'Inbox → Act On → Reference',
          value: 'action-oriented',
          description: 'Turn updates into actions',
          columns: ['Inbox', 'Act On', 'Reference'],
        },
      ];

    default:
      return [
        {
          label: 'Inbox → Review → Done',
          value: 'basic',
          description: 'Simple three-column workflow',
          columns: ['Inbox', 'Review', 'Done'],
        },
        {
          label: 'New → Active → Archive',
          value: 'lifecycle',
          description: 'Track item lifecycle',
          columns: ['New', 'Active', 'Archive'],
        },
        {
          label: 'Queue → Processing → Complete',
          value: 'processing',
          description: 'Process items through stages',
          columns: ['Queue', 'Processing', 'Complete'],
        },
      ];
  }
}

/**
 * Generate appropriate shrooms (instruction cards) based on intent.
 *
 * KEY INSIGHT: Task management channels should NOT have a "generate cards"
 * shroom because users create their own tasks. Instead, they get a "modify"
 * shroom that helps enrich existing tasks.
 */
export function getShroomsForIntent(
  intent: ChannelIntent,
  columns: string[],
  topic?: string
): GeneratedShroom[] {
  const firstColumn = columns[0] || 'Inbox';
  const topicContext = topic ? ` about ${topic}` : '';

  switch (intent) {
    case 'learning':
      return [
        {
          title: 'Discover Resources',
          action: 'generate',
          targetColumnName: firstColumn,
          cardCount: 5,
          instructions: `Find interesting articles, videos, and resources${topicContext}. Focus on high-quality, educational content that helps deepen understanding. Include a mix of beginner-friendly and more advanced material.`,
        },
      ];

    case 'ideas':
      return [
        {
          title: 'Generate Ideas',
          action: 'generate',
          targetColumnName: firstColumn,
          cardCount: 5,
          instructions: `Brainstorm creative ideas and angles${topicContext}. Think outside the box and suggest unexpected connections. Each idea should be specific enough to act on, with a clear hook or unique angle.`,
        },
      ];

    case 'tasks':
      // IMPORTANT: Task channels do NOT get a "generate" shroom
      // Users create their own tasks - AI helps enrich them
      return [
        {
          title: 'Enrich Tasks',
          action: 'modify',
          targetColumnName: 'board', // Special: applies to all columns
          instructions: `Review the existing tasks${topicContext} and add helpful context. Break down large tasks into smaller steps, suggest useful details, and add relevant notes that make tasks more actionable.`,
        },
      ];

    case 'tracking':
      return [
        {
          title: 'Find Updates',
          action: 'generate',
          targetColumnName: firstColumn,
          cardCount: 5,
          instructions: `Surface relevant news, updates, and developments${topicContext}. Focus on recent and significant items. Filter out noise and highlight what actually matters.`,
        },
      ];

    default:
      return [
        {
          title: 'Generate Cards',
          action: 'generate',
          targetColumnName: firstColumn,
          cardCount: 5,
          instructions: `Generate helpful cards${topicContext}. Create content that is actionable, relevant, and useful for organizing information.`,
        },
      ];
  }
}

/**
 * Get a channel name suggestion based on intent and topic
 */
export function suggestChannelName(intent: ChannelIntent, topic?: string): string {
  if (topic) {
    // Clean up the topic and capitalize
    const cleanTopic = topic.trim().replace(/^(my|a|an|the)\s+/i, '');
    const capitalizedTopic = cleanTopic.charAt(0).toUpperCase() + cleanTopic.slice(1);

    // For shorter topics, add a suffix based on intent
    if (cleanTopic.length < 20) {
      switch (intent) {
        case 'learning':
          return `${capitalizedTopic} Learning`;
        case 'ideas':
          return `${capitalizedTopic} Ideas`;
        case 'tasks':
          return capitalizedTopic;
        case 'tracking':
          return `${capitalizedTopic} Watch`;
        default:
          return capitalizedTopic;
      }
    }

    return capitalizedTopic;
  }

  // Fallback names by intent
  const names: Record<ChannelIntent, string> = {
    learning: 'Learning Hub',
    ideas: 'Idea Space',
    tasks: 'Project Board',
    tracking: 'Watch List',
    unknown: 'New Channel',
  };

  return names[intent];
}

/**
 * Get a channel description based on intent and topic
 */
export function suggestChannelDescription(intent: ChannelIntent, topic?: string): string {
  const topicPart = topic ? ` about ${topic}` : '';

  const descriptions: Record<ChannelIntent, string> = {
    learning: `Explore and learn${topicPart}`,
    ideas: `Brainstorm and develop ideas${topicPart}`,
    tasks: `Organize and track work${topicPart}`,
    tracking: `Monitor updates and developments${topicPart}`,
    unknown: `A space to organize${topicPart}`,
  };

  return descriptions[intent];
}

/**
 * Get AI instructions for the channel based on intent
 */
export function getChannelInstructions(intent: ChannelIntent, topic?: string): string {
  const topicContext = topic ? ` Focus specifically on ${topic}.` : '';

  const instructions: Record<ChannelIntent, string> = {
    learning: `Generate insightful learning resources and thought-provoking questions. Help the user explore new concepts and deepen their understanding.${topicContext} Create cards that encourage curiosity and make complex topics approachable.`,
    ideas: `Generate creative ideas and unexpected angles. Think divergently and suggest novel connections.${topicContext} Create cards that spark imagination and can be developed further.`,
    tasks: `Help break down work into clear, actionable tasks. Add useful context and suggest ways to make tasks more manageable.${topicContext} Focus on clarity and actionability.`,
    tracking: `Surface relevant updates and filter out noise. Highlight what's important and time-sensitive.${topicContext} Create cards that help the user stay informed without being overwhelmed.`,
    unknown: `Generate helpful, relevant content.${topicContext} Focus on being useful and actionable.`,
  };

  return instructions[intent];
}
