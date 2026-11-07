import { habitat } from './map';
import { awake, species, type Species } from './species';
import { DAY, day, note, type Animal, type Zoo } from './sim';

/**
 * Keeping animals up close: what each one weighs, how its babies come (born, or
 * hatched from eggs, and how long that really takes in the wild), how a keeper is
 * allowed to touch it, and what it likes to play with. Plus the pregnancies
 * themselves: the news, a little wait you can watch, and then the babies.
 */

export type Touch = 'pet' | 'fence' | 'look';
export interface Care {
  /** A grown-up's weight, in pounds. */
  lb: number;
  /** How babies come, and how long it takes in real life, in days. */
  born: 'live' | 'egg';
  days: number;
  /** How many babies at once, usually. */
  litter: number;
  /** Keepers pet it, work with it through the fence, or only watch. */
  touch: Touch;
  toy: [string, string];
}

const C = (lb: number, born: 'live' | 'egg', days: number, litter: number, touch: Touch, toy: [string, string]): Care => ({ lb, born, days, litter, touch, toy });
const BALL: [string, string] = ['⚽', 'a big ball'];
const ICE: [string, string] = ['🧊', 'an ice treat with fruit inside'];
const BOX: [string, string] = ['📦', 'a cardboard box with treats hidden in it'];
const BUBBLES: [string, string] = ['🫧', 'bubbles'];
const MIRROR: [string, string] = ['🪞', 'a mirror'];
const PUZZLE: [string, string] = ['🧩', 'a treat puzzle'];

