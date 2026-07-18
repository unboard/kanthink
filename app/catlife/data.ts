// Whisker Wilds — static game data + cat generation

import type {
  AccessoryId, CatSpec, CatStyle, CoatSpec, PatternId,
  FaceShape, EarStyle, EyeStyle, MouthStyle, TailStyle, WhiskerStyle, PawStyle, ClawStyle,
} from './types';
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
  { name: 'Champion', minScore: 25, unlockAccessories: ['goldcollar', 'starcollar'], unlockPatterns: ['star'] },
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

// ——— Style Studio option pools + labels ———
export const FACE_SHAPES: readonly FaceShape[] = ['round', 'slim', 'chubby', 'fluffy'];
export const EAR_STYLES: readonly EarStyle[] = ['pointy', 'round', 'folded', 'big', 'tufted'];
export const EYE_STYLES: readonly EyeStyle[] = ['almond', 'round', 'sleepy', 'starry'];
export const MOUTH_STYLES: readonly MouthStyle[] = ['sweet', 'smiley', 'pouty', 'toothy'];
export const TAIL_STYLES: readonly TailStyle[] = ['classic', 'fluffy', 'bobtail', 'curly'];
export const WHISKER_STYLES: readonly WhiskerStyle[] = ['classic', 'long', 'curly', 'short'];
export const PAW_STYLES: readonly PawStyle[] = ['classic', 'toebeans', 'fluffy', 'socks'];
export const CLAW_STYLES: readonly ClawStyle[] = ['tucked', 'short', 'long'];

export const FACE_LABELS: Record<FaceShape, string> = {
  round: 'Round', slim: 'Slim', chubby: 'Chubby cheeks', fluffy: 'Extra fluffy',
};
export const EAR_LABELS: Record<EarStyle, string> = {
  pointy: 'Pointy', round: 'Rounded', folded: 'Folded', big: 'Big ears', tufted: 'Lynx tufts',
};
export const EYE_LABELS: Record<EyeStyle, string> = {
  almond: 'Almond', round: 'Big & round', sleepy: 'Sleepy', starry: 'Starry sparkle',
};
export const MOUTH_LABELS: Record<MouthStyle, string> = {
  sweet: 'Sweet smile', smiley: 'Big open grin', pouty: 'Pouty', toothy: 'Little fangs',
};
export const TAIL_LABELS: Record<TailStyle, string> = {
  classic: 'Classic', fluffy: 'Floofy', bobtail: 'Bobtail', curly: 'Curly-Q',
};
export const WHISKER_LABELS: Record<WhiskerStyle, string> = {
  classic: 'Classic', long: 'Extra long', curly: 'Curly', short: 'Short & neat',
};
export const PAW_LABELS: Record<PawStyle, string> = {
  classic: 'Classic', toebeans: 'Toe beans 🫘', fluffy: 'Fluffy tufts', socks: 'White socks',
};
export const CLAW_LABELS: Record<ClawStyle, string> = {
  tucked: 'Tucked in', short: 'Short claws', long: 'Looong claws',
};

/** random look for a generated cat — most stay classic, some roll fun features */
export function randomStyle(rng: () => number): CatStyle {
  const roll = <T,>(pool: readonly T[], chance: number): T =>
    rng() < chance ? pool[irange(rng, 0, pool.length - 1)] : pool[0];
  return {
    face: roll(FACE_SHAPES, 0.55),
    ears: roll(EAR_STYLES, 0.5),
    eyes: roll(EYE_STYLES, 0.5),
    mouth: roll(MOUTH_STYLES, 0.45),
    tail: roll(TAIL_STYLES, 0.5),
    whiskers: roll(WHISKER_STYLES, 0.45),
    paws: roll(PAW_STYLES, 0.4),
    claws: roll(CLAW_STYLES, 0.3),
  };
}

// ——— Cat generation ———
let catCounter = 0;

