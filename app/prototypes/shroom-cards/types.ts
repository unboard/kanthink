/**
 * Shared shape for the shroom card concepts.
 *
 * `summary` is the piece that doesn't exist in the product yet: today the card prints
 * the raw `instructions` field, which is written *to* the model and reads like config.
 * These concepts assume a short generated sentence describing what the shroom does,
 * written for the person scanning the board.
 */
export type ShroomState = 'watching' | 'scheduled' | 'manual';

export interface DemoShroom {
  id: string;
  title: string;
  /** One generated sentence. What it does, in the third person. */
  summary: string;
  /** The same thing in Kan's own voice, for the concept that speaks. */
  firstPerson: string;
  action: 'generate' | 'modify' | 'move' | 'report';
  state: ShroomState;
  /** "Inbox", "Every day at 9:00", or null when it only runs on demand. */
  trigger: string | null;
  lastRun: string | null;
  /** Newest last. Used by the concepts that draw a pulse or gills. */
  history: ('ran' | 'skipped' | 'failed')[];
  /** Lifetime runs — how established the shroom is. */
  totalRuns: number;
  /** One line of what it has adapted from your rejections, if anything yet. */
  learned?: string;
  /** Title of the shroom this one hands off to when it finishes, if any. */
  chainsTo?: string;
}

/**
 * Deterministic 0–1 sequence from a shroom's id.
 *
 * Lets a card draw a mark that is always the same for the same shroom and different for
 * every other one — an identity you can recognise without reading, like a wax seal.
 */
export function seededRandom(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const STATE_COLOR: Record<ShroomState, string> = {
  watching: '#22c55e',
  scheduled: '#3b82f6',
  manual: '#a1a1aa',
};

export const STATE_LABEL: Record<ShroomState, string> = {
  watching: 'Watching',
  scheduled: 'Scheduled',
  manual: 'On demand',
};

export const ACTION_LABEL: Record<DemoShroom['action'], string> = {
  generate: 'Generate',
  modify: 'Modify',
  move: 'Move',
  report: 'Report',
};

export interface ConceptProps {
  shroom: DemoShroom;
  index: number;
  isRunning: boolean;
  onRun: () => void;
  onEdit: () => void;
}
