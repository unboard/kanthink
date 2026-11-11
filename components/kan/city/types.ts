import type { cityFor } from '@/lib/kan/city/data';

/** What /api/prototypes/kan/city returns when you have channels. */
export type CityData = Exclude<Awaited<ReturnType<typeof cityFor>>, { empty: true }> & {
  /** Kanwatch is open to them, so the park has a door to the Freeway. */
  kanwatch?: boolean;
};
export type CityPlot = CityData['plots'][number];
export type BotStatus = CityPlot['bot']['status'];

/** What can be picked in the scene. */
export type Pick =
  | { kind: 'plot'; id: string }
  | { kind: 'townhall' }
  /** Kan itself: opens its thread. */
  | { kind: 'kan' }
  | { kind: 'park' }
  /** The door in the park to the Kanwatch Freeway. */
  | { kind: 'portal' }
  /** The gate in the park to the zoo. */
  | { kind: 'zoo' }
  | { kind: 'proposal'; name: string }
  | { kind: 'free' }
  | { kind: 'arrivals' }
  | { kind: 'app'; id: string }
  /** A resident: the mushroom who lives on a channel's plot, to talk with. */
  | { kind: 'bot'; id: string };
