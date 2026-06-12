// Paws & Found — content: species, coat genetics, traits, stories, gear, upgrades.

import type {
  AnimalAppearance,
  AnimalCharacter,
  PatternId,
  RegionId,
} from './types';

// ---- regions -------------------------------------------------------------------

export interface RegionMeta {
  id: RegionId;
  name: string;
  emoji: string;
  blurb: string; // map-table description
  minLevel: number;
  needsGear?: string;
  edgeHint: string; // "past the old fence", used in last-seen story lines
}

export const REGIONS: RegionMeta[] = [
  { id: 'woods', name: 'Willow Woods', emoji: '🌳', blurb: 'Tall trees, berry bushes, and shady hollows.', minLevel: 1, edgeHint: 'toward the *tall trees*' },
  { id: 'farm', name: 'Clover Farm', emoji: '🌾', blurb: 'A sunny farm with a big red barn and open meadows.', minLevel: 1, edgeHint: 'past the *old fence*' },
  { id: 'creek', name: 'Crystal Creek', emoji: '💧', blurb: 'A sparkling creek with a little waterfall.', minLevel: 2, edgeHint: 'down where you can *hear water*' },
  { id: 'ridge', name: 'Rocky Ridge', emoji: '⛰️', blurb: 'High rocky ledges. You need a climbing rope!', minLevel: 4, needsGear: 'rope', edgeHint: 'up toward the *high rocks*' },
  { id: 'marsh', name: 'Misty Marsh', emoji: '🌫️', blurb: 'Foggy boardwalks and frog songs. You need rain boots!', minLevel: 6, needsGear: 'boots', edgeHint: 'into the *misty low ground*' },
];

export const REGION_BY_ID = Object.fromEntries(REGIONS.map((r) => [r.id, r])) as Record<RegionId, RegionMeta>;

// ---- species -------------------------------------------------------------------

export interface SpeciesDef {
  id: string;
  label: string; // "kitten"? no — "cat"
  plural: string;
  emoji: string;
  isPet: boolean; // pets reunite with owners; wildlife is released
  minLevel: number;
  weight: number; // spawn weight (cats a touch higher)
  voice: 'meow' | 'bark' | 'chirp' | 'bleat' | 'neigh' | 'quack' | 'squeak' | 'hoot' | 'snort';
  babyWord: string; // kitten, puppy…
  canBePregnant?: boolean;
  patterns: PatternId[]; // allowed patterns
  coats: string[][]; // [base, marks, belly] palettes
  eyes: string[];
  canFlop?: boolean; // floppy ear variants
  size: number; // relative draw size
}

// coat palettes: [base, markings, belly]
const CAT_COATS: string[][] = [
  ['#2e2b2e', '#1c1a1c', '#494349'], // black
  ['#8d8a93', '#6e6a75', '#b9b6bd'], // gray
  ['#e08b3c', '#b96a24', '#f3c89a'], // orange
  ['#e7d6bb', '#cdbb98', '#f7eedd'], // cream
  ['#6b5546', '#4f3d31', '#a08a76'], // brown
  ['#f0ece3', '#d9d3c6', '#faf8f2'], // white
];

