/**
 * How a bot looks: a mushroom cap with a pattern, on a little clay stump with fins.
 * Pure data, shared by the 3D figure in the city and the SVG icon in lists, so a
 * bot is the same character everywhere it shows up.
 */

export const BOT_PATTERNS = ['spots', 'stripes', 'rings', 'freckles', 'band', 'hearts', 'stars', 'swirl'] as const;
export type BotPattern = (typeof BOT_PATTERNS)[number];

export interface BotLook {
  cap: string;
  /** The rim under the cap and the cap's shading. */
  capDark: string;
  pattern: BotPattern;
  patternColor: string;
  stump: string;
  fin: string;
  cheek: string;
}

/** Friendly caps: bright, soft, never muddy. [cap, rim, pattern] */
const CAPS: [string, string, string][] = [
  ['#ff6b6b', '#d94848', '#fff4e8'], // tomato
  ['#ff9f43', '#e07b1f', '#fff4e0'], // tangerine
  ['#ffd23f', '#e3ad12', '#f07a2a'], // sunshine, orange pattern
  ['#5fd38d', '#33a866', '#f2fff4'], // mint
  ['#2fc6c6', '#1b9a9e', '#effffd'], // lagoon
  ['#4d9de0', '#2f76b8', '#eef7ff'], // sky
  ['#ffb08a', '#e88a62', '#8f3f2a'], // apricot, dark pattern (violet is Kan's)
  ['#f472b6', '#d24f94', '#fff0f7'], // bubblegum
  ['#ff8fab', '#e0607f', '#7a2944'], // peach-pink, dark pattern
  ['#b8e05a', '#8db62f', '#3f5a10'], // lime, dark pattern
];

/** Clay: terracotta to sandy. [stump, fin] */
const CLAYS: [string, string][] = [
  ['#d98c63', '#c07049'],
  ['#e0a47a', '#c8865b'],
  ['#c9805c', '#ad6442'],
  ['#e8b98f', '#d19a6d'],
];

/** FNV-style mix so neighbors in seed space don't look alike. */
function mix(n: number, salt: number): number {
  let h = (2166136261 ^ salt) >>> 0;
  for (let i = 0; i < 4; i++) {
    h ^= (n >>> (i * 8)) & 0xff;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

export function botLook(seed: number): BotLook {
  const s = Math.abs(Math.floor(seed)) >>> 0;
  const [cap, capDark, patternColor] = CAPS[s % CAPS.length];
  const pattern = BOT_PATTERNS[mix(s, 7) % BOT_PATTERNS.length];
  const [stump, fin] = CLAYS[mix(s, 13) % CLAYS.length];
  return { cap, capDark, pattern, patternColor, stump, fin, cheek: '#ff8a8a' };
}

/** Kan: the violet cap with white spots that no bot gets, and a gold crown on top (in the 3D figure). */
export const KAN_LOOK: BotLook = {
  cap: '#8b5cf6', capDark: '#6d3fd6', pattern: 'spots', patternColor: '#ffffff',
  stump: '#e0a47a', fin: '#c8865b', cheek: '#ff8a8a',
};
