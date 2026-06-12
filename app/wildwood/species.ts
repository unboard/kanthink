// Wildwood — species data: birds, fish, and buildable structures.
// Bird songs are defined as synthesizer event sequences (see audio.ts).

export type Habitat =
  | 'forest'
  | 'pine'
  | 'meadow'
  | 'water'
  | 'marsh'
  | 'shore'
  | 'clearing'
  | 'sky';

export type ActiveTime = 'day' | 'dawnDusk' | 'night' | 'all';

export interface SongEvent {
  t: number; // start offset, seconds
  dur: number;
  kind: 'tone' | 'noise' | 'click';
  f0: number;
  f1?: number;
  type?: OscillatorType;
  vol?: number; // 0..1 relative
  vibrato?: { rate: number; depth: number }; // depth in Hz
  trem?: { rate: number; depth: number }; // amplitude modulation, depth 0..1
  q?: number; // bandpass Q for noise
  attack?: number;
  release?: number;
}

export type BirdShape =
  | 'songbird'
  | 'jay'
  | 'dove'
  | 'duck'
  | 'heron'
  | 'raptor'
  | 'owl'
  | 'woodpecker'
  | 'hummingbird'
  | 'loon';

export interface BirdLook {
  shape: BirdShape;
  size: number; // relative body size, 1 = chickadee-ish
  body: string;
  breast: string;
  head: string;
  wing: string;
  beak: string;
  beakLen: number; // 0.5 short .. 2.5 heron
  tailLen: number; // 0.6 short .. 1.8 long
  crest?: boolean;
  cap?: string;
  eyeLine?: string;
  cheek?: string;
  throat?: string;
  wingbar?: string;
  epaulet?: string;
  mask?: string;
  tail?: string;
}

export interface BirdSpecies {
  id: string;
  name: string;
  sci: string;
  fact: string;
  songHint: string; // mnemonic, e.g. "fee-bee!"
  rarity: 1 | 2 | 3; // common / uncommon / rare
  habitats: Habitat[];
  time: ActiveTime;
  feeders?: string[]; // structure ids that attract this species
  nest?: 'tree' | 'cavity' | 'marsh' | 'box' | 'platform';
  look: BirdLook;
  song: SongEvent[];
  songEvery: [number, number]; // min/max seconds between songs
}

// ---- song-building helpers -------------------------------------------------

const tone = (
  t: number,
  dur: number,
  f0: number,
  f1: number = f0,
  extra: Partial<SongEvent> = {}
): SongEvent => ({ kind: 'tone', t, dur, f0, f1, type: 'sine', vol: 1, ...extra });

const noise = (
  t: number,
  dur: number,
  f0: number,
  f1: number = f0,
  extra: Partial<SongEvent> = {}
): SongEvent => ({ kind: 'noise', t, dur, f0, f1, q: 6, vol: 1, ...extra });

/** evenly spaced repeated short notes (chips / hoots / quacks) */
function series(
  t: number,
  n: number,
  gap: number,
  make: (i: number, t: number) => SongEvent | SongEvent[]
): SongEvent[] {
  const out: SongEvent[] = [];
  for (let i = 0; i < n; i++) {
    const e = make(i, t + i * gap);
    if (Array.isArray(e)) out.push(...e);
    else out.push(e);
  }
  return out;
}

// ---- the birds of Wildwood Valley ------------------------------------------