export const SPECIES: SpeciesDef[] = [
  {
    id: 'cat', label: 'cat', plural: 'cats', emoji: '🐱', isPet: true, minLevel: 1, weight: 16,
    voice: 'meow', babyWord: 'kitten', canBePregnant: true,
    patterns: ['solid', 'tabby', 'tuxedo', 'calico', 'tortie', 'points', 'spots', 'van', 'socks'],
    coats: CAT_COATS,
    eyes: ['#5da154', '#d9a032', '#5a8fd0', '#b06a30'],
    size: 1,
  },
  {
    id: 'dog', label: 'dog', plural: 'dogs', emoji: '🐶', isPet: true, minLevel: 1, weight: 13,
    voice: 'bark', babyWord: 'puppy', canBePregnant: true, canFlop: true,
    patterns: ['solid', 'patches', 'socks', 'spots', 'tuxedo'],
    coats: [
      ['#caa15c', '#a87f42', '#e8d2a8'], // golden
      ['#4a423c', '#332d29', '#7a7068'], // dark
      ['#f0e9dc', '#d8cfbe', '#faf6ee'], // white
      ['#a8662f', '#7d4a1e', '#d8aa78'], // red-brown
      ['#9aa0a8', '#777d86', '#c8ccd2'], // gray
    ],
    eyes: ['#6b4a2a', '#4a3a2a', '#7d98c4'],
    size: 1.1,
  },
  {
    id: 'rabbit', label: 'rabbit', plural: 'rabbits', emoji: '🐰', isPet: true, minLevel: 1, weight: 8,
    voice: 'squeak', babyWord: 'bunny', canBePregnant: true, canFlop: true,
    patterns: ['solid', 'patches', 'spots', 'tuxedo'],
    coats: [
      ['#b8a48c', '#94816c', '#e2d6c4'],
      ['#f0ece3', '#d8d2c5', '#faf8f2'],
      ['#6e655e', '#544c46', '#a39a92'],
      ['#caa15c', '#a87f42', '#ecd9b4'],
    ],
    eyes: ['#5a4636', '#8a3a3a', '#5a8fd0'],
    size: 0.7,
  },
  {
    id: 'parrot', label: 'parrot', plural: 'parrots', emoji: '🦜', isPet: true, minLevel: 2, weight: 5,
    voice: 'chirp', babyWord: 'chick',
    patterns: ['solid'],
    coats: [
      ['#3da455', '#e0b13a', '#bce0a8'],
      ['#d84f4f', '#3a6fc4', '#f0c8a0'],
      ['#5a8fd0', '#e8d44e', '#bcd4ee'],
    ],
    eyes: ['#2a2a2a'],
    size: 0.55,
  },
  {
    id: 'goat', label: 'goat', plural: 'goats', emoji: '🐐', isPet: true, minLevel: 3, weight: 5,
    voice: 'bleat', babyWord: 'kid',
    patterns: ['solid', 'patches', 'socks'],
    coats: [
      ['#e8e2d4', '#cfc6b2', '#f6f2e8'],
      ['#8a7a66', '#6b5d4c', '#bcae98'],
      ['#3e3833', '#2b2622', '#6e6258'],
    ],
    eyes: ['#caa53a'],
    size: 1.05,
  },
  {
    id: 'duck', label: 'duckling', plural: 'ducklings', emoji: '🦆', isPet: false, minLevel: 2, weight: 6,
    voice: 'quack', babyWord: 'duckling',
    patterns: ['solid'],
    coats: [
      ['#f2d96a', '#e0b13a', '#f8eba8'],
      ['#e8dcc0', '#cabc92', '#f5efdd'],
    ],
    eyes: ['#2a2a2a'],
    size: 0.5,
  },
  {
    id: 'pony', label: 'pony', plural: 'ponies', emoji: '🐴', isPet: true, minLevel: 5, weight: 4,
    voice: 'neigh', babyWord: 'foal',
    patterns: ['solid', 'patches', 'socks', 'spots'],
    coats: [
      ['#8a5a36', '#6b4226', '#c49a72'],
      ['#d8cfc2', '#b8ac9c', '#efe9de'],
      ['#3e3833', '#2b2622', '#7a6e62'],
      ['#caa15c', '#a87f42', '#e8d2a8'],
    ],
    eyes: ['#3a2e22'],
    size: 1.5,
  },
  {
    id: 'turtle', label: 'turtle', plural: 'turtles', emoji: '🐢', isPet: false, minLevel: 3, weight: 4,
    voice: 'snort', babyWord: 'hatchling',
    patterns: ['solid', 'spots'],
    coats: [
      ['#5d8a4a', '#42663a', '#cfc890'],
      ['#6e8a5d', '#4c6a44', '#d8d0a0'],
    ],
    eyes: ['#2a2a2a'],
    size: 0.65,
  },
  {
    id: 'fawn', label: 'fawn', plural: 'fawns', emoji: '🦌', isPet: false, minLevel: 4, weight: 4,
    voice: 'squeak', babyWord: 'fawn',
    patterns: ['spots'],
    coats: [['#b98a5a', '#8f6438', '#e8d8be']],
    eyes: ['#3a2e22'],
    size: 1.1,
  },
  {
    id: 'fox', label: 'fox kit', plural: 'fox kits', emoji: '🦊', isPet: false, minLevel: 5, weight: 3,
    voice: 'squeak', babyWord: 'kit',
    patterns: ['tuxedo'],
    coats: [['#d8763a', '#b4571f', '#f3e6d4']],
    eyes: ['#caa53a'],
    size: 0.8,
  },
  {
    id: 'owl', label: 'owl', plural: 'owls', emoji: '🦉', isPet: false, minLevel: 6, weight: 3,
    voice: 'hoot', babyWord: 'owlet',
    patterns: ['spots'],
    coats: [
      ['#9a8a72', '#776a55', '#d8cdb6'],
      ['#b8aa90', '#94886e', '#e8e0cc'],
    ],
    eyes: ['#e0b13a'],
    size: 0.7,
  },
  {
    id: 'hedgehog', label: 'hedgehog', plural: 'hedgehogs', emoji: '🦔', isPet: false, minLevel: 3, weight: 4,
    voice: 'snort', babyWord: 'hoglet',
    patterns: ['solid'],
    coats: [['#8a7a66', '#5d5142', '#e2d2ba']],
    eyes: ['#2a2a2a'],
    size: 0.5,
  },
  {
    id: 'hamster', label: 'hamster', plural: 'hamsters', emoji: '🐹', isPet: true, minLevel: 2, weight: 5,
    voice: 'squeak', babyWord: 'pup',
    patterns: ['solid', 'patches', 'tuxedo'],
    coats: [
      ['#e0a85c', '#c4883a', '#f6e8cc'],
      ['#d8d0c2', '#b8ac9c', '#f2ede4'],
    ],
    eyes: ['#2a2a2a'],
    size: 0.4,
  },
];

