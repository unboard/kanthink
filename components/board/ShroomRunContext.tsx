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
  return shrooms.filter(canRunOnCard);
}

/** Whether pointing this shroom at one card is a meaningful thing to ask for. */
export function canRunOnCard(shroom: InstructionCard): boolean {
  return shroom.action === 'modify' || shroom.action === 'move' || (shroom.steps?.length ?? 0) > 0;
}

/**
 * Why this shroom can't be run against a single card, in a sentence.
 *
 * Every surface that lets you pick any shroom needs this — you can only find out a
 * shroom is the wrong shape for a card by trying it, and "nothing happened" is the
 * worst possible answer. Says what the shroom does instead, and where to run it.
 */
export function explainCardConflict(shroom: InstructionCard): string | null {
  if (canRunOnCard(shroom)) return null;

  if (shroom.action === 'generate') {
    return `“${shroom.title}” writes new cards rather than changing an existing one, so there's nothing for it to do here. Run it from the Shrooms panel and it'll add cards to the board.`;
  }
  if (shroom.action === 'report') {
    return `“${shroom.title}” reads a whole column and writes up what it found, so it needs more than one card to look at. Run it from the Shrooms panel.`;
  }
  return `“${shroom.title}” doesn't act on a single card. Run it from the Shrooms panel instead.`;
}
