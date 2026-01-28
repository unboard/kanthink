import type { InstructionAction, InstructionTarget, InstructionRunMode } from './types';

export interface SeedColumn {
  name: string;
  isAiTarget?: boolean;
}

export interface SeedInstructionCard {
  title: string;
  instructions: string;
  action: InstructionAction;
  targetColumnName: string;  // We'll resolve this to column ID at creation time
  runMode: InstructionRunMode;
  cardCount?: number;
}

export interface SeedChannelTemplate {
  name: string;
  description: string;
  aiInstructions: string;
  columns: SeedColumn[];
  instructionCards: SeedInstructionCard[];
}

export const KANTHINK_DEV_CHANNEL: SeedChannelTemplate = {
  name: 'Kanthink <dev>',
  description: 'Building Kanthink itself. A dogfooding space where we use the product to plan and evolve the product.',
  aiInstructions: `You are helping build Kanthink, an AI-assisted Kanban application. This channel is our development workspace.

The core insight of Kanthink:
- Most tools assume you already know what you want. Kanthink helps you discover it.
- A channel isn't a todo list - it's a thinking space with a vague intention that sharpens over time.
- The AI isn't generating content, it's generating prompts for your own clarity. Every card is a question: "Is this what you meant?"
- Feedback happens through organizing: moving cards between columns teaches both you and the AI what matters.

Current state:
- Phase 1 MVP is largely complete: channels, columns, cards, instruction cards, drag-and-drop
- The instruction card system supports generate/modify/move actions
- Feedback signals are captured but not yet used for learning

Key principles:
- Kanban first, AI second
- Learning through action, not configuration
- Minimal UI with deep capability
- Calm, intentional, fast`,
  columns: [
    { name: 'Inbox', isAiTarget: true },
    { name: 'Consider' },
    { name: 'Next Up' },
    { name: 'In Progress' },
    { name: 'Done' },
  ],
  instructionCards: [
    {
      title: 'Generate Development Ideas',
      instructions: `Generate cards for features, improvements, or considerations for Kanthink development.

Focus on:
- User experience improvements
- AI behavior refinements
- Missing capabilities that would unlock new use cases
- Friction points that need smoothing
- Ideas that reinforce the core "why" of the product

Each card should be actionable and specific, not vague wishes.`,
      action: 'generate',
      targetColumnName: 'Inbox',
      runMode: 'manual',
      cardCount: 5,
    },
    {
      title: 'Refine Considered Items',
      instructions: `For items in Consider, add implementation thoughts:

- What's the minimal version of this?
- What existing code/patterns would this build on?
- What questions need answering before building?
- Is this actually aligned with the product's "why"?

Keep cards concise but make them actionable.`,
      action: 'modify',
      targetColumnName: 'Consider',
      runMode: 'manual',
    },
  ],
};

export const KANTHINK_IDEAS_CHANNEL: SeedChannelTemplate = {
  name: 'Kanthink Channel Ideas',
  description: 'Discover and evaluate ideas for new channels. Use the instructions to generate ideas, then promote favorites into actual channels.',
  aiInstructions: `You are helping brainstorm channel ideas for Kanthink, an AI-assisted Kanban application.

About Kanthink:
- Each channel is a goal-driven workspace with customizable columns
- Instruction cards can generate new cards, modify existing cards, or move cards between columns
- AI learns from how users organize cards (moving to Like/Dislike columns provides feedback)
- Channels can have custom columns suited to their purpose
- Cards can be promoted into new channels for deeper exploration

When generating channel ideas, consider:
- Personal productivity and task management
- Learning and skill development
- Creative projects and brainstorming
- Planning (travel, events, goals)
- Research and decision-making
- Content creation and curation
- Health, habits, and personal growth

Each idea should explain what the channel is for and hint at how AI instructions would help.`,
  columns: [
    { name: 'Ideas', isAiTarget: true },
    { name: 'Worth Exploring' },
    { name: 'Build Next' },
    { name: 'Shipped' },
  ],
  instructionCards: [
    {
      title: 'Generate Channel Ideas',
      instructions: `Generate creative and practical channel ideas that would benefit from AI-assisted card management.

For each idea, provide:
- A catchy channel name as the title
- A description explaining the use case and how AI would help manage the cards

Consider diverse categories: productivity, learning, creativity, planning, research, health, content creation, and personal organization.

Make ideas specific and actionable, not generic. Instead of "Project Management", suggest "Product Launch Tracker" with specific details about how it would work.`,
      action: 'generate',
      targetColumnName: 'Ideas',
      runMode: 'manual',
      cardCount: 5,
    },
    {
      title: 'Expand Promising Ideas',
      instructions: `For each channel idea, expand it with implementation details:

1. **Suggested Columns**: What columns would this channel have? (e.g., "Inbox, Researching, Ready to Try, Tried & Loved, Not For Me")

2. **AI Instructions**: What should the channel's AI know to generate useful cards? What context or domain knowledge is needed?

3. **Example Instruction Cards**: Suggest 2-3 instruction cards that would power this channel (e.g., "Generate meal ideas for the week", "Find alternatives to items in Researching")

4. **Use Case Example**: Describe a typical user session - how would someone use this channel day-to-day?

Keep the original title but enrich the content significantly.`,
      action: 'modify',
      targetColumnName: 'Worth Exploring',
      runMode: 'manual',
    },
    {
      title: 'Prioritize for Building',
      instructions: `Analyze each channel idea and decide if it should move to "Build Next".

Move ideas to "Build Next" if they:
- Solve a clear, common problem
- Would showcase Kanthink's AI capabilities well
- Are achievable with current features
- Have broad appeal or strong niche value

Keep ideas in "Worth Exploring" if they:
- Need more refinement
- Are too niche or complex for early implementation
- Duplicate existing ideas in Build Next

For ideas you move, the reason should explain why this is a priority.`,
      action: 'move',
      targetColumnName: 'Worth Exploring',
      runMode: 'manual',
    },
  ],
};