export const SPECIES_BY_ID = Object.fromEntries(SPECIES.map((s) => [s.id, s])) as Record<string, SpeciesDef>;

// ---- appearance generation & genetics ----------------------------------------------

export function randomAppearance(rng: () => number, speciesId: string): AnimalAppearance {
  const sp = SPECIES_BY_ID[speciesId];
  const coat = sp.coats[Math.floor(rng() * sp.coats.length)];
  let pattern = sp.patterns[Math.floor(rng() * sp.patterns.length)];
  let base = coat[0];
  let marks = coat[1];
  const belly = coat[2];

  if (speciesId === 'cat') {
    // calico/tortie are color-specific: white/cream base with orange+black patches
    if (pattern === 'calico') {
      base = '#f0ece3';
      marks = rng() < 0.5 ? '#e08b3c' : '#2e2b2e';
    } else if (pattern === 'tortie') {
      base = '#3a2e28';
      marks = '#d8843a';
    } else if (pattern === 'points') {
      base = '#ece2d0';
      marks = '#5d4a3c';
    } else if (pattern === 'van') {
      base = '#f0ece3';
      marks = coat[0] === '#f0ece3' ? '#e08b3c' : coat[0];
    }
  }
  const eye = sp.eyes[Math.floor(rng() * sp.eyes.length)];
  const oddEyed = speciesId === 'cat' && rng() < 0.06;
  return {
    base,
    marks,
    belly,
    pattern,
    eye,
    eye2: oddEyed ? (eye === '#5a8fd0' ? '#d9a032' : '#5a8fd0') : undefined,
    fluffy: rng() < (speciesId === 'cat' || speciesId === 'rabbit' ? 0.35 : 0.15),
    earFlop: sp.canFlop ? rng() < 0.45 : false,
    size: 0.85 + rng() * 0.35,
  };
}