export const BIRDS: BirdSpecies[] = [
  {
    id: 'cardinal',
    name: 'Northern Cardinal',
    sci: 'Cardinalis cardinalis',
    fact: 'One of the few female birds in North America that sings — often from inside the nest, possibly telling the male when to bring food. Cardinals never molt into a dull plumage, so they burn scarlet against the snow all winter.',
    songHint: '“whoit whoit whoit — birdy birdy birdy!”',
    rarity: 1,
    habitats: ['forest', 'clearing', 'meadow'],
    time: 'all',
    feeders: ['feeder'],
    nest: 'tree',
    look: {
      shape: 'songbird',
      size: 1.25,
      body: '#c8242b',
      breast: '#d4373c',
      head: '#c8242b',
      wing: '#a31d24',
      beak: '#e88234',
      beakLen: 0.9,
      tailLen: 1.3,
      crest: true,
      mask: '#27170f',
    },
    song: [
      ...series(0, 3, 0.34, (i, t) => tone(t, 0.24, 1300, 2900, { vol: 0.9 })),
      ...series(1.15, 6, 0.13, (i, t) => tone(t, 0.09, 2600, 1900, { vol: 0.8 })),
    ],
    songEvery: [9, 22],
  },
  {
    id: 'chickadee',
    name: 'Black-capped Chickadee',
    sci: 'Poecile atricapillus',
    fact: 'Chickadees hide thousands of seeds each fall and remember where — their hippocampus actually grows new neurons in autumn to store the map. The more “dee” notes in a chickadee-dee-dee call, the more dangerous the predator.',
    songHint: 'a pure, whistled “fee-bee”',
    rarity: 1,
    habitats: ['forest', 'pine', 'clearing'],
    time: 'all',
    feeders: ['feeder', 'suet'],
    nest: 'box',
    look: {
      shape: 'songbird',
      size: 0.85,
      body: '#9aa0a0',
      breast: '#e8e2d2',
      head: '#e8e2d2',
      wing: '#7d8487',
      beak: '#2a2a2a',
      beakLen: 0.55,
      tailLen: 1.1,
      cap: '#1c1c1c',
      throat: '#1c1c1c',
      cheek: '#f4efe2',
    },
    song: [tone(0, 0.34, 3960, 3900, { vol: 0.8 }), tone(0.5, 0.4, 3100, 3050, { vol: 0.8 })],
    songEvery: [8, 18],
  },
  {
    id: 'bluejay',
    name: 'Blue Jay',
    sci: 'Cyanocitta cristata',
    fact: 'Blue Jays are gifted mimics and routinely impersonate Red-tailed Hawks — sometimes to scatter other birds from a feeder, sometimes apparently just to announce a real hawk is near. A single jay can cache 3,000+ acorns in a fall, replanting whole oak forests.',
    songHint: 'a loud, harsh “jeeer! jeeer!”',
    rarity: 1,
    habitats: ['forest', 'clearing'],
    time: 'day',
    feeders: ['feeder'],
    nest: 'tree',
    look: {
      shape: 'jay',
      size: 1.35,
      body: '#4d7fc4',
      breast: '#dcdfe4',
      head: '#5a8ccc',
      wing: '#3a66ab',
      beak: '#26262a',
      beakLen: 0.95,
      tailLen: 1.5,
      crest: true,
      mask: '#26262a',
      wingbar: '#e8ecf2',
    },
    song: [
      noise(0, 0.38, 2300, 1500, { q: 3, vol: 0.9, trem: { rate: 38, depth: 0.5 } }),
      tone(0, 0.38, 2200, 1400, { type: 'sawtooth', vol: 0.35 }),
      noise(0.55, 0.38, 2300, 1500, { q: 3, vol: 0.85, trem: { rate: 38, depth: 0.5 } }),
      tone(0.55, 0.38, 2200, 1400, { type: 'sawtooth', vol: 0.32 }),
    ],
    songEvery: [10, 25],
  },
  {
    id: 'robin',
    name: 'American Robin',
    sci: 'Turdus migratorius',
    fact: 'The robin\'s caroling is usually the very first birdsong of the day, often starting in full darkness — the dawn chorus opens with them. They hunt earthworms partly by sight, cocking their head to look, not listen.',
    songHint: 'a cheerful carol: “cheerily, cheer-up, cheerio”',
    rarity: 1,
    habitats: ['clearing', 'meadow', 'forest'],
    time: 'all',
    feeders: ['bath', 'berry'],
    nest: 'tree',
    look: {
      shape: 'songbird',
      size: 1.3,
      body: '#4a4a4d',
      breast: '#d2622a',
      head: '#33333a',
      wing: '#55555a',
      beak: '#e0a23a',
      beakLen: 0.8,
      tailLen: 1.15,
    },
    song: [
      tone(0, 0.16, 2000, 2600, { vol: 0.7, vibrato: { rate: 22, depth: 60 } }),
      tone(0.24, 0.16, 2900, 2300, { vol: 0.7, vibrato: { rate: 22, depth: 60 } }),
      tone(0.52, 0.18, 2100, 2700, { vol: 0.7 }),
      tone(0.95, 0.16, 2700, 2100, { vol: 0.65, vibrato: { rate: 22, depth: 60 } }),
      tone(1.2, 0.2, 2300, 2800, { vol: 0.7 }),
    ],
    songEvery: [7, 16],
  },
  {
    id: 'goldfinch',
    name: 'American Goldfinch',
    sci: 'Spinus tristis',
    fact: 'Goldfinches are strict vegetarians and nest later than almost any other songbird — they wait for thistle down in midsummer to line their nests. Their bouncing flight comes with a flight call birders write as “po-ta-to-chip!”',
    songHint: 'bouncy “per-chick-o-ree!” in flight',
    rarity: 1,
    habitats: ['meadow', 'clearing'],
    time: 'day',
    feeders: ['thistle', 'wildflowers'],
    nest: 'tree',
    look: {
      shape: 'songbird',
      size: 0.8,
      body: '#ecc52e',
      breast: '#f2d33f',
      head: '#ecc52e',
      wing: '#26262a',
      beak: '#e8a05c',
      beakLen: 0.55,
      tailLen: 0.95,
      cap: '#1d1d20',
      wingbar: '#f4efe2',
    },
    song: [
      tone(0, 0.08, 3400, 4300, { vol: 0.7 }),
      tone(0.13, 0.08, 4300, 3300, { vol: 0.7 }),
      tone(0.26, 0.08, 3500, 4400, { vol: 0.7 }),
      tone(0.39, 0.1, 4200, 3600, { vol: 0.7 }),
    ],
    songEvery: [7, 15],
  },
  {
    id: 'dove',
    name: 'Mourning Dove',
    sci: 'Zenaida macroura',
    fact: 'That haunting coo is so low and soft that people regularly mistake it for an owl. The whistling you hear when a dove bursts into flight isn\'t its voice at all — it\'s air rushing through special wing feathers, an built-in alarm for the whole neighborhood.',
    songHint: 'a low, mournful “coo-OO, oo, oo, oo”',
    rarity: 1,
    habitats: ['clearing', 'meadow'],
    time: 'all',
    feeders: ['feeder'],
    nest: 'tree',
    look: {
      shape: 'dove',
      size: 1.3,
      body: '#b3a18c',
      breast: '#cdb9a4',
      head: '#b8a892',
      wing: '#a08e77',
      beak: '#3a3a3a',
      beakLen: 0.6,
      tailLen: 1.6,
    },
    song: [
      tone(0, 0.3, 520, 480, { vol: 0.55, attack: 0.06 }),
      tone(0.42, 0.55, 660, 500, { vol: 0.6, attack: 0.05, vibrato: { rate: 10, depth: 18 } }),
      tone(1.25, 0.4, 500, 480, { vol: 0.5, attack: 0.06 }),
      tone(1.85, 0.4, 490, 470, { vol: 0.48, attack: 0.06 }),
      tone(2.45, 0.4, 485, 465, { vol: 0.45, attack: 0.06 }),
    ],
    songEvery: [12, 28],
  },
  {
    id: 'redwing',
    name: 'Red-winged Blackbird',
    sci: 'Agelaius phoeniceus',
    fact: 'A male defends his patch of cattails by flashing scarlet shoulder patches he can hide or blaze at will — bold display for rivals, low profile when trespassing. For many birders the first “conk-la-ree!” over a marsh is the true first day of spring.',
    songHint: 'a gurgling, buzzy “conk-la-REEEE!”',
    rarity: 1,
    habitats: ['marsh', 'shore'],
    time: 'day',
    nest: 'marsh',
    look: {
      shape: 'songbird',
      size: 1.2,
      body: '#1d1d22',
      breast: '#26262c',
      head: '#1d1d22',
      wing: '#16161a',
      beak: '#2e2e33',
      beakLen: 0.85,
      tailLen: 1.25,
      epaulet: '#d8392b',
    },
    song: [
      tone(0, 0.08, 900, 950, { vol: 0.7 }),
      tone(0.14, 0.08, 1350, 1400, { vol: 0.7 }),
      tone(0.28, 0.62, 2700, 3100, {
        vol: 0.85,
        trem: { rate: 42, depth: 0.85 },
        vibrato: { rate: 8, depth: 120 },
      }),
    ],
    songEvery: [8, 18],
  },
  {
    id: 'heron',
    name: 'Great Blue Heron',
    sci: 'Ardea herodias',
    fact: 'A heron stands statue-still for many minutes, then strikes faster than you can blink — its S-curved neck is a loaded spring. Despite a six-foot wingspan it weighs about as much as a half-gallon of milk.',
    songHint: 'a deep, prehistoric “fraaahnk!” croak',
    rarity: 2,
    habitats: ['shore', 'marsh', 'water'],
    time: 'all',
    nest: 'platform',
    look: {
      shape: 'heron',
      size: 2.6,
      body: '#7d8c96',
      breast: '#9aa7ae',
      head: '#e8e6dd',
      wing: '#65737d',
      beak: '#d9a93f',
      beakLen: 2.4,
      tailLen: 0.7,
      eyeLine: '#23272b',
    },
    song: [
      noise(0, 0.5, 520, 320, { q: 2.5, vol: 0.9, trem: { rate: 24, depth: 0.6 } }),
      tone(0, 0.5, 240, 170, { type: 'sawtooth', vol: 0.4 }),
    ],
    songEvery: [25, 60],
  },
  {
    id: 'mallard',
    name: 'Mallard',
    sci: 'Anas platyrhynchos',
    fact: 'Only the female makes the classic “quack” — the drake\'s voice is a quieter, raspy whisper. Mallards can sleep with one eye open, half their brain on watch while the other half rests.',
    songHint: 'the classic descending “quack-quack-quack”',
    rarity: 1,
    habitats: ['water', 'shore'],
    time: 'day',
    nest: 'marsh',
    look: {
      shape: 'duck',
      size: 1.7,
      body: '#8d8273',
      breast: '#6b4f3a',
      head: '#1f6e3d',
      wing: '#7a7064',
      beak: '#d9c13f',
      beakLen: 1.1,
      tailLen: 0.7,
      wingbar: '#3a5fa8',
    },
    song: series(0, 5, 0.26, (i, t) => [
      noise(t, 0.16, 900, 750, { q: 3, vol: 0.8 - i * 0.1, trem: { rate: 28, depth: 0.5 } }),
      tone(t, 0.16, 760, 640, { type: 'sawtooth', vol: 0.35 - i * 0.04 }),
    ]),
    songEvery: [12, 30],
  },
  {
    id: 'woodduck',
    name: 'Wood Duck',
    sci: 'Aix sponsa',
    fact: 'Arguably North America\'s most ornate duck, it nests high in tree cavities — day-old ducklings leap up to fifty feet to the forest floor, bouncing unharmed, then follow mom to water. The female\'s rising “oo-eek!” squeal gives them away.',
    songHint: 'a rising, squealing “oo-EEK!”',
    rarity: 2,
    habitats: ['water', 'marsh'],
    time: 'dawnDusk',
    nest: 'cavity',
    look: {
      shape: 'duck',
      size: 1.5,
      body: '#7c5a44',
      breast: '#8c3a3f',
      head: '#2e5d46',
      wing: '#4a4f63',
      beak: '#c84a3a',
      beakLen: 0.9,
      tailLen: 0.9,
      crest: true,
      eyeLine: '#f0ead8',
      throat: '#f0ead8',
    },
    song: [tone(0, 0.42, 800, 2400, { vol: 0.75, vibrato: { rate: 14, depth: 90 } })],
    songEvery: [15, 35],
  },
  {
    id: 'kingfisher',
    name: 'Belted Kingfisher',
    sci: 'Megaceryle alcyon',
    fact: 'Kingfishers nest in tunnels they dig six feet into riverbanks, and they\'re one of the rare bird species where the female is more colorful than the male — she wears the rusty belt. You\'ll almost always hear the rattle before you see the bird.',
    songHint: 'a loud, mechanical rattle along the water',
    rarity: 2,
    habitats: ['shore', 'water'],
    time: 'day',
    nest: 'cavity',
    look: {
      shape: 'jay',
      size: 1.3,
      body: '#3e6e85',
      breast: '#e7e3d6',
      head: '#39667c',
      wing: '#32596d',
      beak: '#26282b',
      beakLen: 1.7,
      tailLen: 1.0,
      crest: true,
      wingbar: '#dfe5e8',
      epaulet: '#a8542f',
    },
    song: series(0, 14, 0.05, (i, t) => ({
      kind: 'click' as const,
      t,
      dur: 0.025,
      f0: 2800 + (i % 3) * 200,
      vol: 0.75,
    })),
    songEvery: [14, 32],
  },
  {
    id: 'downy',
    name: 'Downy Woodpecker',
    sci: 'Dryobates pubescens',
    fact: 'The smallest woodpecker in North America, light enough to forage on plant stalks and even goldenrod galls that bigger woodpeckers can\'t use. Its drumming isn\'t feeding — it\'s a song played on wood, each bird picking the most resonant branch it can find.',
    songHint: 'a descending whinny, plus drumming on wood',
    rarity: 1,
    habitats: ['forest', 'clearing'],
    time: 'day',
    feeders: ['suet'],
    nest: 'cavity',
    look: {
      shape: 'woodpecker',
      size: 0.95,
      body: '#26262a',
      breast: '#efe9da',
      head: '#26262a',
      wing: '#222226',
      beak: '#2c2c30',
      beakLen: 0.8,
      tailLen: 1.0,
      cap: '#d23a35',
      cheek: '#efe9da',
      wingbar: '#efe9da',
    },
    song: series(0, 12, 0.085, (i, t) =>
      tone(t, 0.06, 4000 - i * 120, 3800 - i * 120, { vol: 0.7 - i * 0.025 })
    ),
    songEvery: [10, 24],
  },
  {
    id: 'redtail',
    name: 'Red-tailed Hawk',
    sci: 'Buteo jamaicensis',
    fact: 'That epic raspy scream in every movie? It\'s almost always a Red-tailed Hawk, even when the bird on screen is an eagle. Pairs often hunt the same territory for years and can spot a mouse from a hundred feet up.',
    songHint: 'the movie raptor scream: “keeee-eeeer!”',
    rarity: 2,
    habitats: ['sky', 'meadow'],
    time: 'day',
    nest: 'platform',
    look: {
      shape: 'raptor',
      size: 2.2,
      body: '#7a5b40',
      breast: '#e3d3b8',
      head: '#6b4e36',
      wing: '#5f462f',
      beak: '#3a3530',
      beakLen: 0.9,
      tailLen: 1.1,
      tail: '#b5563a',
    },
    song: [
      tone(0, 1.5, 3300, 1700, { vol: 0.6, release: 0.4 }),
      noise(0, 1.5, 3100, 1700, { q: 2, vol: 0.65, release: 0.4 }),
    ],
    songEvery: [20, 50],
  },
  {
    id: 'barredowl',
    name: 'Barred Owl',
    sci: 'Strix varia',
    fact: 'Its call is famously transcribed “Who cooks for you? Who cooks for you-all?” — and pairs will duet back and forth until the woods echo. Barred Owls have dark soulful eyes, unusual among owls, and they hunt the same forests their whole lives.',
    songHint: '“Who cooks for you? Who cooks for you-all?”',
    rarity: 2,
    habitats: ['forest', 'pine'],
    time: 'night',
    nest: 'cavity',
    look: {
      shape: 'owl',
      size: 1.9,
      body: '#9a8d77',
      breast: '#d8cdb6',
      head: '#a3967f',
      wing: '#7d7160',
      beak: '#cbb24a',
      beakLen: 0.5,
      tailLen: 0.8,
      eyeLine: '#5b5142',
    },
    song: [
      tone(0, 0.18, 440, 420, { vol: 0.75, attack: 0.03 }),
      tone(0.26, 0.18, 440, 415, { vol: 0.75, attack: 0.03 }),
      tone(0.52, 0.2, 470, 430, { vol: 0.8, attack: 0.03 }),
      tone(0.86, 0.3, 430, 380, { vol: 0.8, attack: 0.03, release: 0.15 }),
      tone(1.75, 0.18, 440, 420, { vol: 0.75, attack: 0.03 }),
      tone(2.01, 0.18, 440, 415, { vol: 0.75, attack: 0.03 }),
      tone(2.27, 0.2, 470, 430, { vol: 0.8, attack: 0.03 }),
      tone(2.61, 0.5, 420, 340, { vol: 0.85, attack: 0.03, release: 0.3, vibrato: { rate: 9, depth: 14 } }),
    ],
    songEvery: [18, 45],
  },
  {
    id: 'hummingbird',
    name: 'Ruby-throated Hummingbird',
    sci: 'Archilochus colubris',
    fact: 'It weighs less than a nickel, beats its wings 53 times a second, and twice a year crosses the Gulf of Mexico nonstop — 18 hours over open water on fat reserves smaller than a raisin. The ruby throat only flashes red when the light hits it just right.',
    songHint: 'squeaky chittering and a soft wing hum',
    rarity: 2,
    habitats: ['meadow', 'clearing'],
    time: 'day',
    feeders: ['nectar', 'wildflowers'],
    nest: 'tree',
    look: {
      shape: 'hummingbird',
      size: 0.5,
      body: '#3f7a4a',
      breast: '#e9e5d6',
      head: '#39704a',
      wing: '#55565c',
      beak: '#2a2a2e',
      beakLen: 2.2,
      tailLen: 0.7,
      throat: '#d8203f',
    },
    song: series(0, 6, 0.07, (i, t) =>
      tone(t, 0.035, 6200 - (i % 2) * 900, 5400, { vol: 0.5 })
    ),
    songEvery: [9, 20],
  },
  {
    id: 'bluebird',
    name: 'Eastern Bluebird',
    sci: 'Sialia sialis',
    fact: 'Bluebirds nearly vanished in the 1900s when starlings took their nest holes — the continent-wide network of backyard nest boxes is one of conservation\'s great comeback stories. There is no blue pigment in their feathers; the color is pure light-scattering structure.',
    songHint: 'a soft, liquid “tu-a-wee” warble',
    rarity: 2,
    habitats: ['meadow', 'clearing'],
    time: 'day',
    feeders: ['bath', 'berry', 'nestbox'],
    nest: 'box',
    look: {
      shape: 'songbird',
      size: 1.0,
      body: '#3a6cc0',
      breast: '#c06a35',
      head: '#3a6cc0',
      wing: '#2f5aa6',
      beak: '#2e2e32',
      beakLen: 0.65,
      tailLen: 1.0,
    },
    song: [
      tone(0, 0.14, 2200, 1800, { vol: 0.55, vibrato: { rate: 18, depth: 50 } }),
      tone(0.2, 0.18, 1650, 2050, { vol: 0.55, vibrato: { rate: 18, depth: 50 } }),
      tone(0.46, 0.24, 1950, 1500, { vol: 0.5, vibrato: { rate: 18, depth: 50 } }),
    ],
    songEvery: [9, 20],
  },
  {
    id: 'titmouse',
    name: 'Tufted Titmouse',
    sci: 'Baeolophus bicolor',
    fact: 'Titmice line their nests with animal hair and have been seen plucking it straight from live raccoons, dogs, and the occasional napping human. They take one seed at a time from a feeder, fly off, hammer it open, and come right back.',
    songHint: 'a ringing “peter-peter-peter!”',
    rarity: 1,
    habitats: ['forest', 'clearing'],
    time: 'day',
    feeders: ['feeder', 'suet'],
    nest: 'cavity',
    look: {
      shape: 'songbird',
      size: 0.95,
      body: '#98a0a6',
      breast: '#e9e2d2',
      head: '#98a0a6',
      wing: '#848d94',
      beak: '#2c2c30',
      beakLen: 0.55,
      tailLen: 1.1,
      crest: true,
      mask: '#26262a',
    },
    song: series(0, 3, 0.42, (i, t) => [
      tone(t, 0.13, 2900, 2750, { vol: 0.8 }),
      tone(t + 0.16, 0.13, 2250, 2150, { vol: 0.8 }),
    ]),
    songEvery: [8, 18],
  },
  {
    id: 'nuthatch',
    name: 'White-breasted Nuthatch',
    sci: 'Sitta carolinensis',
    fact: 'The only bird that routinely walks headfirst *down* tree trunks — the upside-down view reveals insects that right-side-up woodpeckers miss. Its name comes from “nut-hack”: wedging a seed in bark and hammering it open.',
    songHint: 'a nasal “yank-yank” like a tiny tin horn',
    rarity: 1,
    habitats: ['forest', 'pine'],
    time: 'day',
    feeders: ['feeder', 'suet'],
    nest: 'cavity',
    look: {
      shape: 'woodpecker',
      size: 0.85,
      body: '#7d8b99',
      breast: '#efe9da',
      head: '#7d8b99',
      wing: '#6a7886',
      beak: '#33343a',
      beakLen: 0.95,
      tailLen: 0.7,
      cap: '#1f1f24',
      cheek: '#efe9da',
    },
    song: series(0, 2, 0.38, (i, t) => [
      tone(t, 0.2, 1320, 1180, { type: 'square', vol: 0.32, trem: { rate: 30, depth: 0.5 } }),
      noise(t, 0.2, 1300, 1150, { q: 4, vol: 0.4 }),
    ]),
    songEvery: [9, 20],
  },
  {
    id: 'oriole',
    name: 'Baltimore Oriole',
    sci: 'Icterus galbula',
    fact: 'Orioles weave hanging pouch nests so sturdy they survive winter gales long after the family has flown to Central America. They have a famous sweet tooth — orange halves and a spoonful of grape jelly will summon them like magic.',
    songHint: 'rich, flutey whistled phrases',
    rarity: 2,
    habitats: ['forest', 'clearing'],
    time: 'day',
    feeders: ['orange'],
    nest: 'tree',
    look: {
      shape: 'songbird',
      size: 1.1,
      body: '#e8821e',
      breast: '#f29a2e',
      head: '#1d1d22',
      wing: '#26262c',
      beak: '#54565e',
      beakLen: 0.9,
      tailLen: 1.2,
      wingbar: '#f0ead8',
    },
    song: [
      tone(0, 0.22, 1800, 1850, { type: 'triangle', vol: 0.65 }),
      tone(0.34, 0.26, 2250, 2200, { type: 'triangle', vol: 0.7 }),
      tone(0.72, 0.22, 1500, 1550, { type: 'triangle', vol: 0.65 }),
      tone(1.06, 0.38, 2050, 1600, { type: 'triangle', vol: 0.7 }),
    ],
    songEvery: [10, 24],
  },
  {
    id: 'waxwing',
    name: 'Cedar Waxwing',
    sci: 'Bombycilla cedrorum',
    fact: 'Waxwings are so devoted to berries that flocks have been seen passing a single berry down a whole row of birds, beak to beak, until someone finally eats it. The red “wax” wingtips are pigment from their fruit diet, hardened into droplets.',
    songHint: 'an impossibly thin, high “sreeee”',
    rarity: 2,
    habitats: ['forest', 'clearing'],
    time: 'day',
    feeders: ['berry', 'bath'],
    nest: 'tree',
    look: {
      shape: 'songbird',
      size: 1.05,
      body: '#b09a72',
      breast: '#c9b384',
      head: '#b8a276',
      wing: '#8d7e63',
      beak: '#2a2a2e',
      beakLen: 0.6,
      tailLen: 1.0,
      crest: true,
      mask: '#222226',
      tail: '#e8c52e',
    },
    song: [
      tone(0, 0.45, 6900, 7300, { vol: 0.35 }),
      tone(0.7, 0.45, 7000, 7350, { vol: 0.32 }),
    ],
    songEvery: [10, 22],
  },
  {
    id: 'bunting',
    name: 'Indigo Bunting',
    sci: 'Passerina cyanea',
    fact: 'Young buntings learn the night sky and migrate by the stars, orienting on the rotation around Polaris — planetarium experiments proved it. Males sing all through hot summer afternoons when everyone else has gone quiet.',
    songHint: 'paired phrases: “sweet-sweet, chew-chew, sweet-sweet”',
    rarity: 3,
    habitats: ['meadow'],
    time: 'day',
    feeders: ['wildflowers', 'thistle'],
    nest: 'tree',
    look: {
      shape: 'songbird',
      size: 0.85,
      body: '#2d4fd6',
      breast: '#3a63e0',
      head: '#2440c4',
      wing: '#1e34a0',
      beak: '#5a5c64',
      beakLen: 0.6,
      tailLen: 0.95,
    },
    song: [
      tone(0, 0.11, 3200, 3650, { vol: 0.7 }),
      tone(0.18, 0.11, 3200, 3650, { vol: 0.7 }),
      tone(0.48, 0.11, 2650, 2200, { vol: 0.7 }),
      tone(0.66, 0.11, 2650, 2200, { vol: 0.7 }),
      tone(0.98, 0.11, 3450, 3850, { vol: 0.68 }),
      tone(1.16, 0.11, 3450, 3850, { vol: 0.68 }),
    ],
    songEvery: [8, 18],
  },
  {
    id: 'tanager',
    name: 'Scarlet Tanager',
    sci: 'Piranga olivacea',
    fact: 'A bird of pure flame that somehow disappears completely in the green canopy — many birders go years without seeing one that is singing right over their heads. Listen for what sounds like a robin with a sore throat.',
    songHint: 'a hoarse, burry robin-song from the canopy',
    rarity: 3,
    habitats: ['forest'],
    time: 'day',
    nest: 'tree',
    look: {
      shape: 'songbird',
      size: 1.05,
      body: '#e02828',
      breast: '#ea3a32',
      head: '#e02828',
      wing: '#1d1d22',
      beak: '#8a8576',
      beakLen: 0.75,
      tailLen: 1.05,
      tail: '#1d1d22',
    },
    song: [
      tone(0, 0.18, 2100, 2500, { vol: 0.6, trem: { rate: 55, depth: 0.55 } }),
      tone(0.28, 0.18, 2700, 2250, { vol: 0.6, trem: { rate: 55, depth: 0.55 } }),
      tone(0.58, 0.18, 2050, 2550, { vol: 0.6, trem: { rate: 55, depth: 0.55 } }),
      tone(0.88, 0.22, 2600, 2150, { vol: 0.6, trem: { rate: 55, depth: 0.55 } }),
    ],
    songEvery: [9, 20],
  },
  {
    id: 'loon',
    name: 'Common Loon',
    sci: 'Gavia immer',
    fact: 'The wail of a loon across still water at dusk may be the wildest sound left on Earth. Loons are built for water, not land — their legs sit so far back they can barely walk, but they can dive 200 feet and stay down for five minutes.',
    songHint: 'a long, haunting wail across the lake',
    rarity: 3,
    habitats: ['water'],
    time: 'dawnDusk',
    nest: 'marsh',
    look: {
      shape: 'loon',
      size: 1.9,
      body: '#23262b',
      breast: '#e9e5d8',
      head: '#1a1d22',
      wing: '#2b2f36',
      beak: '#2c2f35',
      beakLen: 1.4,
      tailLen: 0.5,
      wingbar: '#e9e5d8',
      throat: '#3a5f4a',
    },
    song: [
      tone(0, 1.0, 580, 880, { vol: 0.7, attack: 0.25, vibrato: { rate: 6, depth: 12 } }),
      tone(1.0, 1.2, 880, 600, { vol: 0.7, release: 0.5, vibrato: { rate: 6, depth: 12 } }),
    ],
    songEvery: [25, 60],
  },
  {
    id: 'pileated',
    name: 'Pileated Woodpecker',
    sci: 'Dryocopus pileatus',
    fact: 'Crow-sized, with a flaming crest — the real-life model for Woody Woodpecker. Its rectangular excavations are so large they become homes for owls, ducks, and martens; a pileated in your woods is an entire housing program.',
    songHint: 'a wild, ringing “kuk-kuk-kuk-kuk!” laugh',
    rarity: 3,
    habitats: ['forest', 'pine'],
    time: 'day',
    feeders: ['suet'],
    nest: 'cavity',
    look: {
      shape: 'woodpecker',
      size: 1.9,
      body: '#222226',
      breast: '#2a2a30',
      head: '#26262a',
      wing: '#1d1d22',
      beak: '#5e5a50',
      beakLen: 1.2,
      tailLen: 1.15,
      crest: true,
      cap: '#dd2c2c',
      cheek: '#efe9da',
      eyeLine: '#efe9da',
    },
    song: series(0, 10, 0.115, (i, t) =>
      tone(t, 0.07, 1150 + Math.sin(i * 1.1) * 120, 1000 + Math.sin(i * 1.1) * 120, {
        vol: 0.85,
      })
    ),
    songEvery: [16, 40],
  },
];

