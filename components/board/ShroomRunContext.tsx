'use client';

import { createContext, useContext } from 'react';
import type { InstructionCard } from '@/lib/types';

export interface ShroomRunOptions {
  /** Restrict the run to these cards. Without it, the shroom runs on its whole target. */
  cardIds?: string[];
}

interface ShroomRunContextValue {
  runShroom: (instructionCard: InstructionCard, options?: ShroomRunOptions) => void;
  /** Shrooms belonging to the channel currently on screen. */
  shrooms: InstructionCard[];
  /** Ids of shrooms mid-run, for spinner state. */
  runningIds: string[];
}

/**
 * Lets anything inside a Board run a shroom without threading callbacks down through
 * Card → CardDetailDrawer → menus. Board owns the run logic (spinners, skeletons,
 * chaining, applying modify/move results); this just makes it reachable.
 *
 * Surfaces outside a Board — Cmd+K, the home chat — can't use this. They go through the
 * server-side path in lib/shrooms/apply.ts instead.
 */
const ShroomRunContext = createContext<ShroomRunContextValue>({
  runShroom: () => {},
  shrooms: [],
  runningIds: [],
});

export const ShroomRunProvider = ShroomRunContext.Provider;

export function useShroomRun() {
  return useContext(ShroomRunContext);
}

/**
 * Which shrooms make sense to run against a single card.
 *
 * modify/move/multi-step act on existing cards, so they take a card directly. generate
 * makes new cards, but pointing it at one card is still useful — the card becomes the
 * seed for what it produces.
 */
export function shroomsForCard(shrooms: InstructionCard[]): InstructionCard[] {
  return shrooms.filter(
    (s) => s.action === 'modify' || s.action === 'move' || (s.steps?.length ?? 0) > 0
  );
}