/** Babies inherit & remix their mother's coat. */
export function babyAppearance(rng: () => number, mom: AnimalCharacter): AnimalAppearance {
  const sp = SPECIES_BY_ID[mom.species];
  const m = mom.appearance;
  const roll = rng();
  let app: AnimalAppearance;
  if (roll < 0.45) {
    // takes after mama
    app = { ...m, size: 0.85 + rng() * 0.2 };
  } else if (roll < 0.8) {
    // mama's colors, different pattern
    const pattern = sp.patterns[Math.floor(rng() * sp.patterns.length)];
    app = { ...m, pattern, size: 0.85 + rng() * 0.2 };
    if (mom.species === 'cat' && (m.pattern === 'calico' || m.pattern === 'tortie')) {
      // calico mamas famously throw orange tabbies and black solids
      const pick = rng();
      if (pick < 0.34) {
        app = { ...app, base: '#e08b3c', marks: '#b96a24', pattern: 'tabby' };
      } else if (pick < 0.67) {
        app = { ...app, base: '#2e2b2e', marks: '#1c1a1c', pattern: rng() < 0.5 ? 'solid' : 'tuxedo' };
      }
    }
  } else {
    app = randomAppearance(rng, mom.species);
  }
  app.fluffy = rng() < 0.5 ? m.fluffy : app.fluffy;
  app.eye = rng() < 0.6 ? m.eye : sp.eyes[Math.floor(rng() * sp.eyes.length)];
  app.eye2 = undefined;
  if (mom.species === 'cat' && rng() < 0.05) app.eye2 = app.eye === '#5a8fd0' ? '#d9a032' : '#5a8fd0';
  return app;
}

export function describeAppearance(a: AnimalAppearance, speciesId: string): string {
  const colorName = (c: string) =>
    ({
      '#2e2b2e': 'black', '#8d8a93': 'gray', '#e08b3c': 'orange', '#e7d6bb': 'cream',
      '#6b5546': 'brown', '#f0ece3': 'white', '#caa15c': 'golden', '#4a423c': 'dark brown',
      '#a8662f': 'red-brown', '#9aa0a8': 'silver', '#b8a48c': 'sandy', '#6e655e': 'smoky',
      '#3a2e28': 'dark', '#ece2d0': 'cream', '#8a5a36': 'chestnut', '#d8cfc2': 'dappled white',
      '#3e3833': 'midnight', '#e8e2d4': 'snowy', '#8a7a66': 'earthy', '#d8763a': 'rusty',
      '#b98a5a': 'tawny', '#f2d96a': 'sunny yellow', '#e8dcc0': 'pale', '#3da455': 'emerald',
      '#d84f4f': 'scarlet', '#5a8fd0': 'sky-blue', '#e0a85c': 'honey', '#d8d0c2': 'pearl',
      '#5d8a4a': 'mossy', '#6e8a5d': 'sage', '#9a8a72': 'speckled brown', '#b8aa90': 'sandy',
    })[a.base] ?? 'lovely';
  const pat: Record<PatternId, string> = {
    solid: '',
    tabby: ' tabby',
    tuxedo: ' tuxedo',
    calico: ' calico',
    tortie: ' tortoiseshell',
    points: ' colorpoint',
    spots: ' spotted',
    patches: ' patched',
    socks: ' with little white socks',
    van: ' with a colored cap and tail',
  };
  const fluff = a.fluffy ? 'fluffy ' : '';
  const eyes = a.eye2 ? ' — one blue eye, one gold!' : '';
  return `a ${fluff}${colorName(a.base)}${pat[a.pattern]} ${SPECIES_BY_ID[speciesId].label}${eyes}`;
}

// ---- names & owners ----------------------------------------------------------------

export const ANIMAL_NAMES = [
  'Biscuit', 'Clementine', 'Waffles', 'Pepper', 'Mochi', 'Daisy', 'Pickles', 'Maple',
  'Sunny', 'Boots', 'Luna', 'Ziggy', 'Poppy', 'Marshmallow', 'Pumpkin', 'Jellybean',
  'Noodle', 'Butterscotch', 'Cocoa', 'Pearl', 'Olive', 'Peanut', 'Tulip', 'Bramble',
  'Snickers', 'Willow', 'Clover', 'Honey', 'Pippin', 'Rosie', 'Toast', 'Mittens',
  'Ginger', 'Acorn', 'Bubbles', 'Fern', 'Domino', 'Sprout', 'Cricket', 'Velvet',
];