export const BIRD_BY_ID: Record<string, BirdSpecies> = Object.fromEntries(
  BIRDS.map((b) => [b.id, b])
);

// ---- fish -------------------------------------------------------------------

export type FishWater = 'lake' | 'river' | 'deep';

export interface FishLook {
  body: string;
  belly: string;
  fins: string;
  pattern: 'bars' | 'stripes' | 'spots' | 'speckles' | 'none';
  patternColor: string;
  form: 'panfish' | 'bass' | 'trout' | 'cat' | 'pike';
}

export interface FishSpecies {
  id: string;
  name: string;
  sci: string;
  fact: string;
  rarity: 1 | 2 | 3;
  water: FishWater[];
  time: ActiveTime;
  minLen: number; // inches
  maxLen: number;
  fight: number; // 1 easy .. 4 hard
  look: FishLook;
}

export const FISH: FishSpecies[] = [
  {
    id: 'bluegill',
    name: 'Bluegill',
    sci: 'Lepomis macrochirus',
    fact: 'The first fish for half the anglers in America. Males fan out saucer-shaped nests in the shallows and guard them ferociously — they\'ll bump a finger that gets too close.',
    rarity: 1,
    water: ['lake'],
    time: 'day',
    minLen: 5,
    maxLen: 10,
    fight: 1,
    look: { body: '#5b7a52', belly: '#e0b23a', fins: '#46603f', pattern: 'bars', patternColor: '#3d5538', form: 'panfish' },
  },
  {
    id: 'pumpkinseed',
    name: 'Pumpkinseed',
    sci: 'Lepomis gibbosus',
    fact: 'A living jewel — turquoise lines over orange flecks, with a red spot on the ear flap. Kids who catch one usually refuse to believe it isn\'t tropical.',
    rarity: 1,
    water: ['lake'],
    time: 'day',
    minLen: 4,
    maxLen: 9,
    fight: 1,
    look: { body: '#7a8a3e', belly: '#e8923a', fins: '#5e6e34', pattern: 'speckles', patternColor: '#3fb5b0', form: 'panfish' },
  },
  {
    id: 'perch',
    name: 'Yellow Perch',
    sci: 'Perca flavescens',
    fact: 'Travels in roaming schools, so where you catch one, ten more are waiting. The bold tiger bars camouflage it among weed stalks.',
    rarity: 1,
    water: ['lake', 'deep'],
    time: 'all',
    minLen: 6,
    maxLen: 13,
    fight: 1,
    look: { body: '#c9a83a', belly: '#e8dba8', fins: '#d96f2e', pattern: 'bars', patternColor: '#4a5232', form: 'panfish' },
  },
  {
    id: 'bass',
    name: 'Largemouth Bass',
    sci: 'Micropterus salmoides',
    fact: 'An ambush predator that hits like a dropped brick and then jumps clear of the water shaking its head. Big bass are almost all female, and the biggest ones are the wariest.',
    rarity: 2,
    water: ['lake'],
    time: 'dawnDusk',
    minLen: 11,
    maxLen: 23,
    fight: 3,
    look: { body: '#4e6e44', belly: '#dfe3cf', fins: '#41593a', pattern: 'stripes', patternColor: '#2c3d27', form: 'bass' },
  },
  {
    id: 'rainbow',
    name: 'Rainbow Trout',
    sci: 'Oncorhynchus mykiss',
    fact: 'Lives in the cold, quick water of the river and fights like a fish twice its size, cartwheeling downstream. The pink lateral stripe glows brightest at spawning time.',
    rarity: 2,
    water: ['river'],
    time: 'all',
    minLen: 9,
    maxLen: 20,
    fight: 3,
    look: { body: '#7d96a8', belly: '#e8e6da', fins: '#6b8294', pattern: 'spots', patternColor: '#33383b', form: 'trout' },
  },
  {
    id: 'brookie',
    name: 'Brook Trout',
    sci: 'Salvelinus fontinalis',
    fact: 'Not really a trout but a char, and maybe the most beautiful freshwater fish alive: olive worm-tracks on the back, red spots haloed in blue. It only lives where the water is cold, clean, and wild.',
    rarity: 3,
    water: ['river'],
    time: 'dawnDusk',
    minLen: 7,
    maxLen: 16,
    fight: 2,
    look: { body: '#4a5e3f', belly: '#d97c34', fins: '#c4502c', pattern: 'speckles', patternColor: '#e0c25a', form: 'trout' },
  },
  {
    id: 'catfish',
    name: 'Channel Catfish',
    sci: 'Ictalurus punctatus',
    fact: 'Hunts after dark by taste — its whole body is covered in taste buds, a swimming tongue. When the sun goes down and the bobber slides under slow and heavy, it\'s usually one of these.',
    rarity: 2,
    water: ['lake', 'deep'],
    time: 'night',
    minLen: 12,
    maxLen: 28,
    fight: 3,
    look: { body: '#5a6470', belly: '#cfd2cd', fins: '#49525c', pattern: 'spots', patternColor: '#3a414a', form: 'cat' },
  },
  {
    id: 'pike',
    name: 'Northern Pike',
    sci: 'Esox lucius',
    fact: 'The wolf of the lake — a yard of muscle and teeth that lies motionless in the weeds, then strikes at thirty miles an hour. Old anglers say you don\'t catch a big pike; you negotiate with it.',
    rarity: 3,
    water: ['deep'],
    time: 'all',
    minLen: 18,
    maxLen: 40,
    fight: 4,
    look: { body: '#54683e', belly: '#d8d8bc', fins: '#7a4a2e', pattern: 'speckles', patternColor: '#cfd8a0', form: 'pike' },
  },
];

