// Whisker Wilds — static game data + cat generation

import type { AccessoryId, CatSpec, CoatSpec, PatternId } from './types';
import { mulberry32, pick, range, irange } from './rng';

export const WORLD_SIZE = 520;         // world is WORLD_SIZE x WORLD_SIZE centered at 0
export const WATER_LEVEL = 0;
export const DAY_LENGTH = 360;         // seconds per full day/night cycle

// ——— Cat names, split by gender so the family tree makes sense to kids ———
export const GIRL_NAMES = [
  'Willow', 'Maple', 'Clover', 'Poppy', 'Hazel', 'Juniper', 'Luna', 'Nova',
  'Daisy', 'Tulip', 'Rosie', 'Ivy', 'Petal', 'Misty', 'Honey', 'Vanilla',
  'Cinnamon', 'Olive', 'Pumpkin', 'Mochi', 'Jellybean', 'Star', 'Ember', 'Fern',
  'Blossom', 'Pearl', 'Ruby', 'Coco', 'Millie', 'Pippa', 'Sugar', 'Buttercup',
] as const;

export const BOY_NAMES = [
  'Pepper', 'Biscuit', 'Marble', 'Pickles', 'Waffles', 'Nutmeg', 'Storm', 'Frost',
  'River', 'Brook', 'Moss', 'Pebble', 'Comet', 'Sunny', 'Shadow', 'Smokey',
  'Ginger', 'Butterscotch', 'Toffee', 'Ziggy', 'Pixel', 'Boots', 'Mittens', 'Socks',
  'Patches', 'Freckles', 'Domino', 'Sage', 'Basil', 'Scout', 'Ranger', 'Dash',
  'Zoom', 'Rocket', 'Turbo', 'Whiskers', 'Fuzzy', 'Ollie', 'Milo', 'Otis',
] as const;

export const PERSONALITIES = [
  'Dreams of catching the moon someday.',
  'Never met a box she did not sit in.',
  'Braver than the biggest dog in the valley.',
  'Naps in sunbeams like it is a full-time job.',
  'Once stared down a heron. The heron blinked first.',
  'Collects shiny pebbles and hides them in the den.',
  'Purrs so loud the whole camp can hear it.',
  'Always first up the tallest tree.',
  'Thinks butterflies are tiny flying friends.',
  'Sneaks up on leaves just for practice.',
  'Loves belly rubs but pretends not to.',
  'Has a secret napping spot nobody has found.',
  'Chirps at birds instead of meowing.',
  'The fastest zoomies in the whole clan.',
  'Would trade anything for a fish snack.',
  'Believes every yarn ball has a story.',
] as const;

export const FAVORITES = [
  'Chasing butterflies', 'Climbing the tallest pines', 'Napping in flower beds',
  'Splashing at the lake shore', 'Digging for treasure', 'Racing the wind',
  'Stalking through tall grass', 'Batting yarn down hills', 'Watching fireflies',
  'Balancing on logs', 'Collecting feathers', 'Sunset meowing',
] as const;

// ——— Coat palettes: [base, marking, belly] ———
export const COAT_PALETTES: readonly [string, string, string][] = [
  ['#e8963c', '#b5651d', '#f7e3c1'], // orange tabby
  ['#4a4a52', '#2b2b31', '#c9c9cf'], // grey
  ['#1f1f24', '#0e0e11', '#e8e4da'], // black tuxedo
  ['#c8b49a', '#8a6f4d', '#efe6d4'], // cream/brown
  ['#f5efe6', '#d9c8a9', '#ffffff'], // white/cream
  ['#7a5236', '#4c3018', '#d8c3a5'], // chocolate
  ['#b0b7c4', '#7c8494', '#e6e9ef'], // blue-grey
  ['#d98e4a', '#8f4f1d', '#f5e2c8'], // ginger deep
  ['#9c8570', '#5f4a35', '#e0d4c2'], // lilac brown
  ['#e6d3b3', '#a3846b', '#fdf6ea'], // fawn (siamese-ish)
] as const;

export const EYE_COLORS = ['#5aa04f', '#c98f2c', '#3f7fbf', '#7fb3d5', '#8e7cc3', '#d4a017'] as const;
export const NOSE_COLORS = ['#d98880', '#8b5a52', '#3b3b3b', '#c98f8f'] as const;
export const ACCENT_COLORS = ['#c0392b', '#2980b9', '#8e44ad', '#d4a017', '#16a085', '#e91e63'] as const;

export const BASE_PATTERNS: readonly PatternId[] = ['solid', 'tabby', 'spots', 'tuxedo', 'calico', 'siamese'];