export const CARE: Record<string, Care> = {
  elephant: C(9000, 'live', 660, 1, 'fence', ['🏐', 'a giant ball']),
  rhino: C(5000, 'live', 480, 1, 'fence', ['🪵', 'a scratching log']),
  giraffe: C(2600, 'live', 450, 1, 'fence', ['🥬', 'a lettuce on a rope']),
  zebra: C(700, 'live', 365, 1, 'fence', ['🎃', 'a pumpkin']),
  impala: C(130, 'live', 195, 1, 'fence', ['🌿', 'a branch of leaves']),
  lion: C(420, 'live', 110, 3, 'fence', ['🎃', 'a pumpkin that smells like zebra']),
  cheetah: C(110, 'live', 93, 4, 'fence', ['🧸', 'a lure on a string']),
  ostrich: C(280, 'egg', 42, 2, 'fence', MIRROR),
  okapi: C(550, 'live', 440, 1, 'fence', ['🌿', 'a branch of leaves']),
  meerkat: C(2, 'live', 70, 4, 'look', ['🪱', 'a log full of mealworms']),
  goat: C(70, 'live', 150, 2, 'pet', BALL),
  tiger: C(300, 'live', 105, 3, 'fence', ['🛢️', 'a big floating barrel']),
  snowleopard: C(90, 'live', 95, 2, 'fence', ['🧶', 'a rope toy']),
  redpanda: C(12, 'live', 135, 2, 'fence', ICE),
  slothbear: C(250, 'live', 210, 2, 'fence', ['🍯', 'a log with honey inside']),
  indianrhino: C(4500, 'live', 480, 1, 'fence', ['🪵', 'a scratching log']),
  deer: C(150, 'live', 220, 1, 'fence', ['🍎', 'apples to find']),
  takin: C(650, 'live', 220, 1, 'fence', ['🌿', 'a branch of leaves']),
  crane: C(14, 'egg', 30, 2, 'look', MIRROR),
  lemur: C(6, 'live', 135, 1, 'pet', PUZZLE),
  ruffedlemur: C(8, 'live', 100, 2, 'pet', PUZZLE),
  fossa: C(20, 'live', 90, 2, 'fence', BOX),
  ayeaye: C(6, 'live', 165, 1, 'look', ['🥥', 'a coconut with a hole in it']),
  tortoise: C(400, 'egg', 110, 3, 'pet', ['🌺', 'a hibiscus flower']),
  flamingo: C(8, 'egg', 28, 1, 'look', MIRROR),
  ibis: C(3, 'egg', 21, 3, 'look', MIRROR),
  spoonbill: C(4, 'egg', 22, 3, 'look', MIRROR),
  swan: C(25, 'egg', 36, 3, 'look', ['🥬', 'floating lettuce']),
  macaw: C(3, 'egg', 26, 2, 'pet', PUZZLE),
  budgie: C(0.1, 'egg', 18, 3, 'pet', ['🔔', 'a little bell']),
  gorilla: C(400, 'live', 255, 1, 'fence', BOX),
  colobus: C(22, 'live', 170, 1, 'fence', PUZZLE),
  hog: C(200, 'live', 120, 3, 'fence', BOX),
  crownedcrane: C(8, 'egg', 30, 2, 'look', MIRROR),
  orangutan: C(200, 'live', 245, 1, 'fence', ['🧺', 'a blanket and a puzzle box']),
  siamang: C(25, 'live', 230, 1, 'fence', ['🪢', 'a swinging rope']),
  sealion: C(550, 'live', 330, 1, 'fence', BALL),
  seal: C(250, 'live', 330, 1, 'fence', ICE),
  penguin: C(9, 'egg', 40, 2, 'pet', BUBBLES),
  puffin: C(1, 'egg', 41, 1, 'look', BUBBLES),
  shark: C(300, 'live', 270, 2, 'look', BUBBLES),
  seaturtle: C(300, 'egg', 60, 3, 'look', ['🥬', 'a lettuce popsicle']),
  stingray: C(40, 'live', 100, 3, 'pet', BUBBLES),
  octopus: C(30, 'egg', 60, 3, 'look', ['🫙', 'a jar with a crab inside']),
  koi: C(10, 'egg', 4, 3, 'look', BUBBLES),
  batearedfox: C(9, 'live', 70, 3, 'fence', BOX),
  bobcat: C(25, 'live', 63, 3, 'fence', BOX),
  roadrunner: C(1, 'egg', 20, 3, 'look', ['🦗', 'crickets to chase']),
  owl: C(4, 'egg', 30, 3, 'fence', ['🐭', 'a toy mouse']),
  rattlesnake: C(5, 'live', 170, 3, 'look', BOX),
  beadedlizard: C(4, 'egg', 150, 3, 'look', BOX),
  aardvark: C(130, 'live', 210, 1, 'fence', ['🐜', 'a termite log']),
  bat: C(1, 'live', 150, 1, 'look', ['🍉', 'fruit on a string']),
  alligator: C(500, 'egg', 65, 3, 'look', ['🦴', 'a floating treat']),
  sloth: C(15, 'live', 330, 1, 'pet', ['🌺', 'a hibiscus flower']),
  echidna: C(10, 'egg', 10, 1, 'pet', ['🐜', 'a termite log']),
  spidermonkey: C(18, 'live', 230, 1, 'fence', PUZZLE),
  squirrelmonkey: C(2, 'live', 160, 1, 'fence', PUZZLE),
  tapir: C(550, 'live', 395, 1, 'pet', ['🪮', 'a back scratch with a brush']),
  pygmyhippo: C(500, 'live', 190, 1, 'fence', ['🍉', 'a whole watermelon']),
  otter: C(10, 'live', 63, 3, 'fence', ICE),
  butterfly: C(0.01, 'egg', 5, 3, 'look', ['🌸', 'fresh flowers']),
};
export const care = (id: string): Care => CARE[id] ?? C(50, 'live', 120, 1, 'fence', BALL);

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const pick = <T,>(list: T[], r: () => number) => list[Math.floor(r() * list.length)];

/** How long, said the way a kid would: days, weeks or months. */
export function howLong(days: number) {
  if (days < 14) return `${days} days`;
  if (days < 70) return `${Math.round(days / 7)} weeks`;
  const months = Math.round(days / 30.4);
  return months >= 20 ? `${months} months, almost ${Math.round(days / 365)} years` : `${months} months`;
}

/** Awake right now? Kingdoms of the Night keeps its lights backwards, so its animals are up by day. */
export function upNow(a: Animal, hour: number) {
  if (habitat(a.habitat)?.exhibit === 'night') return hour >= 6 && hour < 21;
  return awake(species(a.species), hour);
}

// ---------- Babies on the way ----------