export const FISH_BY_ID: Record<string, FishSpecies> = Object.fromEntries(
  FISH.map((f) => [f.id, f])
);

// ---- buildable structures ----------------------------------------------------

export interface StructureType {
  id: string;
  name: string;
  cost: number;
  desc: string;
  attracts: string[]; // bird ids (derived below for most)
  icon: string; // emoji for the build menu
}

export const STRUCTURES: StructureType[] = [
  { id: 'feeder', name: 'Sunflower Feeder', cost: 20, desc: 'A platform of black-oil sunflower. The classic crowd-pleaser.', attracts: [], icon: '🌻' },
  { id: 'thistle', name: 'Thistle Sock', cost: 15, desc: 'Fine nyjer seed in a mesh sock. Finches adore it.', attracts: [], icon: '🧦' },
  { id: 'suet', name: 'Suet Cage', cost: 20, desc: 'High-energy fat cake. Brings the woodpecker crowd.', attracts: [], icon: '🧈' },
  { id: 'nectar', name: 'Nectar Feeder', cost: 25, desc: 'Ruby-red glass and sugar water for hummingbirds.', attracts: [], icon: '🌺' },
  { id: 'orange', name: 'Orange Halves', cost: 20, desc: 'Fresh oranges on a spike. Oriole magic.', attracts: [], icon: '🍊' },
  { id: 'bath', name: 'Bird Bath', cost: 30, desc: 'Moving water draws birds that never visit feeders.', attracts: [], icon: '⛲' },
  { id: 'berry', name: 'Berry Bush', cost: 35, desc: 'A serviceberry that fruits generously.', attracts: [], icon: '🫐' },
  { id: 'wildflowers', name: 'Wildflower Patch', cost: 25, desc: 'Native blooms — nectar, seeds, and color.', attracts: [], icon: '🌼' },
  { id: 'nestbox', name: 'Nest Box', cost: 40, desc: 'A hand-built box with a 1½" hole. Someone will move in.', attracts: [], icon: '🏠' },
];

// derive attracts lists from bird data
for (const s of STRUCTURES) {
  s.attracts = BIRDS.filter((b) => b.feeders?.includes(s.id)).map((b) => b.id);
}

export const STRUCTURE_BY_ID: Record<string, StructureType> = Object.fromEntries(
  STRUCTURES.map((s) => [s.id, s])
);

// ---- rewards -----------------------------------------------------------------

export const SEEDS = {
  newSpeciesSeen: 12,
  newSpeciesHeard: 10,
  repeatSighting: 2,
  quizCorrect: 8,
  nestFound: 15,
  nestFledged: 25,
  fishByRarity: { 1: 5, 2: 12, 3: 25 } as Record<number, number>,
  starting: 30,
};
