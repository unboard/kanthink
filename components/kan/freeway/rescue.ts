import { hash } from '@/lib/kan/city/layout';
import type { FreewayDay } from '@/lib/kanwatch/freeway';

/**
 * The cat rescue on the Freeway. Strays wait beside some of the days; catch one,
 * walk it to the rescue at the end of the road, and a little while later it finds
 * a home, and Kan has the good news waiting the next time you visit. A while after
 * that, a postcard from the new home. Kept on this device, like the other games.
 */

export type CatKind = 'cat' | 'kitten';
export interface Stray { id: string; name: string; kind: CatKind; color: string; seed: number; date: string }
export interface RescuedCat extends Stray {
  /** When you brought it in, when it goes home, and when the postcard comes (ms). */
  at: number;
  homeAt: number;
  postcardAt: number;
  /** Whether you've heard each piece of news yet. */
  heardHome: boolean;
  heardPostcard: boolean;
}

const KEY = 'kanwatch-freeway-rescue';

const NAMES = ['Pip', 'Mittens', 'Waffles', 'Pumpkin', 'Socks', 'Clementine', 'Marshmallow', 'Ziggy', 'Pebble', 'Noodle', 'Biscuit', 'Juniper', 'Toast', 'Maple', 'Sprinkles', 'Ollie', 'Hazel', 'Peanut', 'Luna', 'Domino', 'Butterscotch', 'Cricket', 'Tater Tot', 'Mango', 'Fig', 'Pepper', 'Cinnamon', 'Button', 'Smudge', 'Pickles', 'Comet', 'Honey', 'Sardine', 'Jellybean', 'Nugget', 'Moose', 'Daisy', 'Snickers', 'Winnie', 'Gizmo'];
const FUR = ['#f2a65a', '#3a3a3a', '#e8e1d6', '#9a9aa2', '#c8783c', '#f5d6a8', '#f5f0e6', '#7a5236'];

/** Every third day or so has a stray waiting by it; the same ones every time. */
export function straysFor(days: FreewayDay[], rescued: RescuedCat[]): Stray[] {
  const taken = new Set(rescued.map((c) => c.id));
  const out: Stray[] = [];
  days.forEach((d, i) => {
    const seed = hash(`stray:${d.date}`) >>> 0;
    if (seed % 3 !== 0 && i !== days.length - 2) return;
    const id = `stray:${d.date}`;
    if (taken.has(id)) return;
    out.push({ id, date: d.date, seed, name: NAMES[(seed >>> 3) % NAMES.length], kind: (seed >>> 7) % 3 === 0 ? 'kitten' : 'cat', color: FUR[(seed >>> 11) % FUR.length] });
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

/** Checked in now; home within the hour or so (kids are waiting), a postcard later that day or the next. */
export function checkIn(s: Stray, now = Date.now()): RescuedCat {
  const homeAt = now + (20 + (s.seed % 70)) * 60_000;
  return { ...s, at: now, homeAt, postcardAt: homeAt + (6 + (s.seed % 12)) * 3_600_000, heardHome: false, heardPostcard: false };
}

export const isHome = (c: RescuedCat, now = Date.now()) => now >= c.homeAt;

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
  for (const c of [...cats].sort((a, b) => a.homeAt - b.homeAt)) {
    if (now >= c.homeAt && !c.heardHome) out.push({ cat: c, kind: 'home', text: homeStory(c) });
    if (now >= c.postcardAt && !c.heardPostcard) out.push({ cat: c, kind: 'postcard', text: postcard(c) });
  }
  return out;
}