// ——— Ranks ———
export interface RankDef {
  name: string;
  minScore: number; // wins*2 + level
  unlockPatterns?: PatternId[];
  unlockAccessories?: AccessoryId[];
}
export const RANKS: readonly RankDef[] = [
  { name: 'Kit', minScore: 0 },
  { name: 'Scout', minScore: 4, unlockAccessories: ['collar', 'bandana'] },
  { name: 'Hunter', minScore: 9, unlockAccessories: ['scarf'] },
  { name: 'Guardian', minScore: 16, unlockAccessories: ['bow', 'flowercrown'], unlockPatterns: ['moon'] },
  { name: 'Champion', minScore: 25, unlockAccessories: ['goldcollar'], unlockPatterns: ['star'] },
  { name: 'Clan Leader', minScore: 36 },
];

export function rankFor(cat: { wins: number; level: number }): RankDef {
  const score = cat.wins * 2 + cat.level;
  let r = RANKS[0];
  for (const rank of RANKS) if (score >= rank.minScore) r = rank;
  return r;
}

export function rankProgress(cat: { wins: number; level: number }): { rank: RankDef; next: RankDef | null; frac: number } {
  const score = cat.wins * 2 + cat.level;
  const rank = rankFor(cat);
  const idx = RANKS.indexOf(rank);
  const next = idx < RANKS.length - 1 ? RANKS[idx + 1] : null;
  const frac = next ? Math.min(1, (score - rank.minScore) / (next.minScore - rank.minScore)) : 1;
  return { rank, next, frac };
}

export function xpForLevel(level: number): number {
  return 20 + level * 15;
}

// ——— Rival clans ———
export interface RivalClanDef {
  id: string;
  name: string;
  color: string;       // banner/accent
  motto: string;
  palette: number[];   // indices into COAT_PALETTES they favor
  catCount: number;
}
export const RIVAL_CLANS: readonly RivalClanDef[] = [
  { id: 'maple', name: 'Maple Clan', color: '#c0392b', motto: 'Swift as falling leaves', palette: [0, 7, 3], catCount: 5 },
  { id: 'shadow', name: 'Shadow Clan', color: '#5d6d7e', motto: 'Quiet paws, sharp eyes', palette: [1, 2, 6], catCount: 5 },
  { id: 'river', name: 'River Clan', color: '#2980b9', motto: 'Never afraid of a splash', palette: [4, 6, 9], catCount: 5 },
];

// ——— Buildables ———
export interface BuildableDef {
  id: string;
  name: string;
  desc: string;
  cost: number;         // yarn
  icon: string;         // emoji for menu
  minRankIdx?: number;  // active cat rank gate
  capacity?: number;    // clan capacity added
}
export const BUILDABLES: readonly BuildableDef[] = [
  { id: 'den', name: 'Cozy Den', desc: 'A warm log den. Room for 2 more clan cats.', cost: 8, icon: '🪵', capacity: 2 },
  { id: 'post', name: 'Scratching Post', desc: 'Scratch here to train strength!', cost: 4, icon: '🪵' },
  { id: 'tower', name: 'Cat Tower', desc: 'Climb up top for a great view (and XP).', cost: 10, icon: '🗼' },
  { id: 'basket', name: 'Yarn Basket', desc: 'A pretty basket to show off your yarn.', cost: 5, icon: '🧺' },
  { id: 'flowers', name: 'Flower Patch', desc: 'Butterflies love it. Great for sneaking practice.', cost: 3, icon: '🌸' },
  { id: 'lantern', name: 'Firefly Lantern', desc: 'Lights up your camp at night.', cost: 4, icon: '🏮' },
  { id: 'tent', name: 'Leaf Tent', desc: 'A snug tent for rainy-day naps. Room for 2 more cats.', cost: 12, icon: '⛺', capacity: 2 },
  { id: 'pond', name: 'Fish Pond', desc: 'Splish splash! Swimmer cats adore it.', cost: 9, icon: '🐟', minRankIdx: 1 },
  { id: 'banner', name: 'Clan Banner', desc: 'Fly your clan colors high!', cost: 6, icon: '🚩', minRankIdx: 1 },
  { id: 'statue', name: 'Mushroom Statue', desc: 'A mysterious mushroom friend watches over camp.', cost: 15, icon: '🍄', minRankIdx: 2 },
];

export const BASE_CLAN_CAPACITY = 3;

export function clanCapacity(buildings: { type: string }[]): number {
  let cap = BASE_CLAN_CAPACITY;
  for (const b of buildings) {
    const def = BUILDABLES.find((d) => d.id === b.type);
    if (def?.capacity) cap += def.capacity;
  }
  return cap;
}

// ——— Cat generation ———
let catCounter = 0;

