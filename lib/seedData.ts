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