export const OWNERS = [
  'Mrs. Maple', 'Grandpa Otto', 'Mia', 'Theo', 'Nurse Penny', 'Mr. Banjo',
  'Farmer Joon', 'Miss Clover', 'Captain Finn', 'Granny Sage', 'Mr. Pemberton',
  'Little Josie', 'Baker Lou', 'Professor Wren',
];

export const RANGER = 'Ranger Pearl';

// ---- traits: the deduction engine ---------------------------------------------------

export interface Trait {
  id: string;
  chip: string; // short label on the profile card, with emoji
  story: (n: string, P: string, p: string) => string; // name, She/He, she/he — *stars* = highlights
  regions: Partial<Record<RegionId, number>>; // positive pulls, negative pushes away
  lure?: string; // gear id that instantly calms this animal
  evidence?: string; // special evidence line shown on the trail
}

export const TRAITS: Trait[] = [
  {
    id: 'berries',
    chip: 'Loves berries 🫐',
    story: (n, P) => `"${P} *loves berries* — ${n} can sniff out a berry bush from a mile away!"`,
    regions: { woods: 3, marsh: 1 },
    lure: 'berries',
    evidence: 'A berry bush, picked clean. Someone had a feast here!',
  },
  {
    id: 'butterflies',
    chip: 'Chases butterflies 🦋',
    story: (n, P) => `"${P} simply cannot resist *chasing butterflies* across open grass."`,
    regions: { farm: 3, creek: 1 },
    evidence: 'The clover is all trampled in zigzags. Somebody was chasing something…',
  },
  {
    id: 'splash',
    chip: 'Loves splashing 💦',
    story: (n, P) => `"${P} *loves splashing*! Every puddle, every pond — splash, splash, splash."`,
    regions: { creek: 3, marsh: 2 },
    evidence: 'Wet paw prints on a dry rock. Someone went swimming!',
  },
  {
    id: 'fearwater',
    chip: 'Scared of water 🙀',
    story: (n, P) => `"Oh, but ${P.toLowerCase() === 'she' ? 'she' : 'he'} is *terrified of water*. ${P} won't go near so much as a puddle!"`,
    regions: { creek: -5, marsh: -5, woods: 1, farm: 1, ridge: 1 },
  },
  {
    id: 'climber',
    chip: 'Champion climber 🧗',
    story: (n, P) => `"${P} is a *champion climber*. Fences, trees, bookshelves — nothing is too high!"`,
    regions: { ridge: 3, woods: 1 },
    evidence: 'Tiny scratch marks going UP. A climber came this way!',
  },
  {
    id: 'fearheights',
    chip: 'Afraid of heights 😨',
    story: (n, P) => `"${P} is *afraid of heights* — ${n} won't even hop on the sofa."`,
    regions: { ridge: -5, farm: 1, creek: 1, marsh: 1 },
  },
  {
    id: 'digger',
    chip: 'Digs everywhere 🕳️',
    story: (n, P) => `"${P} *digs* — oh how ${n} digs! My garden looks like the moon!"`,
    regions: { farm: 3, woods: 1 },
    evidence: 'A fresh little hole, dirt flung everywhere. The digger was just here.',
  },
  {
    id: 'frogs',
    chip: 'Follows frog songs 🐸',
    story: (n, P) => `"Whenever ${n} hears *frogs singing*, off ${P.toLowerCase()} goes to find them!"`,
    regions: { marsh: 3, creek: 1 },
    evidence: 'The frogs went quiet here a moment ago. Something tip-toed past.',
  },
  {
    id: 'apples',
    chip: 'Snacks on apples 🍎',
    story: (n, P) => `"${P} would do anything for an *apple slice*. Anything!"`,
    regions: { farm: 3 },
    lure: 'apple',
    evidence: 'An apple core, nibbled all around. Someone snacked here!',
  },
  {
    id: 'shade',
    chip: 'Naps in shade 😴',
    story: (n, P) => `"On warm days ${n} hunts for the *deepest, coolest shade* to nap in."`,
    regions: { woods: 3, ridge: 1 },
    evidence: 'A patch of flattened grass under a shady branch — a perfect napping spot.',
  },
  {
    id: 'shiny',
    chip: 'Collects shiny things ✨',
    story: (n, P) => `"${P} *steals shiny things*! Spoons, buttons, my reading glasses…"`,
    regions: { creek: 3, ridge: 1 },
    evidence: 'A shiny button, dropped on the path. Someone\'s treasure!',
  },
  {
    id: 'highplaces',
    chip: 'Watches from up high 🔭',
    story: (n, P) => `"${P} always finds the *highest spot* and watches everything from up there."`,
    regions: { ridge: 3 },
    evidence: 'Pebbles knocked from a ledge above. Someone is watching from up high…',
  },
  {
    id: 'mud',
    chip: 'Loves squishy mud 🥾',
    story: (n, P) => `"${P} can't resist *squishy mud*. The squishier, the better!"`,
    regions: { marsh: 3, farm: 1 },
    evidence: 'Deep squishy tracks in the mud — fresh ones!',
  },
  {
    id: 'flowers',
    chip: 'Sniffs every flower 🌸',
    story: (n, P) => `"${P} stops to *sniff every single flower*. A walk takes us hours!"`,
    regions: { farm: 2, woods: 1, creek: 1 },
    evidence: 'A flower patch with one perfect nose-shaped dent in the petals.',
  },
  {
    id: 'squeaky',
    chip: 'Loves squeaky toys 🧸',
    story: (n, P) => `"${P} comes running for the *squeaky toy* every time, no matter what."`,
    regions: {},
    lure: 'squeaky',
  },
  {
    id: 'catnip',
    chip: 'Wild for catnip 🌿',
    story: (n, P) => `"One whiff of *catnip* and ${n} turns into a purring noodle."`,
    regions: {},
    lure: 'catnip',
  },
  {
    id: 'seeds',
    chip: 'Crazy for sunflower seeds 🌻',
    story: (n, P) => `"${P} will land right on your shoulder for *sunflower seeds*."`,
    regions: {},
    lure: 'seeds',
  },
  {
    id: 'blanket',
    chip: 'Calmed by soft blankets 🛏️',
    story: (n, P) => `"When ${n} is scared, only ${P.toLowerCase() === 'she' ? 'her' : 'his'} *soft blanket* helps."`,
    regions: {},
    lure: 'blanket',
  },
];

