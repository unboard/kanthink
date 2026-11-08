import { hash } from '@/lib/kan/city/layout';
import type { FreewayDay } from '@/lib/kanwatch/freeway';
import type { PetMarks } from '../city/pets';

/**
 * The cat rescue on the Freeway. Strays wait beside some of the days; catch one,
 * walk it to the rescue at the end of the road, and a little while later it finds
 * a home, and Kan has the good news waiting the next time you visit. A while after
 * that, a postcard from the new home. Kept on this device, like the other games.
 *
 * Every stray has its own energy, which is how it gets caught: sleepy ones let you
 * scoop them up, curious ones come over, shy ones run if you rush them, and zoomy
 * ones only hold still for a treat. Some hide behind the buildings or out in the
 * trees, and you hear them before you see them. At the rescue some need a bath or
 * the vet before they can go home.
 */

export type CatKind = 'cat' | 'kitten';
export type Energy = 'sleepy' | 'curious' | 'shy' | 'zoomy';
export type VetNeed = 'sniffles' | 'paw' | 'checkup';
export interface Stray { id: string; name: string; kind: CatKind; color: string; seed: number; date: string; energy: Energy; hidden: boolean; marks: PetMarks; coat?: string }
export interface RescuedCat extends Stray {
  /** What it needs before it can go home, and what's been done. */
  needs?: { bath?: boolean; vet?: VetNeed };
  done?: { bath?: boolean; vet?: boolean };
  /** When you brought it in, when it goes home, and when the postcard comes (ms); 0 until it's been cared for. */
  at: number;
  homeAt: number;
  postcardAt: number;
  /** Whether you've heard each piece of news yet. */
  heardHome: boolean;
  heardPostcard: boolean;
}

const KEY = 'kanwatch-freeway-rescue';

const NAMES = ['Pip', 'Mittens', 'Waffles', 'Pumpkin', 'Socks', 'Clementine', 'Marshmallow', 'Ziggy', 'Pebble', 'Noodle', 'Biscuit', 'Juniper', 'Toast', 'Maple', 'Sprinkles', 'Ollie', 'Hazel', 'Peanut', 'Luna', 'Domino', 'Butterscotch', 'Cricket', 'Tater Tot', 'Mango', 'Fig', 'Pepper', 'Cinnamon', 'Button', 'Smudge', 'Pickles', 'Comet', 'Honey', 'Sardine', 'Jellybean', 'Nugget', 'Moose', 'Daisy', 'Snickers', 'Winnie', 'Gizmo',
  'Acorn', 'Bubbles', 'Cupcake', 'Dumpling', 'Ember', 'Fuzzball', 'Gumdrop', 'Hiccup', 'Inky', 'Jasper', 'Kiwi', 'Lollipop', 'Meatball', 'Nutmeg', 'Oreo', 'Pudding', 'Quilt', 'Rascal', 'Snowball', 'Twinkle', 'Velvet', 'Wiggles', 'Yam', 'Zuzu', 'Bean', 'Cloud', 'Dusty', 'Fudge', 'Ginger', 'Muffin', 'Pancake', 'Raisin', 'Shortcake', 'Sushi', 'Tinsel', 'Truffle', 'Whiskers', 'Bramble', 'Puddle', 'Starla'];
const ENERGIES: Energy[] = ['sleepy', 'curious', 'shy', 'zoomy'];
export const ENERGY_WORD: Record<Energy, string> = { sleepy: 'Sleepy', curious: 'Curious', shy: 'Shy', zoomy: 'Zoomy' };
export const VET_WORD: Record<VetNeed, string> = { sniffles: 'has the sniffles', paw: 'has a sore paw', checkup: 'needs a checkup' };

