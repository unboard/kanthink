// Snowpath — shared types & constants

export const TILE = 5;          // meters per tile
export const GRID = 40;         // tiles per side (200m town)
export const WORLD = TILE * GRID;

// tile kinds
export const YARD = 0;
export const ROAD = 1;
export const DRIVE = 2;
export const PAD = 3;
export const PARK = 4;
export const BLOCKED = 5;

// snow depth gameplay thresholds (arbitrary "cm-ish" units, 0..10)
export const SNOW_START = 5.0;      // storm has already dumped this much
export const SNOW_SLOW = 8.0;       // divisor: speed scale = 1 - depth/SNOW_SLOW
export const SNOW_STUCK = 6.2;      // driving into deeper than this = stuck
export const SNOW_UNSTUCK = 2.8;    // cleared below this frees a stuck car
export const SNOW_DEPART = 3.6;     // max driveway depth to leave home
export const SNOW_CAP = 9.5;

export type PlayerMode = 'foot' | 'plow' | 'blower';

export type RequestPhase = 'warming' | 'driving' | 'stuck' | 'done' | 'late';

export interface RequestInfo {
  id: number;
  family: string;
  dest: string;
  color: string;       // css color for route ribbon + hud chip
  phase: RequestPhase;
  secondsLeft: number; // until deadline
  warmup: number;      // seconds until departure (warming phase)
  onTime?: boolean;
}

export interface HudState {
  screen: 'menu' | 'playing' | 'summary';
  day: number;
  timeLeft: number;      // seconds left in the day
  overtime: boolean;
  score: number;
  cheer: number;         // 0..100 town cheer
  snowfall: number;      // 0..1 current storm intensity
  mode: PlayerMode;
  actionLabel: string | null;
  requests: RequestInfo[];
  toast: { text: string; at: number } | null;
  frostAt: number;       // timestamp of last snowball hit on player (frost flash)
  summary: { delivered: number; total: number; stars: number; score: number } | null;
  bestStars: number;
  fightHits: number;     // snowball hits landed on kids (today)
}

export interface SaveData {
  day: number;
  bestScore: number;
  stars: Record<number, number>; // day -> stars earned
}

export const SAVE_KEY = 'snowpath-save-v1';

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) return { day: 1, bestScore: 0, stars: {}, ...JSON.parse(raw) };
  } catch { /* fresh save */ }
  return { day: 1, bestScore: 0, stars: {} };
}

export function storeSave(s: SaveData) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}