export const TRAIT_BY_ID = Object.fromEntries(TRAITS.map((t) => [t.id, t])) as Record<string, Trait>;

// trait pools: which species can plausibly have which trait
export const SPECIES_TRAITS: Record<string, string[]> = {
  cat: ['climber', 'fearwater', 'shade', 'catnip', 'butterflies', 'highplaces', 'blanket', 'shiny', 'flowers'],
  dog: ['splash', 'digger', 'squeaky', 'apples', 'butterflies', 'mud', 'flowers', 'fearheights', 'blanket'],
  rabbit: ['berries', 'digger', 'shade', 'fearwater', 'flowers', 'blanket'],
  parrot: ['shiny', 'seeds', 'highplaces', 'flowers'],
  goat: ['climber', 'apples', 'mud', 'flowers'],
  duck: ['splash', 'frogs', 'mud'],
  pony: ['apples', 'fearheights', 'flowers', 'splash'],
  turtle: ['splash', 'frogs', 'shade', 'mud'],
  fawn: ['berries', 'shade', 'flowers', 'fearwater'],
  fox: ['berries', 'shiny', 'digger', 'frogs'],
  owl: ['highplaces', 'shade', 'fearwater'],
  hedgehog: ['berries', 'digger', 'shade', 'blanket'],
  hamster: ['seeds', 'digger', 'blanket', 'fearwater'],
};

