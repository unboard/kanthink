import { EXHIBITS, HABITATS, habitat } from './map';
import { SPECIES, awake, species } from './species';

/**
 * The zoo as a game: the girls own it and look after it. Visitors pay to come in,
 * the money buys food and new things for the animals, and things happen, good and
 * dramatic: babies, escapes, sick animals, storms, a field trip of sixty kids.
 *
 * Time is the zoo's own. While you're watching, a zoo minute goes by every real
 * second, and you can speed it up as far as you like. While you're away, it keeps
 * going slowly (a zoo hour every real hour, at most two zoo days), so there's always
 * something to hear about when you come back. Kept on this device, like the other
 * games.
 *
 * Everything here is pure and takes its randomness as an argument, so the tests can
 * play whole weeks in a blink.
 */

export const DAY = 24 * 60;
export const OPEN = 9 * 60;
export const CLOSE = 17 * 60;
/** Zoo After Dark: the lantern nights, once you've bought them. */
export const NIGHT_OPEN = 19 * 60;
export const NIGHT_CLOSE = 22 * 60;

export type Weather = 'sunny' | 'cloudy' | 'rain' | 'storm' | 'fog' | 'snow';
export type Ailment = 'tummy' | 'tooth' | 'cold' | 'splinter' | 'itchy';

export interface Animal {
  id: string;
  species: string;
  name: string;
  habitat: string;
  /** 0–100: fed, played with, healthy. */
  mood: number;
  /** 0–100: how hungry. */
  hunger: number;
  sick?: Ailment;
  /** Out of its habitat, somewhere in the zoo: where it's hiding, in map pixels. */
  loose?: [number, number];
  /** Born here, and when (zoo minutes); babies stay babies for three zoo days. */
  born?: number;
  /** A brand-new baby still waiting for a name from you. */
  needsName?: boolean;
}

export type EventKind = 'baby' | 'escape' | 'sick' | 'storm' | 'fieldtrip' | 'funny' | 'report' | 'bills' | 'fixed' | 'fence' | 'lost' | 'vip' | 'bought' | 'math' | 'caught' | 'healed' | 'fog' | 'night' | 'arrival' | 'welcome';
export interface ZooEvent {
  id: string;
  at: number;
  kind: EventKind;
  emoji: string;
  title: string;
  text: string;
  /** The arithmetic, line by line, for the reports and the bills. */
  math?: string[];
  animal?: string;
  habitat?: string;
  /** Something that needs you: an escape, a sick animal, a baby to name, a broken fence. */
  todo?: boolean;
  done?: boolean;
  seen?: boolean;
}

export interface DayReport { day: number; visitors: number; price: number; tickets: number; snacks: number; food: number; other: number }

export interface Zoo {
  v: 1;
  money: number;
  price: number;
  /** Zoo minutes since the zoo opened for the first time. */
  clock: number;
  /** Real time we last caught up to (ms). */
  real: number;
  weather: Weather;
  weatherUntil: number;
  animals: Animal[];
  owned: string[];
  /** What you're saving up for. */
  goal: string | null;
  events: ZooEvent[];
  today: { visitors: number; tickets: number; snacks: number; spent: number; inPark: number };
  reports: DayReport[];
  /** Gold stars from the math helper. */
  stars: number;
  /** Fences that need fixing, by habitat. */
  broken: string[];
  /** A lost child at the zoo, and where they are. */
  lost: { name: string; at: [number, number]; parent: [number, number] } | null;
  seq: number;
}