export function generateCat(seed: number, clanId: string, opts?: {
  paletteIdx?: number;
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
  rng(); // burn the old canSwim roll so existing cats keep their look & stats
  const traits = {
    canSwim: true, // every Wilds cat is a proud swimmer now
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
    style: randomStyle(rng),
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
  // looks run in the family: each feature comes from mama or daddy
  const momS = mom.style, dadS = dad.style;
  if (momS || dadS) {
    const from = <K extends keyof CatStyle>(k: K): CatStyle[K] => {
      const m = momS?.[k], d = dadS?.[k];
      if (m !== undefined && d !== undefined) return rng() < 0.5 ? m : d;
      return (m ?? d ?? baby.style![k]) as CatStyle[K];
    };
    baby.style = {
      face: from('face'), ears: from('ears'), eyes: from('eyes'),
      mouth: from('mouth'), tail: from('tail'), whiskers: from('whiskers'),
      paws: from('paws'), claws: from('claws'),
    };
  }
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

// ——— Fishing: species pool — every catch rolls its own size ———
export interface FishSpeciesDef {
  id: string;
  name: string;
  icon: string;
  rarity: 'common' | 'uncommon' | 'rare' | 'legendary';
  minCm: number;
  maxCm: number;
  blurb: string; // one line for the collection page
}

export const FISH_SPECIES: readonly FishSpeciesDef[] = [
  { id: 'sunny', name: 'Sunny Perch', icon: '🐟', rarity: 'common', minCm: 8, maxCm: 22, blurb: 'Glitters like a little sunbeam.' },
  { id: 'minnow', name: 'Pebble Minnow', icon: '🐟', rarity: 'common', minCm: 4, maxCm: 9, blurb: 'Tiny, quick, and very proud of it.' },
  { id: 'bluegill', name: 'Bluegill Whiskerfish', icon: '🐠', rarity: 'common', minCm: 10, maxCm: 25, blurb: 'Has whiskers almost as fine as a cat’s.' },
  { id: 'trout', name: 'Rainbow Trout', icon: '🐠', rarity: 'uncommon', minCm: 18, maxCm: 45, blurb: 'Wears every color of the sky after rain.' },
  { id: 'bass', name: 'Bramble Bass', icon: '🐟', rarity: 'uncommon', minCm: 22, maxCm: 50, blurb: 'Grumpy, splashy, and fun to catch.' },
  { id: 'catfish', name: 'Catfish (a cousin?!)', icon: '🐡', rarity: 'uncommon', minCm: 25, maxCm: 60, blurb: 'It meowed. It definitely meowed.' },
  { id: 'koi', name: 'Golden Koi', icon: '🎏', rarity: 'rare', minCm: 30, maxCm: 70, blurb: 'A living treasure of the lake.' },
  { id: 'moonfish', name: 'Moonfish', icon: '🌙', rarity: 'rare', minCm: 20, maxCm: 40, blurb: 'Glows softly. Only nibbles for patient cats.' },
  { id: 'shimmerfin', name: 'Rainbow Shimmerfin', icon: '✨', rarity: 'legendary', minCm: 40, maxCm: 90, blurb: 'The legend every clan tells kittens about.' },
] as const;

export const RARITY_LABELS: Record<FishSpeciesDef['rarity'], string> = {
  common: 'Common', uncommon: 'Uncommon', rare: 'Rare ✨', legendary: 'LEGENDARY 🌈',
};

/** roll a catch: rarity-weighted species + a size somewhere in its range */
export function rollFish(rand: () => number): { species: FishSpeciesDef; size: number } {
  const roll = rand();
  const rarity: FishSpeciesDef['rarity'] =
    roll < 0.55 ? 'common' : roll < 0.83 ? 'uncommon' : roll < 0.97 ? 'rare' : 'legendary';
  const pool = FISH_SPECIES.filter((f) => f.rarity === rarity);
  const species = pool[Math.floor(rand() * pool.length)] ?? FISH_SPECIES[0];
  // most fish are middling; the occasional whopper
  const t = Math.pow(rand(), 1.6);
  const size = Math.round((species.minCm + (species.maxCm - species.minCm) * t) * 10) / 10;
  return { species, size };
}

// ——— Collectables: toys & stuffies hidden all over the island ———
export interface ToyDef {
  id: string;
  name: string;
  icon: string;
  hint: string; // where to look, in kid language
}

export const TOYS: readonly ToyDef[] = [
  { id: 'teddy', name: 'Buttons the Teddy', icon: '🧸', hint: 'Napping near your camp.' },
  { id: 'bunny', name: 'Flopsy the Bunny Stuffy', icon: '🐰', hint: 'Lost in the deep forest.' },
  { id: 'ducky', name: 'Rubber Ducky', icon: '🐤', hint: 'Bobbing near the lake shore.' },
  { id: 'toymouse', name: 'Wind-up Mouse', icon: '🐭', hint: 'Hiding by the agility course.' },
  { id: 'ball', name: 'Bouncy Star Ball', icon: '⭐', hint: 'Rolled to the top of the big hill.' },
  { id: 'ribbon', name: 'Royal Ribbon', icon: '🎀', hint: 'Fluttering at the Art Meadow.' },
  { id: 'bell', name: 'Jingle Bell', icon: '🔔', hint: 'Somewhere high on the Cat Tower.' },
  { id: 'dino', name: 'Rex the Dino Stuffy', icon: '🦖', hint: 'Guarding the boulder crags.' },
  { id: 'unicorn', name: 'Sparkle the Unicorn', icon: '🦄', hint: 'Waiting on a faraway islet.' },
  { id: 'robot', name: 'Beep-Boop Robot', icon: '🤖', hint: 'Watching a rival camp.' },
  { id: 'octopus', name: 'Inky the Octopus', icon: '🐙', hint: 'Washed up on a sandy beach.' },
  { id: 'crown', name: 'Tiny Crown', icon: '👑', hint: 'Only the bravest climber will find it.' },
] as const;

// ——— Territories: four climates share the island ———
export interface TerritoryDef {
  id: 'forest' | 'winter' | 'desert' | 'mountain';
  name: string;
  icon: string;
}

export const TERRITORIES: readonly TerritoryDef[] = [
  { id: 'forest', name: 'Whisperwood Forest', icon: '🌲' },
  { id: 'winter', name: 'Frostpaw Tundra', icon: '❄️' },
  { id: 'desert', name: 'Sunscorch Desert', icon: '🌵' },
  { id: 'mountain', name: 'Cloudpeak Mountains', icon: '⛰️' },
] as const;

export const ACCESSORY_LABELS: Record<AccessoryId, string> = {
  none: 'None',
  collar: 'Collar',
  bandana: 'Bandana',
  bow: 'Bow',
  flowercrown: 'Flower Crown',
  goldcollar: 'Golden Collar',
  scarf: 'Scarf',
  heartcollar: 'Heart Collar 💗',
  starcollar: 'Star Collar ⭐',
};