const GOLD = '#d9a520', GREEN = '#4f9a3c', BLUE = '#4f8fd8', COPPER = '#c4702a', HAZEL = '#9a8a3a';
/** Every coat a stray can turn up in: its fur, its markings and the eyes that usually go with it. */
const COATS: { name: string; color: string; marks: PetMarks; eyes: string[] }[] = [
  { name: 'orange tabby', color: '#e58a3a', marks: { tabby: true }, eyes: [GOLD, GREEN] },
  { name: 'gray tabby', color: '#9a9aa2', marks: { tabby: true }, eyes: [GREEN, GOLD] },
  { name: 'brown tabby', color: '#8a6a4a', marks: { tabby: true }, eyes: [GREEN, HAZEL] },
  { name: 'silver tabby', color: '#c9cdd4', marks: { tabby: true, chest: true }, eyes: [GREEN] },
  { name: 'black', color: '#1f1f24', marks: {}, eyes: [GOLD, COPPER] },
  { name: 'snow white', color: '#fbf7f0', marks: {}, eyes: [BLUE, GOLD, 'odd'] },
  { name: 'tuxedo', color: '#1f1f24', marks: { chest: true, socks: true }, eyes: [GOLD, GREEN] },
  { name: 'calico', color: '#f5f0e6', marks: { patch: '#e58a3a', patch2: '#2a2a2e' }, eyes: [GOLD, GREEN, COPPER] },
  { name: 'tortie', color: '#3a2a24', marks: { patch: '#c8783c', patch2: '#7a4a2a' }, eyes: [GOLD, COPPER] },
  { name: 'Siamese', color: '#f1e4cc', marks: { points: '#5a4334' }, eyes: [BLUE] },
  { name: 'snowshoe', color: '#efe2c8', marks: { points: '#6a5444', socks: true }, eyes: [BLUE] },
  { name: 'Russian blue', color: '#7d8796', marks: {}, eyes: [GREEN] },
  { name: 'cream', color: '#f3dbb0', marks: {}, eyes: [GOLD, COPPER] },
  { name: 'orange and white', color: '#e58a3a', marks: { chest: true, socks: true }, eyes: [GOLD] },
  { name: 'cow-spotted', color: '#fbf7f0', marks: { patch: '#1f1f24' }, eyes: [GREEN, GOLD] },
  { name: 'gray and white', color: '#8e939c', marks: { chest: true, socks: true }, eyes: [GOLD, GREEN] },
  { name: 'chocolate', color: '#5a3a2a', marks: {}, eyes: [GOLD, COPPER] },
  { name: 'smoky', color: '#4a4c55', marks: { chest: true }, eyes: [COPPER, GOLD] },
  { name: 'flame point', color: '#f6e9d4', marks: { points: '#e58a3a' }, eyes: [BLUE] },
  { name: 'lilac', color: '#c8b8c8', marks: {}, eyes: [GREEN, GOLD] },
];

/** Its coat, and the shape of it: some are fluffy, some round, some have folded ears or a bobtail. */
function coatFor(seed: number, kind: CatKind) {
  const c = COATS[(seed >>> 17) % COATS.length];
  const fluffy = (seed >>> 22) % 4 === 0, fold = (seed >>> 24) % 9 === 0, bob = (seed >>> 26) % 10 === 0, chonk = (seed >>> 27) % 6 === 0;
  let eyes = c.eyes[(seed >>> 20) % c.eyes.length], eye2: string | undefined;
  if (eyes === 'odd') { eyes = BLUE; eye2 = GOLD; }
  const marks: PetMarks = { ...c.marks, eyes, ...(eye2 ? { eye2 } : {}), ...(fluffy ? { fluffy } : {}), ...(fold ? { fold } : {}), ...(bob ? { bob } : {}), ...(chonk ? { chonk } : {}) };
  // "a chubby, fluffy calico kitten with folded ears"
  const looks = [chonk && 'chubby', fluffy && 'fluffy'].filter(Boolean).join(', ');
  const extras = [fold && 'folded ears', bob && 'a bobtail', eye2 && 'one blue eye and one gold'].filter(Boolean) as string[];
  const coat = `${looks ? `${looks} ` : ''}${c.name} ${kind}${extras.length ? ` with ${extras.length > 1 ? `${extras.slice(0, -1).join(', ')} and ${extras.at(-1)}` : extras[0]}` : ''}`;
  return { color: c.color, marks, coat };
}

/** A new stray turns up at a spot a few hours after the last one there was brought in. */
export const REFILL_MS = 3 * 3_600_000;

/** Most days have a stray waiting by them, and some have two; when one's rescued, another turns up later. */
export function straysFor(days: FreewayDay[], rescued: RescuedCat[], now = Date.now()): Stray[] {
  const byId = new Map(rescued.map((c) => [c.id, c]));
  const out: Stray[] = [];
  days.forEach((d, i) => {
    const seed0 = hash(`stray:${d.date}`) >>> 0;
    // The one by yesterday is always an easy one, so there's a first catch close by.
    const easy = i === days.length - 2;
    const spots = [`stray:${d.date}`, `stray:${d.date}:2`].filter((_, k) => (k === 0 ? seed0 % 3 !== 2 || easy : (seed0 >>> 2) % 3 === 0));
    for (const base of spots) {
      // Which stray is at this spot now: the first, or whoever came after the last was rescued.
      let gen = 0, last: RescuedCat | undefined;
      for (let id = base; byId.has(id); id = `${base}#${++gen}`) last = byId.get(id);
      if (last && now - last.at < REFILL_MS) continue;
      const id = gen ? `${base}#${gen}` : base;
      const seed = gen || base !== `stray:${d.date}` ? hash(id) >>> 0 : seed0;
      const first = easy && gen === 0 && base === `stray:${d.date}`;
      const kind: CatKind = (seed >>> 7) % 3 === 0 ? 'kitten' : 'cat';
      const { color, marks, coat } = coatFor(seed, kind);
      out.push({
        id, date: d.date, seed, name: NAMES[(seed >>> 3) % NAMES.length], kind, color, coat,
        energy: first ? 'curious' : ENERGIES[(seed >>> 9) % 4], hidden: !first && (seed >>> 13) % 3 === 0, marks,
      });
    }
  });
  return out;
}