export function generateCat(seed: number, clanId: string, opts?: {
  paletteIdx?: number;
  forceSwim?: boolean;
  minStat?: number;
  name?: string;
  idOverride?: string;   // stable id for rival cats (records persist across sessions)
  rarePattern?: boolean; // challenge-reward cats may roll star/moon fur
  gender?: 'girl' | 'boy';
}): CatSpec {
  const rng = mulberry32(seed);
  const paletteIdx = opts?.paletteIdx ?? irange(rng, 0, COAT_PALETTES.length - 1);
  const [base, marking, belly] = COAT_PALETTES[paletteIdx];
  let pattern = pick(rng, BASE_PATTERNS);
  if (opts?.rarePattern && rng() < 0.25) pattern = rng() < 0.5 ? 'star' : 'moon';
  const coat: CoatSpec = {
    base, marking, belly, pattern,
    eyeColor: pick(rng, EYE_COLORS),
    noseColor: pick(rng, NOSE_COLORS),
    accentColor: pick(rng, ACCENT_COLORS),
  };
  const minStat = opts?.minStat ?? 2;
  const canSwim = opts?.forceSwim ?? rng() < 0.45;
  const traits = {
    canSwim,
    brave: rng() < 0.5,
    sneaky: rng() < 0.5,
    speed: irange(rng, minStat, 8),
    strength: irange(rng, minStat, 8),
    agility: irange(rng, minStat, 8),
  };
  catCounter++;
  const gender: 'girl' | 'boy' = opts?.gender ?? (rng() < 0.5 ? 'girl' : 'boy');
  return {
    gender,
    stage: 'adult',
    id: opts?.idOverride ?? `cat_${seed.toString(36)}_${catCounter}_${Date.now().toString(36)}`,
    name: opts?.name ?? pick(rng, gender === 'girl' ? GIRL_NAMES : BOY_NAMES),
    clanId,
    coat,
    traits,
    personality: pick(rng, PERSONALITIES),
    favorite: pick(rng, FAVORITES),
    size: range(rng, 0.85, 1.15),
    voicePitch: range(rng, 0.7, 1.4),
    level: 1,
    xp: 0,
    wins: 0,
    losses: 0,
    accessory: 'none',
    bestAgility: null,
  };
}

/** tiny cat: big head, big eyes, squeaky meow */
export function generateKitten(seed: number): CatSpec {
  const kit = generateCat(seed, 'player', { minStat: 1 });
  kit.size = 0.52 + (Math.abs(seed) % 100) / 900;   // 0.52..0.63
  kit.voicePitch = 1.5 + (Math.abs(seed >> 3) % 40) / 100; // squeaky
  kit.stage = 'kitten';
  return kit;
}

/** a newborn: coat inherited from mama and daddy, pattern grows in with age */
export function generateBaby(seed: number, mom: CatSpec, dad: CatSpec): CatSpec {
  const rng = mulberry32(seed);
  const baby = generateKitten(seed);
  baby.stage = 'baby';
  baby.size = 0.42 + rng() * 0.06;
  baby.voicePitch = 1.7 + rng() * 0.25;
  const a = rng() < 0.5 ? mom : dad;
  const b = a === mom ? dad : mom;
  baby.coat = {
    base: a.coat.base,
    marking: b.coat.marking,
    belly: rng() < 0.5 ? a.coat.belly : b.coat.belly,
    pattern: rng() < 0.5 ? mom.coat.pattern : dad.coat.pattern,
    eyeColor: rng() < 0.5 ? mom.coat.eyeColor : dad.coat.eyeColor,
    noseColor: a.coat.noseColor,
    accentColor: b.coat.accentColor,
  };
  baby.parents = [mom.name, dad.name];
  return baby;
}

/** lone cats roaming the island — meow at one and you might fall in love */
export function generateWanderer(seed: number, gender: 'girl' | 'boy'): CatSpec {
  return generateCat(seed, 'wanderer', { minStat: 3, gender });
}

export function genderOf(spec: CatSpec): 'girl' | 'boy' {
  if (spec.gender) return spec.gender;
  let h = 0;
  for (let i = 0; i < spec.id.length; i++) h = (h * 31 + spec.id.charCodeAt(i)) | 0;
  return (h & 1) === 0 ? 'girl' : 'boy';
}

export const TRAIT_LABELS = {
  swimmer: 'Swimmer 🌊',
  scaredyCat: 'Scaredy-cat 💧',
  brave: 'Brave 🦁',
  gentle: 'Gentle 🌼',
  sneaky: 'Sneaky 🐾',
  loud: 'Chatty 📣',
} as const;

export const PATTERN_LABELS: Record<PatternId, string> = {
  solid: 'Solid',
  tabby: 'Tabby',
  spots: 'Spotted',
  tuxedo: 'Tuxedo',
  calico: 'Calico',
  siamese: 'Siamese',
  star: 'Starfur ✨',
  moon: 'Moonfur 🌙',
};

export const ACCESSORY_LABELS: Record<AccessoryId, string> = {
  none: 'None',
  collar: 'Collar',
  bandana: 'Bandana',
  bow: 'Bow',
  flowercrown: 'Flower Crown',
  goldcollar: 'Golden Collar',
  scarf: 'Scarf',
};
