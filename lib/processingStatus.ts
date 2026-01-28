import type { InstructionCard } from './types';

/**
 * Generate a creative, contextual status message for card processing.
 * These messages reflect the kanthink brand voice: calm, intentional, and a bit playful.
 */

// Action-based templates
const modifyTemplates = [
  'Reimagining this...',
  'Expanding horizons...',
  'Adding depth...',
  'Enriching details...',
  'Breathing life in...',
  'Evolving ideas...',
  'Refining thoughts...',
];

const moveTemplates = [
  'Finding its home...',
  'Sorting things out...',
  'Reshuffling...',
  'Organizing flow...',
  'Rethinking placement...',
];

const generateTemplates = [
  'Conjuring ideas...',
  'Brewing thoughts...',
  'Sparking inspiration...',
  'Connecting dots...',
];

// Keyword-based overrides for extra personality
const keywordMap: Record<string, string[]> = {
  // Content actions
  expand: ['Stretching ideas...', 'Growing this thought...', 'Unfolding layers...'],
  detail: ['Zooming in...', 'Adding texture...', 'Painting details...'],
  simplify: ['Distilling essence...', 'Finding clarity...', 'Cutting through...'],
  summarize: ['Crystallizing...', 'Capturing essence...', 'Boiling down...'],
  rewrite: ['Polishing words...', 'Reshaping narrative...', 'Fresh perspective...'],
  improve: ['Elevating...', 'Leveling up...', 'Polishing edges...'],

  // Emotional/tonal
  creative: ['Unleashing creativity...', 'Letting imagination run...', 'Getting artsy...'],
  professional: ['Adding polish...', 'Buttoning up...', 'Sharpening focus...'],
  casual: ['Loosening up...', 'Keeping it real...', 'Chilling out...'],

  // Domain hints
  code: ['Compiling thoughts...', 'Debugging ideas...', 'Refactoring...'],
  design: ['Sketching concepts...', 'Composing visuals...', 'Arranging elements...'],
  strategy: ['Mapping the path...', 'Connecting strategy...', 'Plotting course...'],
  research: ['Digging deeper...', 'Unearthing insights...', 'Exploring terrain...'],

  // Fun ones
  magic: ['Casting spells...', 'Channeling energy...', 'Weaving enchantments...'],
  quick: ['On it...', 'Zooming through...', 'Speed thinking...'],
  thorough: ['Leaving no stone...', 'Deep diving...', 'Exploring fully...'],
};

/**
 * Extract keywords from instruction text
 */
function extractKeywords(text: string): string[] {
  const lowered = text.toLowerCase();
  return Object.keys(keywordMap).filter(keyword => lowered.includes(keyword));
}

/**
 * Pick a random item from an array
 */
function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Generate a processing status message based on the instruction
 */
export function generateProcessingStatus(instruction: InstructionCard): string {
  const instructionText = instruction.instructions || '';
  const title = instruction.title || '';
  const combined = `${title} ${instructionText}`;

  // First, check for keyword matches
  const keywords = extractKeywords(combined);
  if (keywords.length > 0) {
    // Pick a random matched keyword and use its templates
    const keyword = pickRandom(keywords);
    return pickRandom(keywordMap[keyword]);
  }

  // Fall back to action-based templates
  switch (instruction.action) {
    case 'modify':
      return pickRandom(modifyTemplates);
    case 'move':
      return pickRandom(moveTemplates);
    case 'generate':
      return pickRandom(generateTemplates);
    default:
      return 'Thinking...';
  }
}