// ---- gear & upgrades -------------------------------------------------------------------

export interface GearDef {
  id: string;
  name: string;
  icon: string;
  cost: number; // 0 = starter
  desc: string;
  kind: 'lure' | 'tool';
}

export const GEAR: GearDef[] = [
  { id: 'apple', name: 'Crunchy Apples', icon: '🍎', cost: 0, desc: 'A favorite snack for farm friends.', kind: 'lure' },
  { id: 'blanket', name: 'Soft Blanket', icon: '🛏️', cost: 0, desc: 'Calms the most nervous animals.', kind: 'lure' },
  { id: 'berries', name: 'Berry Basket', icon: '🫐', cost: 25, desc: 'Sweet berries for berry-lovers.', kind: 'lure' },
  { id: 'squeaky', name: 'Squeaky Bone', icon: '🧸', cost: 25, desc: 'No dog can resist the squeak.', kind: 'lure' },
  { id: 'catnip', name: 'Catnip Sprig', icon: '🌿', cost: 25, desc: 'Turns cats into purring noodles.', kind: 'lure' },
  { id: 'seeds', name: 'Sunflower Seeds', icon: '🌻', cost: 25, desc: 'Birds and tiny pals come running.', kind: 'lure' },
  { id: 'binoculars', name: 'Binoculars', icon: '🔭', cost: 60, desc: 'See farther — a bigger search circle.', kind: 'tool' },
  { id: 'rope', name: 'Climbing Rope', icon: '🪢', cost: 80, desc: 'Unlocks Rocky Ridge missions!', kind: 'tool' },
  { id: 'boots', name: 'Rain Boots', icon: '🥾', cost: 100, desc: 'Unlocks Misty Marsh missions!', kind: 'tool' },
  { id: 'sneakers', name: 'Quiet Sneakers', icon: '👟', cost: 70, desc: 'Sneak closer before animals notice.', kind: 'tool' },
];

export const GEAR_BY_ID = Object.fromEntries(GEAR.map((g) => [g.id, g])) as Record<string, GearDef>;

export interface UpgradeDef {
  id: string;
  name: string;
  icon: string;
  cost: number;
  desc: string;
}

export const UPGRADES: UpgradeDef[] = [
  { id: 'medbay', name: 'Medical Bay', icon: '🏥', cost: 60, desc: 'Dr. Fig joins! She can tell when a rescued mama is expecting babies.' },
  { id: 'cozyroom', name: 'Cozy Room', icon: '🛋️', cost: 80, desc: 'Warm beds by a window — more rescued friends can live with you.' },
  { id: 'garden', name: 'Butterfly Garden', icon: '🌷', cost: 50, desc: 'Flowers and butterflies for everyone. Residents give extra hearts.' },
  { id: 'tower', name: 'Lookout Tower', icon: '🗼', cost: 120, desc: 'Before each mission, the lookout rules out one wrong place.' },
  { id: 'playyard', name: 'Play Yard', icon: '🎠', cost: 100, desc: 'A little playground — petting happy residents earns a coin.' },
];

export const UPGRADE_BY_ID = Object.fromEntries(UPGRADES.map((u) => [u.id, u])) as Record<string, UpgradeDef>;

// ---- leveling ---------------------------------------------------------------------------

/** rescues needed to reach each level (index = level) */
export function levelForRescues(rescues: number): number {
  // L1:0 L2:2 L3:5 L4:8 L5:12 L6:16 L7:21 L8:27 … grows forever
  let level = 1;
  let need = 2;
  let total = 0;
  while (rescues >= total + need) {
    total += need;
    level++;
    need = Math.min(need + 1, 9);
  }
  return level;
}

export function rescuesToNextLevel(rescues: number): { have: number; need: number } {
  let level = 1;
  let need = 2;
  let total = 0;
  while (rescues >= total + need) {
    total += need;
    level++;
    need = Math.min(need + 1, 9);
  }
  return { have: rescues - total, need };
}