export const day = (clock: number) => Math.floor(clock / DAY) + 1;
export const minuteOfDay = (clock: number) => ((clock % DAY) + DAY) % DAY;
export const hourOf = (clock: number) => minuteOfDay(clock) / 60;
export function clockText(clock: number) {
  const m = minuteOfDay(clock), h = Math.floor(m / 60), mm = Math.floor(m % 60);
  return `${((h + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}
export const isNight = (clock: number) => { const h = hourOf(clock); return h < 6 || h >= 20; };
export const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

// ---------- Things to buy ----------

export interface Upgrade {
  id: string;
  name: string;
  emoji: string;
  cost: number;
  /** The exhibit it's for, or the whole zoo. */
  exhibit: string | null;
  text: string;
  /** How many more visitors a day it brings, roughly, as a share (0.05 = 5% more). */
  draw: number;
  /** How much happier the animals there are. */
  joy: number;
  /** A new animal that comes with it. */
  adds?: { species: string; habitat: string; count: number };
  /** Needs this first. */
  after?: string;
}

export const UPGRADES: Upgrade[] = [
  { id: 'benches', name: 'More benches and shade', emoji: '🪑', cost: 150, exhibit: null, draw: 0.03, joy: 0, text: 'Tired grown-ups stay longer when there’s somewhere to sit.' },
  { id: 'lemonade', name: 'Lemonade stands', emoji: '🍋', cost: 250, exhibit: null, draw: 0.02, joy: 0, text: 'Every visitor buys a bit more on a hot day.' },
  { id: 'goat-brush', name: 'Goat brushing station', emoji: '🪮', cost: 120, exhibit: 'grasslands', draw: 0.02, joy: 10, text: 'Kids can brush the goats. The goats LOVE it.' },
  { id: 'meerkat-tower', name: 'Meerkat lookout tower', emoji: '🗼', cost: 200, exhibit: 'grasslands', draw: 0.02, joy: 12, text: 'A tall lookout for the meerkat on guard duty.' },
  { id: 'lion-rock', name: 'Heated lion rock', emoji: '🪨', cost: 400, exhibit: 'lions', draw: 0.04, joy: 15, text: 'A warm rock to nap on. Lions love a warm nap.' },
  { id: 'giraffe-feeding', name: 'Giraffe feeding deck', emoji: '🥬', cost: 600, exhibit: 'grasslands', draw: 0.06, joy: 8, text: 'Visitors hand lettuce right to the giraffes’ purple tongues.' },
  { id: 'elephant-pool', name: 'Elephant splash pool', emoji: '💦', cost: 900, exhibit: 'grasslands', draw: 0.05, joy: 18, text: 'A deeper pool, so the whole herd can swim and spray.' },
  { id: 'baby-elephant', name: 'A new baby elephant friend', emoji: '🐘', cost: 2500, exhibit: 'grasslands', draw: 0.08, joy: 10, text: 'An elephant calf joins the herd.', adds: { species: 'elephant', habitat: 'elephants-e', count: 1 }, after: 'elephant-pool' },
  { id: 'red-panda-bridge', name: 'Red panda treetop bridge', emoji: '🌉', cost: 350, exhibit: 'asia', draw: 0.03, joy: 15, text: 'A rope bridge high over the path, so the red pandas can walk over your head.' },
  { id: 'tiger-pool', name: 'Tiger swimming hole', emoji: '🏊', cost: 700, exhibit: 'asia', draw: 0.05, joy: 15, text: 'Tigers love to swim. Now they can, right by the glass.' },
  { id: 'snow-machine', name: 'Snow machine for the snow leopards', emoji: '❄️', cost: 800, exhibit: 'asia', draw: 0.04, joy: 18, text: 'Fresh snow all summer long.' },
  { id: 'lemur-ropes', name: 'Lemur rope swings', emoji: '🪢', cost: 250, exhibit: 'madagascar', draw: 0.03, joy: 15, text: 'Swings and ropes all over Lemur Island.' },
  { id: 'flamingo-pond', name: 'Bigger flamingo pond', emoji: '🦩', cost: 450, exhibit: 'aviary', draw: 0.03, joy: 12, text: 'More room to wade and stand on one leg.' },
  { id: 'more-flamingos', name: 'Six more flamingos', emoji: '🦩', cost: 600, exhibit: 'aviary', draw: 0.03, joy: 5, text: 'Flamingos like a big crowd. So do visitors.', adds: { species: 'flamingo', habitat: 'aviary', count: 6 }, after: 'flamingo-pond' },
  { id: 'gorilla-hammocks', name: 'Gorilla hammocks', emoji: '🛏️', cost: 300, exhibit: 'gorillas', draw: 0.03, joy: 15, text: 'Fire-hose hammocks for lazy afternoons.' },
  { id: 'orangutan-ropes', name: 'Taller climbing towers', emoji: '🧗', cost: 650, exhibit: 'orangutans', draw: 0.04, joy: 15, text: 'Orangutans swing higher than ever.' },
  { id: 'sealion-show', name: 'Sea lion splash show', emoji: '🎪', cost: 800, exhibit: 'sealions', draw: 0.07, joy: 10, text: 'A show every afternoon. Front row gets wet!' },
  { id: 'penguin-cam', name: 'Penguin nest cam', emoji: '📹', cost: 350, exhibit: 'aquarium', draw: 0.03, joy: 5, text: 'Watch the penguin nests on the big screen.' },
  { id: 'more-penguins', name: 'Four more penguins', emoji: '🐧', cost: 1200, exhibit: 'aquarium', draw: 0.05, joy: 5, text: 'A bigger, louder, waddlier penguin colony.', adds: { species: 'penguin', habitat: 'penguins', count: 4 } },
  { id: 'shark-tunnel', name: 'Longer shark tunnel', emoji: '🦈', cost: 3000, exhibit: 'aquarium', draw: 0.1, joy: 10, text: 'Walk under the sharks for twice as long.' },
  { id: 'stingray-feeding', name: 'Stingray feeding cups', emoji: '🥤', cost: 180, exhibit: 'stingrays', draw: 0.02, joy: 10, text: 'Visitors buy a cup of shrimp to feed the rays.' },
  { id: 'desert-night', name: 'Desert night lights', emoji: '🌙', cost: 500, exhibit: 'desert', draw: 0.03, joy: 10, text: 'A moonlight section so night animals in the dome stay awake for visitors.' },
  { id: 'jungle-bridge', name: 'Jungle rope bridge', emoji: '🌉', cost: 900, exhibit: 'jungle', draw: 0.05, joy: 5, text: 'A wobbly bridge across the top of the rainforest.' },
  { id: 'otter-slide', name: 'Otter slide', emoji: '🛝', cost: 220, exhibit: 'jungle', draw: 0.03, joy: 18, text: 'A slide straight into the water. Wheee!' },
  { id: 'butterfly-garden', name: 'More butterfly flowers', emoji: '🌺', cost: 260, exhibit: 'butterflies', draw: 0.02, joy: 10, text: 'More flowers mean more butterflies.', adds: { species: 'butterfly', habitat: 'butterflies', count: 8 } },
  { id: 'train-car', name: 'A new train car', emoji: '🚃', cost: 1500, exhibit: null, draw: 0.05, joy: 0, text: 'More seats on the train, so more people ride.' },
  { id: 'after-dark', name: 'Zoo After Dark', emoji: '🏮', cost: 2000, exhibit: null, draw: 0.04, joy: 0, text: 'Lantern nights from 7 to 10. Visitors come with flashlights to see the night animals awake.' },
  { id: 'carousel-animals', name: 'New carousel animals', emoji: '🎠', cost: 700, exhibit: null, draw: 0.03, joy: 0, text: 'A red panda, a penguin and a tiger to ride on the carousel.' },
  { id: 'splash-whale', name: 'Bigger splash whale', emoji: '🐳', cost: 1100, exhibit: null, draw: 0.04, joy: 0, text: 'The whale at the splash park sprays twice as high.' },
  { id: 'vet-hospital', name: 'Animal hospital upgrade', emoji: '🏥', cost: 1800, exhibit: null, draw: 0, joy: 5, text: 'Sick animals get better twice as fast, and get sick less.' },
  { id: 'okapi-friend', name: 'A friend for the okapi', emoji: '🦓', cost: 1600, exhibit: 'savanna-north', draw: 0.03, joy: 10, text: 'One more okapi, the zoo’s shyest animal.', adds: { species: 'okapi', habitat: 'okapi', count: 1 } },
  { id: 'cheetah-run', name: 'Cheetah lure run', emoji: '💨', cost: 1300, exhibit: 'savanna-north', draw: 0.06, joy: 15, text: 'A lure zips across the yard and the cheetahs sprint after it. So fast!' },
];
export const upgrade = (id: string) => UPGRADES.find((u) => u.id === id);
export const canBuy = (z: Zoo, u: Upgrade) => !z.owned.includes(u.id) && (!u.after || z.owned.includes(u.after));

// ---------- Starting out ----------

function pickName(sp: string, taken: Set<string>, r: () => number) {
  const list = species(sp).names;
  const free = list.filter((n) => !taken.has(n));
  const n = free.length ? free[Math.floor(r() * free.length)] : `${list[Math.floor(r() * list.length)]} ${['Jr.', 'II', 'the Second', 'Junior'][Math.floor(r() * 4)]}`;
  taken.add(n);
  return n;
}

export function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function newZoo(now = Date.now(), r: () => number = seeded(now)): Zoo {
  const names = new Set<string>();
  const animals: Animal[] = [];
  let seq = 0;
  for (const h of HABITATS) for (const a of h.animals) for (let i = 0; i < a.count; i++) {
    animals.push({ id: `a${++seq}`, species: a.species, name: pickName(a.species, names, r), habitat: h.id, mood: 75 + Math.floor(r() * 15), hunger: 20 + Math.floor(r() * 20) });
  }
  const z: Zoo = {
    v: 1, money: 500, price: 5, clock: 8 * 60, real: now, weather: 'sunny', weatherUntil: 8 * 60 + 300, animals, owned: [], goal: null,
    events: [], today: { visitors: 0, tickets: 0, snacks: 0, spent: 0, inPark: 0 }, reports: [], stars: 0, broken: [], lost: null, seq,
  };
  log(z, { kind: 'welcome', emoji: '🎉', title: 'Welcome to your zoo!', text: `You two are the owners now. ${animals.length} animals live here, and they’re counting on you. Visitors pay to get in, and that money buys food and new things for the animals. The gates open at 9.` });
  return z;
}

const KEY = 'kan-zoo-v1';
export function loadZoo(): Zoo | null {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return raw && raw.v === 1 && Array.isArray(raw.animals) ? (raw as Zoo) : null;
  } catch { return null; }
}
export function saveZoo(z: Zoo) {
  try { localStorage.setItem(KEY, JSON.stringify(z)); } catch { /* private window: it just won't keep */ }
}

function log(z: Zoo, e: Omit<ZooEvent, 'id' | 'at'>) {
  const ev: ZooEvent = { id: `e${++z.seq}`, at: z.clock, ...e };
  z.events.unshift(ev);
  // Keep what still needs doing; let old news go.
  if (z.events.length > 80) {
    const keep = z.events.filter((x, i) => i < 60 || (x.todo && !x.done));
    z.events = keep.slice(0, 100);
  }
  return ev;
}

// ---------- How the zoo draws a crowd ----------

/** How happy everyone is, 0–100. */
export function happiness(z: Zoo) {
  if (!z.animals.length) return 0;
  return z.animals.reduce((s, a) => s + (a.sick ? a.mood * 0.6 : a.mood), 0) / z.animals.length;
}

/** How many visitors a whole open day would bring, at today's price, before the weather. */
export function dailyDraw(z: Zoo) {
  const stars = z.animals.reduce((s, a) => s + (a.loose ? 0 : species(a.species)?.star ?? 1), 0);
  const bonus = z.owned.reduce((s, id) => s + (upgrade(id)?.draw ?? 0), 0);
  const joy = 0.55 + (happiness(z) / 100) * 0.6;
  // Higher prices bring fewer people: at $5 everyone who wants to come, comes.
  const priceK = Math.max(0.15, Math.min(1.35, 1.25 - (z.price - 3) * 0.075));
  return Math.round(stars * 0.22 * (1 + bonus) * joy * priceK);
}
const WEATHER_DRAW: Record<Weather, number> = { sunny: 1, cloudy: 0.85, fog: 0.7, rain: 0.45, storm: 0.15, snow: 0.5 };
export const WEATHER_WORD: Record<Weather, string> = { sunny: '☀️ Sunny', cloudy: '⛅ Cloudy', fog: '🌫️ Foggy', rain: '🌧️ Rainy', storm: '⛈️ Stormy', snow: '🌨️ Snowy' };

/** The share of a day's visitors who arrive in a given hour: a morning rush, a lunch peak, a trickle at the end. */
function arrivals(h: number, afterDark: boolean) {
  if (h >= 9 && h < 17) return [0.14, 0.17, 0.16, 0.14, 0.13, 0.12, 0.09, 0.05][Math.floor(h - 9)];
  if (afterDark && h >= 19 && h < 22) return 0.07;
  return 0;
}

/** Snack money per visitor. */
const snackPer = (z: Zoo) => 2 + (z.owned.includes('lemonade') ? 1 : 0) + (z.owned.includes('stingray-feeding') ? 0.5 : 0);
export const FOOD_PER_ANIMAL = 2;

// ---------- The clock ----------

const SNEAKY = Object.values(SPECIES).filter((s) => s.sneaky).map((s) => s.id);
const AILMENTS: Ailment[] = ['tummy', 'tooth', 'cold', 'splinter', 'itchy'];
export const AILMENT_WORD: Record<Ailment, string> = { tummy: 'has a tummy ache', tooth: 'has a sore tooth', cold: 'caught a cold', splinter: 'has a splinter', itchy: 'has itchy skin' };
const BABY_NAMES = ['Peanut', 'Bean', 'Sprout', 'Button', 'Pip', 'Tiny', 'Squeak', 'Nugget', 'Pebble', 'Cupcake', 'Sunny', 'Twinkle', 'Bubbles', 'Dot', 'Jellybean', 'Pumpkin', 'Waffle', 'Kiwi', 'Daisy', 'Biscuit'];
const KIDS = ['Mia', 'Leo', 'Ava', 'Noah', 'Ella', 'Sam', 'Zoe', 'Max', 'Lily', 'Jack', 'Nora', 'Owen'];

/** Hiding spots for a loose animal: somewhere along a path, a little way off it. */
function hidingSpot(r: () => number): [number, number] {
  const spots: [number, number][] = [[612, 812], [744, 432], [300, 714], [520, 330], [452, 704], [640, 372], [880, 470], [226, 790], [600, 670], [902, 668], [150, 470], [560, 778], [540, 230], [770, 205], [388, 580]];
  const s = spots[Math.floor(r() * spots.length)];
  return [s[0] + (r() - 0.5) * 16, s[1] + (r() - 0.5) * 16];
}

/** Things that need you that are still open. */
export const todos = (z: Zoo) => z.events.filter((e) => e.todo && !e.done);

/**
 * Move the zoo along by some minutes, a step at a time. `away` makes the keepers
 * handle the little things (and keeps the drama to what's waiting when you're back).
 */
export function advance(z: Zoo, minutes: number, r: () => number, opts: { away?: boolean } = {}): ZooEvent[] {
  const before = z.seq;
  let left = Math.max(0, minutes);
  while (left > 0) {
    const step = Math.min(left, 10);
    tick(z, step, r, Boolean(opts.away));
    left -= step;
  }
  return z.events.filter((e) => Number(e.id.slice(1)) > before).reverse();
}

function tick(z: Zoo, m: number, r: () => number, away: boolean) {
  const was = z.clock;
  z.clock += m;
  const h0 = hourOf(was), h = hourOf(z.clock);
  const afterDark = z.owned.includes('after-dark');

  // A new day: last night's report waits, then breakfast for everyone, and the bill for it.
  if (day(z.clock) !== day(was)) newDay(z, r);

  // Visitors.
  const share = arrivals(h, afterDark) * (m / 60);
  if (share > 0) {
    const want = dailyDraw(z) * WEATHER_DRAW[z.weather] * share;
    const n = Math.floor(want) + (r() < want % 1 ? 1 : 0);
    z.today.visitors += n;
    z.today.tickets += n * z.price;
    z.money += n * z.price;
    const snacks = Math.round(n * snackPer(z) * (0.6 + r() * 0.5));
    z.today.snacks += snacks;
    z.money += snacks;
  }
  // Who's in the zoo right now: people stay about two and a half hours.
  const target = share > 0 ? dailyDraw(z) * WEATHER_DRAW[z.weather] * (arrivals(h, afterDark) * 2.5) : 0;
  z.today.inPark += (target - z.today.inPark) * Math.min(1, m / 40);
  if (target === 0 && (h >= CLOSE / 60 + 0.5 || h < OPEN / 60)) z.today.inPark *= 0.6;

  // Closing time: the day's report, with the arithmetic.
  if (h0 < 17 && h >= 17) closeReport(z);

  // Animals get hungry, and a little less cheerful when they are.
  for (const a of z.animals) {
    const sp = species(a.species);
    const up = sp && awake(sp, h) ? 1 : 0.4;
    a.hunger = Math.min(100, a.hunger + up * m * 0.06);
    if (away && a.hunger > 60) a.hunger = 25; // the keepers feed them when you can't
    const drift = a.hunger > 70 ? -0.05 : a.hunger < 40 ? 0.02 : 0;
    a.mood = clamp(a.mood + drift * m - (a.sick ? 0.03 * m : 0) - (a.loose ? 0.02 * m : 0), 5, 100);
    if (away && a.mood < 45) a.mood = 45;
  }

  // The weather turns now and then.
  if (z.clock >= z.weatherUntil) weather(z, r);

  // Once an hour, maybe something happens.
  if (Math.floor(was / 60) !== Math.floor(z.clock / 60)) happen(z, r, away);
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

function weather(z: Zoo, r: () => number) {
  const h = hourOf(z.clock);
  const roll = r();
  const was = z.weather;
  z.weather = h >= 5 && h < 9 && roll < 0.35 ? 'fog' : roll < 0.5 ? 'sunny' : roll < 0.72 ? 'cloudy' : roll < 0.86 ? 'rain' : roll < 0.94 ? 'storm' : 'snow';
  z.weatherUntil = z.clock + 120 + Math.floor(r() * 300);
  if (z.weather === 'storm' && was !== 'storm') {
    log(z, { kind: 'storm', emoji: '⛈️', title: 'A thunderstorm rolled in!', text: 'Thunder boomed and lots of visitors went home early. The animals all ran inside to stay dry. The elephants didn’t mind; they love mud.' });
  }
  if (z.weather === 'fog' && was !== 'fog') {
    log(z, { kind: 'fog', emoji: '🌫️', title: 'Fog over the lagoon', text: 'A thick morning fog rolled over the zoo. The giraffes’ heads poked out over the top of it!' });
  }
}

function newDay(z: Zoo, r: () => number) {
  const fed = z.animals.length;
  const cost = fed * FOOD_PER_ANIMAL;
  z.money -= cost;
  z.reports.unshift({ day: day(z.clock) - 1, visitors: z.today.visitors, price: z.price, tickets: z.today.tickets, snacks: z.today.snacks, food: cost, other: z.today.spent });
  z.reports = z.reports.slice(0, 14);
  log(z, { kind: 'bills', emoji: '🥕', title: `Breakfast for ${fed} animals`, text: `The keepers bought the day’s food.`, math: [`${fed} animals × ${money(FOOD_PER_ANIMAL)} each = ${money(cost)}`, `Money left: ${money(z.money)}`] });
  z.today = { visitors: 0, tickets: 0, snacks: 0, spent: 0, inPark: 0 };
  // Babies grow up after three days.
  for (const a of z.animals) if (a.born !== undefined && z.clock - a.born > 3 * DAY) delete a.born;
  void r;
}

function closeReport(z: Zoo) {
  const t = z.today;
  if (!t.visitors) return;
  const math = [`${t.visitors} visitors × ${money(z.price)} = ${money(t.visitors * z.price)} in tickets`, `Snacks and treats: ${money(t.snacks)}`, `${money(t.visitors * z.price)} + ${money(t.snacks)} = ${money(t.tickets + t.snacks)} today!`];
  log(z, { kind: 'report', emoji: '🎟️', title: `Day ${day(z.clock)}: ${t.visitors} visitors`, text: `The gates closed. Here’s what the zoo made today.`, math });
}

/** Animals that could be the one something happens to. */
const pick = <T,>(list: T[], r: () => number) => list[Math.floor(r() * list.length)];

function happen(z: Zoo, r: () => number, away: boolean) {
  const h = hourOf(z.clock);
  const open = (h >= 9 && h < 17) || (z.owned.includes('after-dark') && h >= 19 && h < 22);
  const waiting = todos(z).length;
  const roll = r();
  // Never more than three things waiting for you at once.
  const drama = waiting < 3;

  if (drama && roll < 0.035) {
    // Someone slips out.
    const can = z.animals.filter((a) => SNEAKY.includes(a.species) && !a.loose && !a.sick && a.born === undefined);
    if (can.length) {
      const a = pick(can, r);
      const sp = species(a.species);
      a.loose = hidingSpot(r);
      const ev = log(z, { kind: 'escape', emoji: '🚨', title: `${a.name} the ${sp.name.toLowerCase()} got out!`, text: `${a.name} slipped out of ${habitat(a.habitat)?.name ?? 'home'} and is hiding somewhere in the zoo. Find ${a.name}, then walk them home. Bring ${sp.food} as a treat!`, animal: a.id, habitat: a.habitat, todo: true });
      void ev;
      if (r() < 0.5 && !z.broken.includes(a.habitat)) {
        z.broken.push(a.habitat);
        log(z, { kind: 'fence', emoji: '🔧', title: `A hole in the fence at ${habitat(a.habitat)?.name}`, text: `That’s how ${a.name} got out! Fixing it costs ${money(80)}.`, habitat: a.habitat, todo: true });
      }
      return;
    }
  }
  if (drama && roll < 0.07) {
    const can = z.animals.filter((a) => !a.sick && !a.loose);
    const hospital = z.owned.includes('vet-hospital');
    if (can.length && (!hospital || r() < 0.5)) {
      const a = pick(can, r);
      a.sick = pick(AILMENTS, r);
      log(z, { kind: 'sick', emoji: '🤒', title: `${a.name} ${AILMENT_WORD[a.sick]}`, text: `${a.name} the ${species(a.species).name.toLowerCase()} doesn’t feel well. Call Dr. Paws to come and help.`, animal: a.id, habitat: a.habitat, todo: true });
      return;
    }
  }
  if (roll < 0.1) {
    // A baby! Only from a pair who are happy, and not too many at once.
    const groups = new Map<string, Animal[]>();
    for (const a of z.animals) if (!a.loose) { const k = `${a.habitat}:${a.species}`; groups.set(k, [...(groups.get(k) ?? []), a]); }
    const ok = [...groups.values()].filter((g) => g.length >= 2 && g.length < 12 && g.every((a) => a.born === undefined) && g.reduce((s, a) => s + a.mood, 0) / g.length > 60);
    if (ok.length && drama) {
      const g = pick(ok, r);
      const mom = g[0];
      const sp = species(mom.species);
      const baby: Animal = { id: `a${++z.seq}`, species: mom.species, name: '', habitat: mom.habitat, mood: 95, hunger: 10, born: z.clock, needsName: true };
      z.animals.push(baby);
      log(z, { kind: 'baby', emoji: '🍼', title: `A baby ${sp.name.toLowerCase()} was born!`, text: `${mom.name} had a baby at ${habitat(mom.habitat)?.name}! The baby needs a name, and you get to pick it.`, animal: baby.id, habitat: mom.habitat, todo: true });
      return;
    }
  }
  if (open && roll < 0.13 && !z.lost && drama) {
    const kid = pick(KIDS, r);
    z.lost = { name: kid, at: hidingSpot(r), parent: hidingSpot(r) };
    log(z, { kind: 'lost', emoji: '🧒', title: `${kid} can’t find their family`, text: `A little kid named ${kid} got separated from their grown-up. Find ${kid}, then walk them back to their family.`, todo: true });
    return;
  }
  if (open && roll < 0.17) {
    const kids = 20 + Math.floor(r() * 5) * 10;
    const pay = kids * Math.max(1, z.price - 2);
    z.money += pay;
    z.today.visitors += kids;
    z.today.tickets += pay;
    log(z, { kind: 'fieldtrip', emoji: '🚌', title: `A field trip! ${kids} kids came on a school bus`, text: `Schools get a special price: ${money(Math.max(1, z.price - 2))} a kid.`, math: [`${kids} kids × ${money(Math.max(1, z.price - 2))} = ${money(pay)}`] });
    return;
  }
  if (open && roll < 0.19) {
    const gift = [100, 150, 200, 250][Math.floor(r() * 4)];
    z.money += gift;
    log(z, { kind: 'vip', emoji: '💝', title: `A visitor gave the zoo ${money(gift)}!`, text: `A grandpa loved the ${species(pick(z.animals, r).species).many} so much, he made a donation to help the animals.` });
    return;
  }
  if (roll < 0.26 && !away) {
    const a = pick(z.animals.filter((x) => !x.loose), r);
    if (!a) return;
    log(z, { kind: 'funny', emoji: species(a.species).emoji, title: funny(a, r), text: species(a.species).fact, animal: a.id, habitat: a.habitat });
  }
}

function funny(a: Animal, r: () => number) {
  const sp = species(a.species);
  const lines = [
    `${a.name} did a happy dance`, `${a.name} took the longest nap ever`, `${a.name} made a visitor laugh so hard they snorted`,
    `${a.name} posed for 100 photos`, `${a.name} found a leaf and carried it around all day`, `${a.name} splashed a whole family`,
    `${a.name} stared at a toddler, and the toddler stared back`, `${a.name} tried to eat a keeper’s hat`,
  ];
  if (sp.id === 'elephant') lines.push(`${a.name} sprayed water at the keepers. Bullseye!`);
  if (sp.id === 'penguin') lines.push(`${a.name} slid down the ice on their belly, three times in a row`);
  if (sp.id === 'giraffe') lines.push(`${a.name} licked a visitor’s hat right off their head`);
  if (sp.id === 'lion') lines.push(`${a.name} ROARED, and you could hear it all the way at the train`);
  if (sp.id === 'gorilla') lines.push(`${a.name} built a fancy nest out of hay and a blanket`);
  if (sp.id === 'otter') lines.push(`${a.name} juggled a pebble for an hour`);
  if (sp.id === 'sealion') lines.push(`${a.name} balanced a ball on their nose`);
  return pick(lines, r);
}

// ---------- What you do ----------

export function feed(z: Zoo, habitatId: string) {
  let fed = 0;
  for (const a of z.animals) if (a.habitat === habitatId && !a.loose) { a.hunger = Math.max(0, a.hunger - 70); a.mood = clamp(a.mood + 6, 0, 100); fed++; }
  return fed;
}
export function play(z: Zoo, habitatId: string) {
  for (const a of z.animals) if (a.habitat === habitatId && !a.loose) a.mood = clamp(a.mood + 10, 0, 100);
}
export const VET_BILL = 60;
export function heal(z: Zoo, animalId: string) {
  const a = z.animals.find((x) => x.id === animalId);
  if (!a?.sick) return;
  delete a.sick;
  a.mood = clamp(a.mood + 20, 0, 100);
  z.money -= VET_BILL;
  z.today.spent += VET_BILL;
  closeTodo(z, (e) => e.kind === 'sick' && e.animal === animalId);
  log(z, { kind: 'healed', emoji: '💖', title: `${a.name} feels all better!`, text: `Dr. Paws took great care of ${a.name}. The vet bill was ${money(VET_BILL)}.` });
}
export function catchLoose(z: Zoo, animalId: string) {
  const a = z.animals.find((x) => x.id === animalId);
  if (!a?.loose) return;
  delete a.loose;
  a.mood = clamp(a.mood + 10, 0, 100);
  closeTodo(z, (e) => e.kind === 'escape' && e.animal === animalId);
  log(z, { kind: 'caught', emoji: '🏠', title: `${a.name} is safe at home`, text: `You found ${a.name} and walked them back to ${habitat(a.habitat)?.name}. Great job, zookeepers!` });
}
export const FENCE_COST = 80;
export function fixFence(z: Zoo, habitatId: string) {
  if (!z.broken.includes(habitatId)) return;
  z.broken = z.broken.filter((h) => h !== habitatId);
  z.money -= FENCE_COST;
  z.today.spent += FENCE_COST;
  closeTodo(z, (e) => e.kind === 'fence' && e.habitat === habitatId);
  log(z, { kind: 'fixed', emoji: '🔧', title: 'The fence is fixed', text: `Good as new, for ${money(FENCE_COST)}.` });
}
export function nameBaby(z: Zoo, animalId: string, name: string) {
  const a = z.animals.find((x) => x.id === animalId);
  if (!a) return;
  a.name = name.trim().slice(0, 24) || a.name || 'Baby';
  delete a.needsName;
  closeTodo(z, (e) => e.kind === 'baby' && e.animal === animalId);
}
export function babyNames(z: Zoo, animalId: string, r: () => number) {
  const a = z.animals.find((x) => x.id === animalId);
  if (!a) return [];
  const taken = new Set(z.animals.map((x) => x.name));
  // Baby names first, then the species' own.
  const pool = [...BABY_NAMES, ...species(a.species).names].filter((n) => !taken.has(n));
  const out: string[] = [];
  while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
  while (out.length < 3) out.push(pickName(a.species, taken, r));
  return out;
}
export function foundKid(z: Zoo) {
  if (!z.lost) return;
  const name = z.lost.name;
  z.lost = null;
  z.money += 50;
  closeTodo(z, (e) => e.kind === 'lost');
  log(z, { kind: 'vip', emoji: '🤗', title: `${name} found their family!`, text: `Their grown-up was so thankful, they gave the zoo ${money(50)}.` });
}
export function buy(z: Zoo, id: string, r: () => number) {
  const u = upgrade(id);
  if (!u || !canBuy(z, u) || z.money < u.cost) return false;
  z.money -= u.cost;
  z.today.spent += u.cost;
  z.owned.push(u.id);
  if (z.goal === u.id) z.goal = null;
  const names = new Set(z.animals.map((a) => a.name));
  if (u.adds) for (let i = 0; i < u.adds.count; i++) z.animals.push({ id: `a${++z.seq}`, species: u.adds.species, name: pickName(u.adds.species, names, r), habitat: u.adds.habitat, mood: 85, hunger: 20 });
  for (const e of EXHIBITS) if (e.id === u.exhibit) for (const a of z.animals) if (e.habitats.some((h) => h.id === a.habitat)) a.mood = clamp(a.mood + u.joy, 0, 100);
  log(z, { kind: 'bought', emoji: u.emoji, title: `New at the zoo: ${u.name}!`, text: u.text, math: [`${money(z.money + u.cost)} − ${money(u.cost)} = ${money(z.money)} left`] });
  return true;
}
function closeTodo(z: Zoo, match: (e: ZooEvent) => boolean) {
  for (const e of z.events) if (e.todo && !e.done && match(e)) e.done = true;
}

/** Catch up on the time you were away: a zoo hour for every real hour, at most two zoo days. */
export function catchUp(z: Zoo, now: number, r: () => number) {
  const gone = Math.max(0, now - z.real);
  z.real = now;
  const minutes = Math.min(2 * DAY, Math.floor(gone / 60_000));
  if (minutes < 5) return [];
  const before = { money: z.money, seq: z.seq, visitors: z.reports.reduce((s, d) => s + d.visitors, 0) + z.today.visitors };
  const evs = advance(z, minutes, r, { away: true });
  if (minutes < 60) return evs;
  // A note on top, so there's always something to hear about.
  const came = z.reports.reduce((s, d) => s + d.visitors, 0) + z.today.visitors - before.visitors;
  const made = z.money - before.money;
  const hours = Math.round(minutes / 60);
  const note = log(z, {
    kind: 'welcome', emoji: '👋', title: `While you were away: ${hours} hour${hours === 1 ? '' : 's'} at the zoo`,
    text: came > 0 ? `${came} visitors came to see the animals, and the keepers took care of everyone.` : 'The zoo was closed, so the keepers fed everyone and the animals rested.',
    math: [made >= 0 ? `Money: ${money(before.money)} → ${money(z.money)}, that’s ${money(made)} more!` : `Money: ${money(before.money)} → ${money(z.money)}, that’s ${money(-made)} spent on food.`],
  });
  return [...evs, note];
}

// ---------- The math helper ----------

/**
 * How to get the money for something: the plan, one line at a time, in the numbers
 * the girls can follow. Visitors-per-day is rounded to a friendly number.
 */
export function plan(z: Zoo, cost: number) {
  const need = Math.max(0, cost - z.money);
  const lines: string[] = [];
  if (need === 0) return { need, days: 0, perDay: 0, visitors: 0, lines: [`We have ${money(z.money)}. That’s enough! ${money(z.money)} − ${money(cost)} = ${money(z.money - cost)} left over.`] };
  const per = Math.max(10, Math.round(dailyDraw(z) / 10) * 10);
  const perDay = per * z.price;
  const days = Math.ceil(need / Math.max(1, perDay));
  lines.push(`It costs ${money(cost)}. We have ${money(z.money)}.`);
  lines.push(`${money(cost)} − ${money(z.money)} = ${money(need)} more to go.`);
  lines.push(`About ${per} visitors come each day, and each one pays ${money(z.price)}.`);
  lines.push(`${per} × ${money(z.price)} = ${money(perDay)} a day.`);
  if (days > 1) {
    const rows = [];
    for (let d = 1; d <= Math.min(days, 6); d++) rows.push(`${d} day${d > 1 ? 's' : ''}: ${money(perDay * d)}`);
    if (days > 6) rows.push('…');
    lines.push(rows.join(' · '));
  }
  lines.push(days <= 1 ? `One good day of visitors is enough!` : `${days} days × ${money(perDay)} = ${money(days * perDay)}. That covers it!`);
  const visitors = Math.ceil(need / z.price);
  lines.push(`Or: ${money(need)} ÷ ${money(z.price)} = ${visitors} more visitors.`);
  return { need, days, perDay, visitors, lines };
}

export interface Question { q: string; options: number[]; answer: number; unit: '$' | ''; why: string }

/** A question made of today's real numbers. Right answers earn a gold star and a little donation. */
export function question(z: Zoo, r: () => number): Question {
  const kinds = ['tickets', 'food', 'save', 'visitors', 'snacks', 'change'] as const;
  const k = kinds[Math.floor(r() * kinds.length)];
  const p = z.price;
  const mk = (q: string, answer: number, unit: '$' | '', why: string, near: number[]): Question => {
    const opts = new Set<number>([answer]);
    for (const n of near) if (n > 0 && opts.size < 4) opts.add(n);
    while (opts.size < 4) opts.add(Math.max(1, answer + (Math.floor(r() * 7) - 3) * Math.max(1, Math.round(answer / 10))));
    return { q, answer, unit, why, options: [...opts].sort(() => r() - 0.5) };
  };
  if (k === 'tickets') {
    const n = [10, 20, 30, 40, 50, 100][Math.floor(r() * 6)];
    return mk(`${n} visitors come in. Each ticket is ${money(p)}. How much money is that?`, n * p, '$', `${n} × ${money(p)} = ${money(n * p)}`, [n + p, n * (p + 1), n * (p - 1)]);
  }
  if (k === 'food') {
    const sp = pick(z.animals, r)?.species ?? 'penguin';
    const n = Math.max(2, z.animals.filter((a) => a.species === sp).length);
    const each = [2, 3, 4, 5][Math.floor(r() * 4)];
    return mk(`We have ${n} ${species(sp).many}. Each one eats ${money(each)} of food a day. How much is breakfast?`, n * each, '$', `${n} × ${money(each)} = ${money(n * each)}`, [n + each, n * each + each, n * each - each]);
  }
  if (k === 'save') {
    const perDay = [100, 200, 250, 500][Math.floor(r() * 4)];
    const days = 2 + Math.floor(r() * 3);
    return mk(`We make ${money(perDay)} a day. How much after ${days} days?`, perDay * days, '$', `${money(perDay)} × ${days} = ${money(perDay * days)}`, [perDay + days, perDay * (days + 1), perDay * (days - 1)]);
  }
  if (k === 'visitors') {
    const goal = [50, 100, 200, 500][Math.floor(r() * 4)];
    const price = [5, 10][Math.floor(r() * 2)];
    return mk(`We need ${money(goal)}. Tickets are ${money(price)}. How many visitors do we need?`, goal / price, '', `${money(goal)} ÷ ${money(price)} = ${goal / price} visitors`, [goal / price + 5, goal / price * 2, goal - price]);
  }
  if (k === 'snacks') {
    const a = [3, 4, 5, 6][Math.floor(r() * 4)], b = [2, 3, 4][Math.floor(r() * 3)];
    return mk(`A family buys ${a} ice creams at ${money(b)} each. How much?`, a * b, '$', `${a} × ${money(b)} = ${money(a * b)}`, [a + b, a * b + 1, a * b - 2]);
  }
  const have = [20, 50, 100][Math.floor(r() * 3)], cost = [5, 8, 12, 15, 30][Math.floor(r() * 5)];
  const c = Math.min(cost, have - 1);
  return mk(`A visitor pays ${money(have)} for something that costs ${money(c)}. How much change do they get?`, have - c, '$', `${money(have)} − ${money(c)} = ${money(have - c)}`, [have + c, have - c + 10, c]);
}
export const STAR_GIFT = 25;
export function answered(z: Zoo, right: boolean) {
  if (!right) return;
  z.stars += 1;
  z.money += STAR_GIFT;
  log(z, { kind: 'math', emoji: '⭐', title: 'Math whiz!', text: `A visitor heard you work that out and gave the zoo ${money(STAR_GIFT)}. Gold stars: ${z.stars}.` });
}

/** The newest things you haven't seen yet, for "What happened at the zoo". */
export const unseen = (z: Zoo) => z.events.filter((e) => !e.seen);
export function markSeen(z: Zoo) { for (const e of z.events) e.seen = true; }
export const animalsIn = (z: Zoo, habitatId: string) => z.animals.filter((a) => a.habitat === habitatId);