/** Somebody's expecting: a happy pair, nobody too new, nobody already expecting, and room for more. */
export function startPregnancy(z: Zoo, r: () => number) {
  const groups = new Map<string, Animal[]>();
  for (const a of z.animals) if (!a.loose && a.habitat !== '__away') { const k = `${a.habitat}:${a.species}`; groups.set(k, [...(groups.get(k) ?? []), a]); }
  const ok = [...groups.values()].filter((g) => {
    const grown = g.filter((a) => a.born === undefined);
    return grown.length >= 2 && g.length < 10 && g.every((a) => !a.expecting && a.born === undefined) && g.reduce((s, a) => s + a.mood, 0) / g.length > 60;
  });
  if (!ok.length) return false;
  const g = pick(ok, r);
  const mom = pick(g.filter((a) => a.born === undefined && !a.sick), r) ?? g[0];
  const sp = species(mom.species);
  const c = care(mom.species);
  const wait = c.born === 'egg' ? 1 + Math.floor(r() * 2) : 2 + Math.floor(r() * 2);
  const n = c.litter > 1 ? 1 + Math.floor(r() * c.litter) : r() < 0.08 ? 2 : 1;
  mom.expecting = { due: z.clock + wait * DAY, n: Math.min(3, n), egg: c.born === 'egg' };
  const home = habitat(mom.habitat)?.name;
  if (c.born === 'egg') {
    note(z, {
      kind: 'baby', emoji: '🥚', title: n > 1 ? `${mom.name} laid ${n} eggs!` : `${mom.name} laid an egg!`,
      text: `${mom.name} the ${sp.name.toLowerCase()} laid ${n > 1 ? `${n} eggs` : 'an egg'} at ${home}. The keepers are keeping ${n > 1 ? 'them' : 'it'} warm. In the wild, ${sp.many} eggs take about ${howLong(c.days)} to hatch. Here, it’s only ${wait} ${wait > 1 ? 'days' : 'day'}!`,
      animal: mom.id, habitat: mom.habitat,
    });
  } else {
    note(z, {
      kind: 'baby', emoji: '💕', title: pick([`Big news: ${mom.name} is going to have a baby!`, `${mom.name} is expecting!`, `A baby is on the way for ${mom.name}!`], r),
      text: `Dr. Paws checked ${mom.name} the ${sp.name.toLowerCase()} and there’s a baby on the way! In the wild, ${sp.many} carry a baby for about ${howLong(c.days)}. Here, it’s due in just ${wait} days. Visit ${mom.name} to listen for the heartbeat, and give extra snacks: she’s eating for two.`,
      animal: mom.id, habitat: mom.habitat,
    });
  }
  return true;
}

/** Hourly: moms-to-be get hungrier, nest the day before, and the babies come when they're due. */
export function stepPregnancies(z: Zoo, r: () => number) {
  for (const mom of [...z.animals]) {
    const ex = mom.expecting;
    if (!ex) continue;
    if (mom.habitat === '__away') { ex.due += 60; continue; }
    const sp = species(mom.species);
    if (!ex.nesting && z.clock > ex.due - DAY * 0.5) {
      ex.nesting = true;
      note(z, ex.egg
        ? { kind: 'story', emoji: '🐣', title: `Tap, tap, tap…`, text: `Something is tapping from inside ${mom.name}’s ${ex.n > 1 ? 'eggs' : 'egg'}! The babies will hatch very soon.`, animal: mom.id, habitat: mom.habitat }
        : { kind: 'story', emoji: '🪺', title: `${mom.name} is making a cozy spot`, text: `${mom.name} the ${sp.name.toLowerCase()} is gathering ${pick(['soft hay', 'leaves', 'straw', 'branches'], r)} into a bed. The keepers say the baby will come very soon!`, animal: mom.id, habitat: mom.habitat });
    }
    if (z.clock < ex.due) continue;
    delete mom.expecting;
    mom.mood = clamp(mom.mood + 10, 0, 100);
    const taken = z.animals.length;
    for (let i = 0; i < ex.n && taken + i < 400; i++) {
      const baby: Animal = { id: `a${++z.seq}`, species: mom.species, name: '', habitat: mom.habitat, mood: 95, hunger: 10, born: z.clock, needsName: true, mom: mom.id };
      z.animals.push(baby);
    }
    const word = ex.n === 1 ? 'a baby' : ex.n === 2 ? 'twins' : 'triplets';
    note(z, {
      kind: 'baby', emoji: ex.egg ? '🐣' : '🍼',
      title: ex.egg ? `${ex.n > 1 ? `${ex.n} eggs` : 'The egg'} hatched!` : ex.n > 1 ? `${mom.name} had ${word}!` : `${mom.name} had her baby!`,
      text: `${ex.egg ? `Crack! ${ex.n > 1 ? `${ex.n} baby ${sp.many}` : `A baby ${sp.name.toLowerCase()}`} hatched` : `${mom.name} had ${word}`} at ${habitat(mom.habitat)?.name}! ${ex.n > 1 ? 'They all need names' : 'The baby needs a name'}, and you get to pick.`,
      animal: z.animals[z.animals.length - ex.n]?.id, habitat: mom.habitat, todo: true,
    });
  }
}

