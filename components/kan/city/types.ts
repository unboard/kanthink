import type { cityFor } from '@/lib/kan/city/data';

/** What /api/prototypes/kan/city returns when you have channels. */
export type CityData = Exclude<Awaited<ReturnType<typeof cityFor>>, { empty: true }>;
export type CityPlot = CityData['plots'][number];
export type BotStatus = CityPlot['bot']['status'];

/** What can be picked in the scene. */
export type Pick =
  | { kind: 'plot'; id: string }
  | { kind: 'townhall' }
  | { kind: 'park' }
  | { kind: 'proposal'; name: string }
  | { kind: 'free' }
  | { kind: 'arrivals' }
  | { kind: 'app'; id: string };
