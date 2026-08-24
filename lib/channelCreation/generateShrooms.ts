/**
 * Smart Shroom (instruction card) generation based on channel intent.
 * Different intents get different types of AI assistance.
 */

import type { ChannelIntent } from './inferIntent';

export interface GeneratedShroom {
  title: string;
  instructions: string;
  action: 'generate' | 'modify' | 'move' | 'build';
  targetColumnName: string;
  cardCount?: number;
  /** For action:'move' — where cards go. Ignored by the other actions. */
  moveToColumnName?: string;
  /**
   * Run this shroom when a card ARRIVES in its target column, rather than on a
   * schedule. This is what makes a pipeline walk itself: each stage fires on the
   * handoff from the one before it.
   */
  triggerOnArrival?: boolean;
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
          label: 'Idea → PM → CTO → Design → Build',
          value: 'app-assembly-line',
          description: 'Each column adds a layer, the last one builds the app',
          columns: ['Inbox', 'Promising', 'Requirements', 'Spec', 'Design', 'Build'],
        },
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

  // An assembly line is a different animal from a normal channel: each column is a
  // role, and each shroom writes its layer onto the card so the next role reads it.
  // Detected from the layout rather than the intent, since the shape is the signal.
  const assembly = detectAssemblyLine(columns);
  if (assembly) return getAssemblyLineShrooms(assembly, topicContext);

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

/** Column names an assembly line needs, in order. Matched loosely by keyword. */
const ASSEMBLY_ROLES = [
  { key: 'inbox', match: ['inbox', 'ideas', 'raw', 'spark'] },
  { key: 'promising', match: ['promising', 'shortlist', 'selected', 'approved'] },
  { key: 'requirements', match: ['requirement', 'product', 'pm', 'define'] },
  { key: 'spec', match: ['spec', 'cto', 'architecture', 'technical', 'engineering'] },
  { key: 'design', match: ['design', 'taste', 'ux', 'ui', 'style'] },
  { key: 'build', match: ['build', 'develop', 'assemble', 'ship', 'app'] },
] as const;

type AssemblyLine = Partial<Record<(typeof ASSEMBLY_ROLES)[number]['key'], string>>;

/**
 * Recognise an assembly-line layout.
 *
 * Requires a build column plus at least two upstream roles — one enrichment step
 * before a build isn't a pipeline, it's a channel with a build shroom, and wiring a
 * five-shroom chain onto it would be presumptuous.
 */
export function detectAssemblyLine(columns: string[]): AssemblyLine | null {
  const found: AssemblyLine = {};
  for (const column of columns) {
    // Match WORDS, not substrings. Raw `includes` is a trap here: 'build' contains
    // 'ui', so a Build column was matching the design role and the pipeline lost its
    // final stage. Short tokens like 'ui', 'pm' and 'ux' only make sense whole.
    const words = column.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    for (const role of ASSEMBLY_ROLES) {
      if (found[role.key]) continue;
      // startsWith carries plurals ('requirement' → 'Requirements') without
      // reintroducing the substring problem.
      if (role.match.some((m) => words.some((w) => w === m || w.startsWith(m)))) {
        found[role.key] = column;
        break;
      }
    }
  }
  if (!found.build) return null;
  // A pipeline is defined by having ROLE columns, not merely a funnel. Without this,
  // the ordinary "Inbox → Promising → Develop" idea board matches — 'develop' reads as
  // a build column — and a plain channel would silently sprout a five-shroom chain.
  const hasRole = !!(found.requirements || found.spec || found.design);
  const upstream = ASSEMBLY_ROLES.filter((r) => r.key !== 'build' && found[r.key]).length;
  return hasRole && upstream >= 2 ? found : null;
}

/**
 * The pipeline, wired to whatever the columns are actually called.
 *
 * Every shroom here is event-triggered by a card ARRIVING in its column, so dropping
 * an idea in the inbox walks the whole line on its own. Each writes onto the card, so
 * the build at the end reads every earlier contribution as one accumulated brief.
 */
export function getAssemblyLineShrooms(line: AssemblyLine, topicContext: string): GeneratedShroom[] {
  const shrooms: GeneratedShroom[] = [];

  if (line.inbox) {
    shrooms.push({
      title: 'Generate Ideas',
      action: 'generate',
      targetColumnName: line.inbox,
      cardCount: 5,
      instructions: `Brainstorm app ideas${topicContext}. Each must be buildable as a single-file browser app with no backend — a tool, a toy, a calculator, a game, a visualiser. Be specific about who reaches for it and when.`,
    });
  }

  if (line.inbox && line.promising) {
    shrooms.push({
      title: 'Idea Triage',
      action: 'move',
      targetColumnName: line.inbox,
      moveToColumnName: line.promising,
      triggerOnArrival: true,
      instructions: `Evaluate every idea in ${line.inbox} honestly. Move forward only ideas a real person would use, that work as a self-contained browser app, and that are distinct from the others already moving through. Archive the vague, the derivative, and anything needing a backend to mean anything. Being selective is the job — passing everything through makes this step worthless.`,
    });
  }

  const enrichments: Array<[keyof AssemblyLine, string, string]> = [
    ['requirements', 'Product Manager',
      'Act as the product manager. Write: the specific user and the moment they reach for this; the single job it must do well; 3-5 concrete requirements stated as observable behaviour; what is deliberately out of scope for v1; and how you would know it worked. Pick one interpretation and commit. Do not restate the idea — add what was missing.'],
    ['spec', 'CTO Spec',
      'Act as the CTO. Given the requirements already on this card, specify: the core data model; the main screens and what each is for; the one hard technical problem and how to solve it; and any library worth pulling in, named exactly. This runs as a single-file React app in the browser with localStorage only and no backend. If a requirement cannot survive that, say so and propose the version that can.'],
    ['design', 'Designer',
      'Act as the designer. Give this a specific point of view, not a neutral one. Write: the feeling someone should have using it, in one line; a concrete palette with real colour values; type treatment; the one moment worth making delightful; and one convention you are deliberately breaking, and why. Reject anything that reads as a generic dashboard — name what would make this recognisably itself.'],
  ];

  for (const [key, title, instructions] of enrichments) {
    const column = line[key];
    if (column) {
      shrooms.push({ title, action: 'modify', targetColumnName: column, instructions, triggerOnArrival: true });
    }
  }

  if (line.build) {
    shrooms.push({
      title: 'Build It',
      action: 'build',
      targetColumnName: line.build,
      triggerOnArrival: true,
      instructions: 'Build the app this card describes. Everything written on it — requirements, spec, design direction — is the brief, and all of it is binding. Where contributions conflict, the design direction wins on look and the spec wins on structure. Make it usable on first load: preload a worked example rather than opening on an empty state.',
    });
  }

  return shrooms;
}