/** For the visit: how far along, in words. */
export function expectingText(z: Zoo, a: Animal) {
  const ex = a.expecting;
  if (!ex) return null;
  const left = Math.max(0, ex.due - z.clock);
  const hours = Math.ceil(left / 60);
  const when = hours <= 1 ? 'any minute now' : hours < 24 ? `in about ${hours} hours` : `on day ${day(ex.due)}`;
  return ex.egg ? `🥚 ${ex.n > 1 ? `${ex.n} eggs` : 'An egg'} will hatch ${when}` : `💕 A baby is coming ${when}`;
}

// ---------- A visit, one on one ----------

export type CareAction = 'feed' | 'pet' | 'play' | 'check' | 'goodnight';

/** What the scale says: babies start tiny and grow every day, grown-ups go up and down a little. Small animals in ounces. */
export function weightOf(z: Zoo, a: Animal, sp: Species): { n: number; unit: 'pounds' | 'ounces' } {
  const c = care(sp.id);
  const seed = [...a.id].reduce((s, ch) => (s * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const own = 0.9 + ((seed % 100) / 100) * 0.2;
  const grow = a.born !== undefined ? 0.07 + 0.1 * Math.floor((z.clock - a.born) / (DAY / 4)) / 4 : 1 + Math.sin(day(z.clock) * 1.7 + seed) * 0.02;
  const lb = c.lb * own * grow * (a.expecting && !a.expecting.egg ? 1.1 : 1);
  if (lb < 3) return { n: Math.max(1, Math.round(lb * 16)), unit: 'ounces' };
  return { n: lb > 1000 ? Math.round(lb / 10) * 10 : Math.round(lb), unit: 'pounds' };
}

/** Onto the scale: what it says now, and what it said last time. */
export function weigh(z: Zoo, a: Animal) {
  const w = weightOf(z, a, species(a.species));
  const was = a.lb;
  a.lb = w.n;
  return { ...w, was };
}

/** Three foods to choose from: the right one and two that aren't. */
export function foodChoices(sp: Species, all: Species[], r: () => number) {
  // Never a "wrong" food that's really the same kind of thing (leaves next to acacia leaves).
  const words = (f: string) => f.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3 && w !== 'and').map((w) => w.replace(/s$/, ''));
  const mine = new Set(words(sp.food));
  const wrong = all.filter((s) => s.foodEmoji !== sp.foodEmoji && !words(s.food).some((w) => mine.has(w)));
  const out = [{ emoji: sp.foodEmoji, food: sp.food, right: true }];
  while (out.length < 3 && wrong.length) {
    const w = wrong.splice(Math.floor(r() * wrong.length), 1)[0];
    if (!out.some((o) => o.emoji === w.foodEmoji)) out.push({ emoji: w.foodEmoji, food: w.food, right: false });
  }
  return out.sort(() => r() - 0.5);
}

/** Time with a keeper: happier, closer, and (once a day per thing) a little more of a bond. */
export function careFor(z: Zoo, a: Animal, action: CareAction, right = true) {
  const today = day(z.clock);
  if (!a.care || a.care.day !== today) a.care = { day: today, done: [] };
  const first = !a.care.done.includes(action);
  if (right) {
    if (first) a.care.done.push(action);
    if (action === 'feed') a.hunger = Math.max(0, a.hunger - 40);
    a.mood = clamp(a.mood + (first ? 6 : 1), 0, 100);
    if (first) a.bond = clamp((a.bond ?? 0) + (action === 'check' ? 4 : 6), 0, 100);
  }
  return first && right;
}
export const hearts = (a: Animal) => Math.min(5, Math.floor((a.bond ?? 0) / 20));

/** A gold star and a bonus for the sums done at the scale. */
export function scaleBonus(z: Zoo, n: number) {
  z.money += n;
  z.stars += 1;
}