export function loadRescue(): RescuedCat[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((c) => c && typeof c.id === 'string') : [];
  } catch { return []; }
}
export function saveRescue(cats: RescuedCat[]) {
  try { localStorage.setItem(KEY, JSON.stringify(cats)); } catch { /* private window: it just won't keep */ }
}

/** Checked in now. Muddy ones need a bath, and some need the vet, before they can go home. */
export function checkIn(s: Stray, now = Date.now()): RescuedCat {
  const vet = ([null, 'sniffles', null, 'paw', 'checkup'] as const)[(s.seed >>> 15) % 5];
  const needs = { bath: (s.seed >>> 14) % 2 === 0, ...(vet ? { vet } : {}) };
  return schedule({ ...s, needs, done: {}, at: now, homeAt: 0, postcardAt: 0, heardHome: false, heardPostcard: false }, now);
}

/** What it still needs. */
export function stillNeeds(c: RescuedCat) {
  return { bath: Boolean(c.needs?.bath && !c.done?.bath), vet: c.needs?.vet && !c.done?.vet ? c.needs.vet : null };
}

/** Cared for: home within the hour or so (kids are waiting), a postcard later that day or the next. */
function schedule(c: RescuedCat, now: number): RescuedCat {
  const n = stillNeeds(c);
  if (n.bath || n.vet || c.homeAt) return c;
  const homeAt = now + (20 + (c.seed % 70)) * 60_000;
  return { ...c, homeAt, postcardAt: homeAt + (6 + (c.seed % 12)) * 3_600_000 };
}

export function careFor(c: RescuedCat, what: 'bath' | 'vet', now = Date.now()): RescuedCat {
  return schedule({ ...c, done: { ...c.done, [what]: true } }, now);
}

export const isHome = (c: RescuedCat, now = Date.now()) => c.homeAt > 0 && now >= c.homeAt;

const TREATS_KEY = 'kanwatch-freeway-treats';
export const TREATS_FULL = 5;
export function loadTreats() {
  try { const n = Number(localStorage.getItem(TREATS_KEY)); return Number.isFinite(n) && localStorage.getItem(TREATS_KEY) !== null ? n : TREATS_FULL; } catch { return TREATS_FULL; }
}
export function saveTreats(n: number) {
  try { localStorage.setItem(TREATS_KEY, String(n)); } catch { /* fine */ }
}

const FAMILIES = [
  'a family with two kids who read bedtime stories out loud',
  'a grandma with a big sunny garden',
  'a firefighter who naps on the couch after every shift',
  'a family with a very gentle old dog',
  'a music teacher with a piano that is perfect for sleeping on',
  'a family who lives in a little house by a lake',
  'two sisters who built a cardboard castle just for them',
  'a baker who comes home smelling like cookies',
  'a family with a giant window seat',
  'a farmer with a cozy red barn',
  'a librarian with a whole room of books',
  'a family who has always wanted a cat',
];
const FIRST_NIGHT = [
  'already picked a favorite window',
  'slept at the foot of the bed the whole first night',
  'found the warmest spot in the house in about five minutes',
  'purred so loud everyone laughed',
  'got a brand new collar with a bell',
  'has a bowl with their name painted on it',
  'explored every single room, twice',
  'curled up in a laundry basket of warm towels',
];
const POSTCARDS = [
  'learned to open the cabinet with the treats. Uh oh!',
  'has a best friend now: the neighbor’s cat across the fence',
  'sits by the door every afternoon to wait for the kids to come home from school',
  'caught a sock and is very proud of it',
  'got so fluffy and happy',
  'helps with homework by sitting right on it',
  'loves the new cat tree more than anything',
  'gives headbutts to say good morning',
];

export function homeStory(c: RescuedCat) {
  const family = FAMILIES[c.seed % FAMILIES.length];
  const night = FIRST_NIGHT[(c.seed >>> 5) % FIRST_NIGHT.length];
  return `${c.name} went home with ${family}. On the first day, ${c.name} ${night}.`;
}
export function postcard(c: RescuedCat) {
  return `A postcard from ${c.name}’s new home: ${c.name} ${POSTCARDS[(c.seed >>> 9) % POSTCARDS.length]}`;
}

/** What's happened since you last heard, oldest first. */
export function newsFor(cats: RescuedCat[], now = Date.now()) {
  const out: { cat: RescuedCat; kind: 'home' | 'postcard'; text: string }[] = [];
  for (const c of [...cats].filter((x) => x.homeAt > 0).sort((a, b) => a.homeAt - b.homeAt)) {
    if (c.homeAt > 0 && now >= c.homeAt && !c.heardHome) out.push({ cat: c, kind: 'home', text: homeStory(c) });
    if (c.postcardAt > 0 && now >= c.postcardAt && !c.heardPostcard) out.push({ cat: c, kind: 'postcard', text: postcard(c) });
  }
  return out;
}
