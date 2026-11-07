import { EXHIBITS, HABITATS, PLACES, habitat, type Px } from './map';
import { SPECIES, species } from './species';
import { DAY, hourOf, money, note, todos, type Animal, type Zoo, type ZooEvent } from './sim';

/**
 * What keeps the zoo from running the same day twice: stories.
 *
 * A story is a recipe of a few steps that plays out over hours or days: two animals
 * become friends, someone learns a trick, snacks go missing from the café, a TV crew
 * comes, a rescue baby needs a home. Many steps ask the girls to decide something,
 * and what they pick changes how it ends and what the zoo remembers.
 *
 * The zoo remembers a lot: every animal has a personality; friendships last; the
 * keepers learn from each escape, so the same trick never works twice; a regular
 * visitor comes back and the girls get to know her; the zoo gets more famous, and
 * fame brings bigger stories. Which story comes next is weighted toward ones that
 * haven't happened lately, fit the season, the weather and the hour, and suit the
 * zoo as it is now. That makes the days hard to predict without being random noise.
 */

export type Trait = 'brave' | 'shy' | 'clever' | 'cheeky' | 'sleepy' | 'show-off' | 'gentle' | 'greedy' | 'curious' | 'grumpy';
export const TRAIT_WORD: Record<Trait, string> = {
  brave: 'Brave', shy: 'Shy', clever: 'Clever', cheeky: 'Cheeky', sleepy: 'Sleepy', 'show-off': 'A show-off', gentle: 'Gentle', greedy: 'Always hungry', curious: 'Curious', grumpy: 'A little grumpy',
};
const TRAITS = Object.keys(TRAIT_WORD) as Trait[];

export interface Memory {
  fame: number;
  level: number;
  /** How many times each story has happened, and when it last started. */
  done: Record<string, number>;
  last: Record<string, number>;
  traits: Record<string, Trait>;
  /** Best friends, both ways. */
  friends: Record<string, string>;
  /** Tricks animals have learned. */
  tricks: Record<string, string>;
  nicknames: Record<string, string>;
  escapes: Record<string, number>;
  /** What the keepers learned from each escape: no getting out of there for a while. */
  locks: Record<string, number>;
  lessons: string[];
  keepers: string[];
  /** The regular visitor the girls get to know. */
  regular: { name: string; visits: number; likes: string; she?: boolean } | null;
  /** Lines already used, so the little stories don't repeat. */
  said: string[];
}

export interface Arc { id: string; recipe: string; step: number; next: number; wait: string | null; vars: Record<string, string | number>; started: number }
export interface Happening { emoji: string; label: string; at: Px; until: number }

export const FAME = ['A brand-new zoo', 'Loved in the neighborhood', 'Omaha’s favorite', 'Famous in Nebraska', 'Famous across America', 'World famous'];
const FAME_AT = [0, 600, 2000, 5000, 11000, 24000];

export function memory(z: Zoo): Memory {
  if (!z.mem) {
    z.mem = {
      fame: 0, level: 0, done: {}, last: {}, traits: {}, friends: {}, tricks: {}, nicknames: {}, escapes: {}, locks: {}, lessons: [],
      keepers: shuffle(['Maya', 'Jordan', 'Sam', 'Priya', 'Theo', 'Rosa', 'Malik', 'June'], Math.random).slice(0, 4), regular: null, said: [],
    };
  }
  z.arcs ??= [];
  return z.mem;
}

function shuffle<T>(list: T[], r: () => number) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

/** An animal's personality: settled the first time anyone asks, then kept. */
export function trait(z: Zoo, a: Animal): Trait {
  const m = memory(z);
  if (!m.traits[a.id]) {
    let h = 0;
    for (const ch of a.id + a.species) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    m.traits[a.id] = TRAITS[h % TRAITS.length];
  }
  return m.traits[a.id];
}

/** Everything the zoo remembers about one animal, for its card. */
export function remembered(z: Zoo, a: Animal) {
  const m = memory(z);
  const friend = m.friends[a.id] ? z.animals.find((x) => x.id === m.friends[a.id]) : null;
  return {
    trait: TRAIT_WORD[trait(z, a)],
    friend: friend ? `${friend.name} the ${species(friend.species).name.toLowerCase()}` : null,
    trick: m.tricks[a.id] ?? null,
    nickname: m.nicknames[a.id] ?? null,
    escapes: m.escapes[a.id] ?? 0,
  };
}

// ---------- Fame ----------

/** Visitors make the zoo famous; each new level is news, and opens up bigger stories. */
export function addFame(z: Zoo, n: number) {
  const m = memory(z);
  m.fame += n;
  const next = FAME_AT.findIndex((at, i) => i > m.level && m.fame >= at);
  if (next > m.level) {
    m.level = next;
    note(z, { kind: 'fame', emoji: '🏅', title: `The zoo is now: ${FAME[next]}!`, text: [
      'People are telling their friends about your zoo. More visitors will come, and bigger things can happen now.',
      'A newspaper wrote about your zoo! Families from farther away are planning trips.',
      'Your zoo was on the radio. Some animals in other zoos are jealous.',
      'A travel magazine put your zoo on its list of best places to visit.',
      'People from other countries are coming to see your animals!',
    ][next - 1] ?? 'Everyone is talking about your zoo.' });
  }
}
/** More famous zoos draw more visitors, and a story can bring a rush for a while. */
export function drawBoost(z: Zoo) {
  const lvl = z.mem?.level ?? 0;
  const buzz = z.buzz && z.buzz.until > z.clock ? z.buzz.k : 0;
  return 1 + lvl * 0.06 + buzz;
}

// ---------- The little stories ----------

const one = <T,>(r: () => number, ...opts: T[]) => opts[Math.floor(r() * opts.length)];
const pick = <T,>(r: () => number, list: T[]) => list[Math.floor(r() * list.length)];

/** A line nobody's heard lately: tries a few, and remembers what was said. */
function fresh(z: Zoo, r: () => number, lines: string[], name = '') {
  const m = memory(z);
  // Remembered without the name, so "Kiki did a happy dance" and "Pip did a happy dance" count as the same line.
  const key = (l: string) => (name ? l.split(name).join('#') : l).slice(0, 48);
  const unused = lines.filter((l) => !m.said.includes(key(l)));
  const line = pick(r, unused.length ? unused : lines);
  m.said.push(key(line));
  if (m.said.length > 80) m.said.shift();
  return line;
}

/** Something small an animal did, in its own way. */
export function moment(z: Zoo, r: () => number): Omit<ZooEvent, 'id' | 'at'> | null {
  const list = z.animals.filter((a) => !a.loose && a.name);
  if (!list.length) return null;
  const a = pick(r, list);
  const sp = species(a.species);
  const t = trait(z, a);
  const m = memory(z);
  const friend = m.friends[a.id] ? z.animals.find((x) => x.id === m.friends[a.id]) : null;
  const n = a.name;
  const lines: string[] = [];
  const by: Record<Trait, string[]> = {
    brave: [`${n} marched right up to the glass and stared down a toddler. The toddler won.`, `${n} was the first one to try the new water bowl. Very brave.`],
    shy: [`${n} peeked out from behind a bush for a whole minute, then hid again.`, `A crowd gathered and ${n} hid. When they left, ${n} came out and did a little happy wiggle.`],
    clever: [`${n} figured out how to open the puzzle feeder in ${2 + Math.floor(r() * 9)} seconds.`, `${n} watched the keeper lock the gate. Very carefully. Hmm.`],
    cheeky: [`${n} stole a keeper’s glove and wouldn’t give it back until snack time.`, `${n} splashed water right at the keepers. On purpose.`],
    sleepy: [`${n} fell asleep mid-yawn.`, `${n} napped in the sunniest spot in the whole zoo for three hours.`],
    'show-off': [`${n} posed for photos like a movie star.`, `${n} did a spin every time someone said "wow."`],
    gentle: [`${n} let a baby bird sit on their back.`, `${n} shared their snack with a friend.`],
    greedy: [`${n} ate their breakfast and then tried to eat everyone else’s.`, `${n} heard the food cart from all the way across the zoo.`],
    curious: [`${n} sniffed a visitor’s shoelace through the fence for a long time.`, `${n} found a shiny pebble and studied it all afternoon.`],
    grumpy: [`${n} harrumphed at the rain. Then at the sun. Then at a leaf.`, `${n} was grumpy until a keeper scratched behind their ears.`],
  };
  lines.push(...by[t]);
  // And things any animal might do, a few at a time so each day mixes differently.
  lines.push(...shuffle([
    `${n} did a happy dance when breakfast came.`, `${n} took the longest nap of the week.`, `${n} made a visitor laugh so hard they snorted.`,
    `${n} carried a leaf around all day like a treasure.`, `${n} stared at a toddler, and the toddler stared back.`, `${n} tried to eat a keeper’s hat.`,
    `${n} sneezed and startled themselves.`, `${n} found the one puddle in the whole yard and sat in it.`, `${n} waited by the gate for the keeper who gives the best scratches.`,
    `${n} posed for about a hundred photos.`, `${n} watched the train go by, every single time.`, `${n} got the zoomies for no reason at all.`,
    `${n} made a brand-new sound nobody had heard before.`, `${n} rolled in the dirt right after a bath.`, `${n} followed a butterfly across the whole yard.`,
  ], r).slice(0, 4));
  if (friend) lines.push(`${n} and ${friend.name} spent the whole afternoon side by side.`, `${n} saved a treat for best friend ${friend.name}.`);
  if (m.tricks[a.id]) lines.push(`${n} did the ${m.tricks[a.id]} trick for a crowd and got a big round of applause.`);
  const mo = new Date().getMonth();
  if ((mo === 9 || mo === 10) && r() < 0.3) lines.push(`${n} found a pumpkin from the keepers and ${one(r, 'smashed it', 'rolled it around', 'wore it like a hat')}.`);
  if ((mo === 11 || mo <= 1) && r() < 0.3) lines.push(`${n} watched the snowflakes fall with their mouth open.`);
  if (mo >= 2 && mo <= 4 && r() < 0.3) lines.push(`${n} sniffed every new spring flower in the yard.`);
  if (sp.id === 'elephant') lines.push(`${n} sprayed a perfect rainbow with their trunk.`);
  if (sp.id === 'penguin') lines.push(`${n} belly-slid down the ice three times in a row.`);
  if (sp.id === 'giraffe') lines.push(`${n} licked a visitor’s hat right off their head.`);
  if (sp.id === 'otter') lines.push(`${n} juggled a pebble for an hour.`);
  if (sp.id === 'sealion') lines.push(`${n} balanced a ball on their nose and barked for applause.`);
  if (sp.id === 'gorilla') lines.push(`${n} built a fancy nest out of hay and a blanket.`);
  if (sp.id === 'lion') lines.push(`${n} ROARED, and you could hear it all the way at the train.`);
  const line = fresh(z, r, lines, n);
  return { kind: 'funny', emoji: sp.emoji, title: line, text: `${TRAIT_WORD[t]} ${n} the ${sp.name.toLowerCase()}. ${sp.fact}`, animal: a.id, habitat: a.habitat };
}

// ---------- Escapes, and the keepers learning ----------

const SPOTS: { at: Px; where: string }[] = [
  { at: [612, 812], where: 'behind the giant screen theater' }, { at: [744, 432], where: 'by the goat kraal' }, { at: [300, 714], where: 'in the splash park' },
  { at: [520, 330], where: 'near the stingray beach' }, { at: [452, 704], where: 'under a bench by the sea lions' }, { at: [640, 372], where: 'in the flowers at the Garden of the Senses' },
  { at: [880, 470], where: 'outside the African Lodge' }, { at: [226, 790], where: 'next to the carousel' }, { at: [600, 670], where: 'at the foot of the Desert Dome' },
  { at: [902, 668], where: 'by the Skyfari line' }, { at: [150, 470], where: 'up in the Asian Highlands' }, { at: [560, 778], where: 'by the education center' },
  { at: [540, 230], where: 'out past the okapi' }, { at: [770, 205], where: 'by the lagoon' }, { at: [388, 580], where: 'outside the aviary' }, { at: [250, 846], where: 'at Glacier Bay Landing' },
];
const HOW = [
  'squeezed under the gate', 'climbed a branch that hung over the fence', 'hopped into a keeper’s wheelbarrow and rode right out', 'slipped out behind the food cart',
  'followed a school group out the door', 'found a loose board in the fence', 'jumped onto the train for a ride', 'waited for the gate to open and dashed',
];
const LEARN = [
  'trimmed every branch that hangs over the fence', 'put a second latch on the gate', 'added a bell to the gate so they hear it open', 'checked every board in the fence',
  'started counting heads after every feeding', 'put a lid on the wheelbarrow', 'asked the train driver to check for stowaways',
];
const SNEAKY = Object.values(SPECIES).filter((s) => s.sneaky).map((s) => s.id);

/** Someone gets out, maybe. Never the same way twice in a row, and never from where the keepers just fixed it. */
export function escape(z: Zoo, r: () => number): boolean {
  const m = memory(z);
  const can = z.animals.filter((a) => SNEAKY.includes(a.species) && !a.loose && !a.sick && a.born === undefined && !(m.locks[a.habitat] > z.clock));
  if (!can.length) return false;
  // Clever and cheeky animals try more; repeat offenders are watched more closely.
  const w = can.map((a) => { const t = trait(z, a); return (t === 'clever' || t === 'cheeky' || t === 'curious' ? 3 : 1) / (1 + (m.escapes[a.id] ?? 0) * 0.6); });
  let roll = r() * w.reduce((s, x) => s + x, 0);
  let a = can[0];
  for (let i = 0; i < can.length; i++) { roll -= w[i]; if (roll <= 0) { a = can[i]; break; } }
  const sp = species(a.species);
  const spot = pick(r, SPOTS);
  a.loose = [spot.at[0] + (r() - 0.5) * 14, spot.at[1] + (r() - 0.5) * 14];
  const times = (m.escapes[a.id] = (m.escapes[a.id] ?? 0) + 1);
  const how = fresh(z, r, HOW);
  const nick = m.nicknames[a.id];
  const who = nick ? `${a.name} "${nick}"` : a.name;
  const title = times === 1 ? `${a.name} the ${sp.name.toLowerCase()} got out!` : times === 2 ? `${a.name} got out AGAIN!` : `${who} escaped for the ${times === 3 ? 'third' : `${times}th`} time!`;
  const text = `${a.name} ${how}, and someone spotted them ${spot.where}. Go find ${a.name} and walk them home. Bring ${sp.food} as a treat!`
    + (times === 2 ? ` Keepers are scratching their heads: it was a different way out this time.` : '')
    + (times >= 3 && !nick ? ` ${a.name} needs an escape-artist nickname. Pick one when they’re home!` : '');
  note(z, { kind: 'escape', emoji: '🚨', title, text, animal: a.id, habitat: a.habitat, todo: true, how });
  return true;
}

/** Home again: the keepers work out how they got out, and fix it. Third-timers earn a nickname. */
export function learnFromEscape(z: Zoo, a: Animal, r: () => number) {
  const m = memory(z);
  const lesson = fresh(z, r, LEARN);
  m.locks[a.habitat] = z.clock + (3 + Math.floor(r() * 4)) * DAY;
  m.lessons.push(lesson);
  if (m.lessons.length > 20) m.lessons.shift();
  note(z, { kind: 'learned', emoji: '🔒', title: `The keepers learned something`, text: `${pick(r, m.keepers)} and the team ${lesson} at ${habitat(a.habitat)?.name}. ${a.name} won’t get out that way again!` });
  if ((m.escapes[a.id] ?? 0) >= 3 && !m.nicknames[a.id]) {
    note(z, {
      kind: 'story', emoji: '🎩', title: `${a.name} needs a nickname`, text: `${a.name} has gotten out ${m.escapes[a.id]} times. Every escape artist needs a nickname!`,
      animal: a.id, todo: true, choices: [{ label: 'The Great Escape' }, { label: 'Houdini' }, { label: 'Sneaky Pete' }, { label: 'Captain Zoom' }], arc: `nick:${a.id}`,
    });
  }
}

// ---------- Story recipes ----------

interface Ctx {
  z: Zoo;
  r: () => number;
  m: Memory;
  hour: number;
  open: boolean;
  night: boolean;
  month: number;
  keeper: string;
  /** Logs one step of a story. */
  say: (e: Omit<ZooEvent, 'id' | 'at' | 'kind'> & { kind?: ZooEvent['kind'] }) => ZooEvent;
  animal: (ok?: (a: Animal) => boolean) => Animal | null;
  get: (id: string | number | undefined) => Animal | null;
  sp: (a: Animal) => string;
}
interface Out { wait?: number; end?: boolean }
interface Recipe {
  id: string;
  /** How often it comes up, before novelty and timing. */
  weight: number;
  /** Days before it can happen again. */
  cooldown: number;
  when?: (c: Ctx) => boolean;
  /** Set up: pick who it's about. Return false if it can't happen right now. */
  start: (c: Ctx, v: Arc['vars']) => boolean;
  /** Each step; `choice` is what the girls picked on the last one, if it asked. */
  steps: ((c: Ctx, v: Arc['vars'], choice: number) => Out | void)[];
}

const near = (a: Animal, b: Animal) => habitat(a.habitat)?.exhibit && habitat(a.habitat)?.exhibit === habitat(b.habitat)?.exhibit;
const awakeOk = (a: Animal) => !a.loose && !a.sick && Boolean(a.name);
const spot = (h: string): Px => habitat(h)?.at ?? [700, 880];
const placeAt = (id: string): Px => PLACES.find((p) => p.id === id)?.at ?? [700, 880];

function happen(z: Zoo, label: string, emoji: string, at: Px, hours: number) {
  z.happening = { label, emoji, at, until: z.clock + hours * 60 };
}
function buzz(z: Zoo, k: number, hours: number, why: string) {
  z.buzz = { k, until: z.clock + hours * 60, why };
}

const RECIPES: Recipe[] = [
  {
    id: 'friends', weight: 3, cooldown: 2,
    start: (c, v) => {
      const a = c.animal((x) => !c.m.friends[x.id]);
      if (!a) return false;
      const others = c.z.animals.filter((b) => b.id !== a.id && awakeOk(b) && !c.m.friends[b.id] && (near(a, b) || b.habitat === a.habitat) && b.species !== a.species);
      const b = others.length ? pick(c.r, others) : c.animal((x) => x.id !== a.id && x.habitat === a.habitat && !c.m.friends[x.id]);
      if (!b) return false;
      v.a = a.id; v.b = b.id;
      return true;
    },
    steps: [
      (c, v) => { const a = c.get(v.a)!, b = c.get(v.b)!; c.say({ emoji: '👀', title: `${a.name} keeps looking at ${b.name}`, text: `${a.name} the ${c.sp(a)} has spent all morning watching ${b.name} the ${c.sp(b)}. Keeper ${c.keeper} thinks something is going on.`, animal: a.id }); return { wait: 4 + c.r() * 8 }; },
      (c, v) => { const a = c.get(v.a)!, b = c.get(v.b)!; c.say({ emoji: '💛', title: `Should ${a.name} and ${b.name} have a playdate?`, text: `They wave, chirp and bounce whenever they see each other. The keepers can set up a safe playdate during enrichment time. What do you think?`, animal: a.id, todo: true, choices: [{ label: 'Yes, a playdate!' }, { label: 'Not yet' }] }); },
      (c, v, ch) => {
        const a = c.get(v.a)!, b = c.get(v.b)!;
        if (ch === 0) {
          c.m.friends[a.id] = b.id; c.m.friends[b.id] = a.id;
          a.mood = Math.min(100, a.mood + 20); b.mood = Math.min(100, b.mood + 20);
          c.say({ emoji: '🤝', title: `${a.name} and ${b.name} are best friends now!`, text: one(c.r, `They played chase until they both flopped over, tired and happy.`, `They sat together and watched the clouds. Best friends, officially.`, `${a.name} gave ${b.name} a present: a very nice stick.`), animal: a.id });
          happen(c.z, `${a.name} & ${b.name} playdate`, '💛', spot(a.habitat), 3);
        } else c.say({ emoji: '🙂', title: `${a.name} will wait`, text: `${a.name} sighed and went back to watching ${b.name}. Maybe another day.`, animal: a.id });
        return { end: true };
      },
    ],
  },
  {
    id: 'trick', weight: 2.5, cooldown: 3,
    start: (c, v) => {
      const a = c.animal((x) => !c.m.tricks[x.id] && ['clever', 'show-off', 'curious', 'cheeky'].includes(trait(c.z, x)) && species(x.species).look.body !== 'fish' && species(x.species).look.body !== 'butterfly');
      if (!a) return false;
      v.a = a.id;
      v.trick = pick(c.r, a.species === 'elephant' || a.species === 'orangutan' ? ['painting', 'painting', 'hat-tipping'] : ['high-five', 'spin-around', 'wave hello', 'ring-the-bell', 'stack-the-cups', 'peekaboo', 'take-a-bow']);
      return true;
    },
    steps: [
      (c, v) => { const a = c.get(v.a)!; c.say({ emoji: '✨', title: `${a.name} is trying to learn something`, text: `Keeper ${c.keeper} saw ${a.name} copy the keepers’ ${String(v.trick).replace(/-/g, ' ')} three times. Should we teach ${a.name} properly? Training treats cost ${money(40)}.`, animal: a.id, todo: true, choices: [{ label: `Teach ${a.name}! (${money(40)})`, cost: 40 }, { label: 'Let them be' }] }); },
      (c, v, ch) => {
        const a = c.get(v.a)!;
        if (ch !== 0) { c.say({ emoji: '🌿', title: `${a.name} went back to being ${a.name}`, text: `No tricks today. ${a.name} seems perfectly happy about that.`, animal: a.id }); return { end: true }; }
        c.say({ emoji: '🎓', title: `Training day for ${a.name}`, text: `Lesson one went great. ${a.name} got ${2 + Math.floor(c.r() * 5)} treats and almost got it.`, animal: a.id });
        return { wait: 12 + c.r() * 20 };
      },
      (c, v) => {
        const a = c.get(v.a)!;
        c.m.tricks[a.id] = String(v.trick).replace(/-/g, ' ');
        buzz(c.z, 0.12, 30, `${a.name}’s new trick`);
        happen(c.z, `${a.name}’s ${c.m.tricks[a.id]} show`, '🎉', spot(a.habitat), 8);
        if (v.trick === 'painting') {
          const n = 4 + Math.floor(c.r() * 5), each = 15;
          c.z.money += n * each;
          c.say({ emoji: '🎨', title: `${a.name} painted ${n} pictures!`, text: `They sold in the gift shop right away.`, math: [`${n} paintings × ${money(each)} = ${money(n * each)}`], animal: a.id });
        } else c.say({ emoji: '🎉', title: `${a.name} learned the ${c.m.tricks[a.id]}!`, text: `Visitors are lining up to see it. Word is spreading, so expect more people for a day or so.`, animal: a.id });
        return { end: true };
      },
    ],
  },
  {
    id: 'mystery', weight: 2, cooldown: 5,
    when: (c) => c.open,
    start: (c, v) => {
      const suspects = shuffle(c.z.animals.filter((a) => awakeOk(a) && species(a.species).sneaky), c.r);
      const names = [...new Set(suspects.map((a) => a.species))].slice(0, 3);
      if (names.length < 3) return false;
      v.s0 = names[0]; v.s1 = names[1]; v.s2 = names[2];
      v.who = Math.floor(c.r() * 3);
      v.place = pick(c.r, ['plaza-cafe', 'treetops', 'lodge', 'glacier']);
      return true;
    },
    steps: [
      (c, v) => { c.say({ emoji: '🕵️', title: 'A mystery: snacks are going missing!', text: `Every morning, a few snacks are gone from ${PLACES.find((p) => p.id === v.place)?.name}. Nobody saw who took them. Keep an eye out for clues…` }); happen(c.z, 'Snack mystery', '🕵️', placeAt(String(v.place)), 10); return { wait: 5 + c.r() * 8 }; },
      (c, v) => { const sp = species(String(v[`s${v.who}`])); c.say({ emoji: '🔍', title: 'Clue #1', text: `There were tiny ${sp.look.body === 'bird' || sp.look.body === 'penguin' ? 'bird footprints' : 'paw prints'} by the snack shelf, and a little pile of crumbs.` }); return { wait: 5 + c.r() * 8 }; },
      (c, v) => {
        const sp = species(String(v[`s${v.who}`]));
        const clue = sp.flies ? 'a feather stuck on the counter' : sp.climbs ? 'scratch marks way up on the shelf: whoever it was can climb' : sp.swims ? 'wet drips across the floor: someone was swimming first' : 'a hole dug under the back door';
        c.say({ emoji: '🔍', title: 'Clue #2', text: `This time the keepers found ${clue}. Who do you think it is?`, todo: true, choices: [0, 1, 2].map((i) => ({ label: `The ${species(String(v[`s${i}`])).many}` })) });
      },
      (c, v, ch) => {
        const sp = species(String(v[`s${v.who}`]));
        if (ch === v.who) {
          c.z.money += 60;
          c.say({ emoji: '🏆', title: `You solved it! It was the ${sp.many}!`, text: `The keepers set up a camera and caught them red-pawed. Mystery solved! The café was so happy, they gave the zoo ${money(60)}.` });
        } else c.say({ emoji: '😮', title: `It was the ${sp.many}!`, text: `Not who we guessed! ${sp.flies ? 'The feather was the giveaway.' : sp.climbs ? 'Only a climber could reach that shelf.' : sp.swims ? 'Those drips were from a swimmer.' : 'They dug their way in.'} The keepers fixed it so it can’t happen again.` });
        return { end: true };
      },
    ],
  },
  {
    id: 'heatwave', weight: 1.5, cooldown: 6,
    when: (c) => c.month >= 4 && c.month <= 8 || c.r() < 0.25,
    start: () => true,
    steps: [
      (c) => {
        c.z.weather = 'sunny'; c.z.weatherUntil = c.z.clock + 36 * 60;
        const n = c.z.animals.length;
        c.say({ emoji: '🥵', title: 'A heat wave is coming!', text: `It’s going to be super hot for two days. Ice pops would keep the animals cool, at $2 each. Should we make one for every animal?`, math: [`${n} animals × $2 = ${money(n * 2)}`], todo: true, choices: [{ label: `Make ice pops (${money(n * 2)})`, cost: n * 2 }, { label: 'They’ll be okay' }] });
      },
      (c, _v, ch) => {
        if (ch === 0) {
          for (const a of c.z.animals) a.mood = Math.min(100, a.mood + 12);
          buzz(c.z, 0.1, 30, 'ice pops');
          happen(c.z, 'Ice pop day!', '🧊', placeAt('splash'), 10);
          c.say({ emoji: '🧊', title: 'Ice pop day!', text: one(c.r, 'The tigers licked fish-flavored ice pops. The elephants got giant watermelon ones. Everyone stayed cool.', 'The bears got frozen fruit blocks and the penguins got fish-sicles. Visitors loved watching.') });
        } else {
          for (const a of c.z.animals) a.mood = Math.max(30, a.mood - 8);
          c.say({ emoji: '😓', title: 'A hot, sleepy day', text: 'Most animals lay in the shade and didn’t do much. The splash park was packed, though.' });
        }
        return { end: true };
      },
    ],
  },
  {
    id: 'snowday', weight: 1.5, cooldown: 6,
    when: (c) => c.month >= 10 || c.month <= 2,
    start: () => true,
    steps: [
      (c) => { c.z.weather = 'snow'; c.z.weatherUntil = c.z.clock + 10 * 60; c.say({ emoji: '❄️', title: 'It’s snowing at the zoo!', text: 'Big fluffy flakes everywhere. The snow leopards and penguins are thrilled. Should we have a Snow Day party with hot cocoa for visitors?', todo: true, choices: [{ label: `Snow Day party! (${money(50)})`, cost: 50 }, { label: 'Just enjoy the snow' }] }); },
      (c, _v, ch) => {
        if (ch === 0) { buzz(c.z, 0.35, 10, 'the Snow Day party'); happen(c.z, 'Snow Day party', '☃️', placeAt('entrance'), 8); c.say({ emoji: '☃️', title: 'Snow Day party!', text: 'Families came in boots and mittens. Kids built a snow-giraffe by the gate.' }); }
        else c.say({ emoji: '🐧', title: 'The penguins had the best day ever', text: 'They tobogganed on their bellies all morning.' });
        return { end: true };
      },
    ],
  },
  {
    id: 'tv', weight: 1.5, cooldown: 8,
    when: (c) => c.m.level >= 2,
    start: (c, v) => { const stars = shuffle(c.z.animals.filter((a) => awakeOk(a) && species(a.species).star >= 4), c.r).slice(0, 3); if (stars.length < 3) return false; stars.forEach((a, i) => { v[`a${i}`] = a.id; }); return true; },
    steps: [
      (c, v) => { const list = [0, 1, 2].map((i) => c.get(v[`a${i}`])!); c.say({ emoji: '📺', title: 'A TV show wants to film at your zoo!', text: '"Wild Weekend" wants one animal to be the star of the episode. Who should it be?', todo: true, choices: list.map((a) => ({ label: `${a.name} the ${c.sp(a)}` })) }); },
      (c, v, ch) => {
        const a = c.get(v[`a${ch}`])!;
        v.star = a.id;
        happen(c.z, `Filming ${a.name}!`, '🎬', spot(a.habitat), 6);
        c.say({ emoji: '🎬', title: `Lights, camera, ${a.name}!`, text: trait(c.z, a) === 'shy' ? `${a.name} was shy at first and hid behind a rock. Then they peeked out, and the crew said it was the cutest shot they’d ever filmed.` : `${a.name} was a natural. The crew filmed all day.`, animal: a.id });
        return { wait: 20 + c.r() * 20 };
      },
      (c, v) => { const a = c.get(v.star)!; buzz(c.z, 0.4, 48, `${a.name} on TV`); addFame(c.z, 300); c.say({ emoji: '📺', title: `${a.name} was on TV!`, text: `Families all over saw the show. Get ready for a lot of visitors who want to meet ${a.name}!`, animal: a.id }); return { end: true }; },
    ],
  },
  {
    id: 'rescue', weight: 1.4, cooldown: 6,
    start: (c, v) => {
      const options = ['otter', 'redpanda', 'flamingo', 'goat', 'tortoise', 'owl', 'meerkat', 'penguin'].filter((s) => c.z.animals.some((a) => a.species === s));
      // A kind of baby we haven't rescued lately.
      const fresher = options.filter((x) => !c.m.said.includes(`rescue:${x}`));
      if (!options.length) return false;
      v.sp = pick(c.r, fresher.length ? fresher : options);
      c.m.said.push(`rescue:${v.sp}`);
      return true;
    },
    steps: [
      (c, v) => { const sp = species(String(v.sp)); c.say({ emoji: '📞', title: `A rescue center called about a baby ${sp.name.toLowerCase()}`, text: `A baby ${sp.name.toLowerCase()} lost its family and needs a forever home. It would need a cozy box, a blanket and special food for ${money(120)}. Can our zoo take it?`, todo: true, choices: [{ label: `Yes! (${money(120)})`, cost: 120 }, { label: 'We can’t right now' }] }); },
      (c, v, ch) => {
        const sp = species(String(v.sp));
        if (ch !== 0) { c.say({ emoji: '💙', title: 'The baby went to another zoo', text: `It found a good home in Kansas City. They sent a thank-you note.` }); return { end: true }; }
        const home = c.z.animals.find((a) => a.species === sp.id)!.habitat;
        const baby: Animal = { id: `a${++c.z.seq}`, species: sp.id, name: '', habitat: home, mood: 70, hunger: 40, born: c.z.clock, needsName: true };
        c.z.animals.push(baby);
        c.say({ kind: 'baby', emoji: '🍼', title: `The rescue baby ${sp.name.toLowerCase()} is here!`, text: `It’s a little nervous in its new home at ${habitat(home)?.name}. It needs a name!`, animal: baby.id, habitat: home, todo: true });
        v.baby = baby.id;
        return { wait: 16 + c.r() * 16 };
      },
      (c, v) => {
        const b = c.get(v.baby);
        if (!b) return { end: true };
        const buddy = c.z.animals.find((a) => a.habitat === b.habitat && a.id !== b.id && a.species === b.species);
        if (buddy) { c.m.friends[b.id] = buddy.id; c.m.friends[buddy.id] ??= b.id; }
        c.say({ emoji: '🥰', title: `${b.name || 'The rescue baby'} feels at home now`, text: buddy ? `${buddy.name} took the little one under their wing. They’re never apart now.` : 'It ate a big breakfast and explored every corner.', animal: b.id });
        return { end: true };
      },
    ],
  },
  {
    id: 'regular', weight: 2, cooldown: 1,
    when: (c) => c.open,
    start: (c, v) => {
      if (!c.m.regular) { const [name, she] = pick(c.r, [['Grandma Rose', true], ['Mr. Patel', false], ['Grandpa Joe', false], ['Ms. Alvarez', true], ['Nana Bea', true]] as [string, boolean][]); c.m.regular = { name, she, visits: 0, likes: pick(c.r, c.z.animals.filter(awakeOk)).id }; }
      v.n = c.m.regular.visits;
      return c.m.regular.visits < 8;
    },
    steps: [
      (c) => {
        const g = c.m.regular!;
        g.visits++;
        const fav = c.get(g.likes) ?? c.animal();
        const name = fav?.name ?? 'the animals';
        const [He, he, his, him] = g.she === false ? ['He', 'he', 'his', 'him'] : ['She', 'she', 'her', 'her'];
        const lines = [
          `${g.name} came to the zoo today and sat by ${name} for an hour, smiling.`,
          `${g.name} is back! ${He} brought a sketchbook and drew ${name}.`,
          `${g.name} told Keeper ${c.keeper} ${he} comes every week because ${name} makes ${him} happy.`,
          `${g.name} knitted a tiny scarf. It’s for ${name}. The keepers hung it by the glass.`,
          `${g.name} brought ${his} grandkids to meet ${name}. They waved and ${name} looked right at them.`,
          `${g.name} has visited ${g.visits} times now. The keepers know ${him} by name.`,
          `${g.name} wasn’t here today. Everyone noticed. ${name} kept looking at the bench.`,
          `${g.name} came back! ${He} said ${he}’d been visiting family. ${name} seemed to remember ${him}.`,
        ];
        const line = lines[Math.min(g.visits - 1, lines.length - 1)];
        if (g.visits === 6) {
          c.z.money += 300;
          c.say({ kind: 'vip', emoji: '💝', title: `${g.name} made a gift to the zoo`, text: `${line} ${He} left an envelope: ${money(300)} "for ${name}’s snacks."`, animal: fav?.id });
        } else c.say({ emoji: '👵', title: g.visits === 1 ? `A visitor named ${g.name}` : `${g.name} again`, text: line, animal: fav?.id });
        return { end: true };
      },
    ],
  },
  {
    id: 'party', weight: 2, cooldown: 2,
    when: (c) => c.open,
    start: (c, v) => { v.kid = pick(c.r, ['Ava', 'Liam', 'Sophia', 'Mateo', 'Harper', 'Elijah', 'Isla', 'Noah', 'Lucy']); v.age = 5 + Math.floor(c.r() * 5); v.n = 8 + Math.floor(c.r() * 9); const a = c.animal((x) => species(x.species).star >= 4); if (!a) return false; v.fav = a.id; return true; },
    steps: [
      (c, v) => {
        const fav = c.get(v.fav)!;
        const pay = Number(v.n) * 8;
        c.z.money += pay;
        happen(c.z, `${v.kid}’s birthday`, '🎂', placeAt('durham'), 4);
        c.say({ kind: 'vip', emoji: '🎂', title: `${v.kid} is having a birthday party at the zoo!`, text: `${v.kid} is turning ${v.age}, and their favorite animal is ${fav.name} the ${c.sp(fav)}. The party room at Durham Lodge is booked.`, math: [`${v.n} kids × $8 = ${money(pay)}`] });
        return { wait: 3 };
      },
      (c, v) => { const fav = c.get(v.fav)!; c.say({ emoji: '🎈', title: `${fav.name} came to the window during the party!`, text: one(c.r, `All ${v.n} kids screamed with happiness. ${v.kid} said it was the best birthday ever.`, `${fav.name} stayed right there while everyone sang Happy Birthday.`), animal: fav.id }); return { end: true }; },
    ],
  },
  {
    id: 'sniffles', weight: 1.2, cooldown: 7,
    start: (c, v) => {
      const groups = HABITATS.filter((h) => c.z.animals.filter((a) => a.habitat === h.id && awakeOk(a)).length >= 4);
      if (!groups.length) return false;
      v.h = pick(c.r, groups).id;
      return true;
    },
    steps: [
      (c, v) => {
        const list = c.z.animals.filter((a) => a.habitat === v.h && awakeOk(a));
        const each = 3;
        c.say({ emoji: '🤧', title: `Sneezes at ${habitat(String(v.h))?.name}`, text: `${pick(c.r, list).name} sneezed, and then another one did. Dr. Paws says vitamin smoothies for everyone there would stop a cold from spreading.`, math: [`${list.length} animals × ${money(each)} = ${money(list.length * each)}`], todo: true, choices: [{ label: `Smoothies for all (${money(list.length * each)})`, cost: list.length * each }, { label: 'Wait and see' }] });
      },
      (c, v, ch) => {
        const list = c.z.animals.filter((a) => a.habitat === v.h && awakeOk(a));
        if (ch === 0) { for (const a of list) a.mood = Math.min(100, a.mood + 8); c.say({ emoji: '🥤', title: 'Nobody caught the cold!', text: 'The smoothies worked. Dr. Paws gave you a thumbs-up.' }); }
        else {
          const sick = shuffle(list, c.r).slice(0, 2);
          for (const a of sick) { a.sick = 'cold'; note(c.z, { kind: 'sick', emoji: '🤒', title: `${a.name} caught the cold`, text: `Call Dr. Paws to help ${a.name} feel better.`, animal: a.id, habitat: a.habitat, todo: true }); }
        }
        return { end: true };
      },
    ],
  },
  {
    id: 'dropped', weight: 1.6, cooldown: 3,
    when: (c) => c.open,
    start: (c, v) => { const a = c.animal((x) => !species(x.species).swims && species(x.species).look.body === 'quad'); if (!a) return false; v.a = a.id; v.item = pick(c.r, ['a sun hat', 'a stuffed bunny', 'a pair of sunglasses', 'a mitten', 'a baseball cap']); return true; },
    steps: [
      (c, v) => { const a = c.get(v.a)!; c.say({ emoji: '😱', title: `Someone dropped ${v.item} into ${habitat(a.habitat)?.name}!`, text: `A little kid is crying. ${a.name} the ${c.sp(a)} is walking over to look at it. What should the keepers do?`, animal: a.id, todo: true, choices: [{ label: 'Trade a treat for it' }, { label: 'Use the long grabber' }, { label: 'Let them keep it' }] }); },
      (c, v, ch) => {
        const a = c.get(v.a)!;
        const text = ch === 0 ? `${a.name} dropped ${v.item} for a snack. Smart trade! The kid got it back, a little slobbery.`
          : ch === 1 ? (c.r() < 0.5 ? `The grabber got it! The kid cheered.` : `${a.name} grabbed the other end and it was a tug-of-war. ${a.name} won. Then lost interest. Got it!`)
            : `${a.name} wore ${v.item} all day. The kid decided that was even better, and took a hundred photos.`;
        c.say({ emoji: ch === 2 ? '🤠' : '🙌', title: `${a.name} and ${v.item}`, text, animal: a.id });
        if (ch === 2) happen(c.z, `${a.name}’s new look`, '🤠', spot(a.habitat), 5);
        return { end: true };
      },
    ],
  },
  {
    id: 'nightsounds', weight: 1.6, cooldown: 4,
    when: (c) => c.night,
    start: (c, v) => { const a = c.animal((x) => species(x.species).night || ['pygmyhippo', 'elephant', 'gorilla'].includes(x.species)); if (!a) return false; v.a = a.id; return true; },
    steps: [
      (c) => { c.say({ emoji: '🌙', title: 'Spooky sounds in the night…', text: `Keeper ${c.keeper} on night watch heard something: a low rumbly WHOOO-hrrrmph. Where should the keepers look first?`, todo: true, choices: [{ label: 'Down by the water' }, { label: 'Up in the trees' }, { label: 'Behind the big rocks' }] }); },
      (c, v) => {
        const a = c.get(v.a)!;
        const what = a.species === 'pygmyhippo' ? 'snoring. Very, very loudly.' : a.species === 'elephant' ? 'rumbling to the others in elephant talk.' : a.species === 'lion' ? 'practicing a roar, quietly, so nobody would hear.' : a.species === 'owl' ? 'hooting a midnight song.' : a.species === 'gorilla' ? 'talking in their sleep.' : 'wide awake and having a midnight snack.';
        c.say({ emoji: '🔦', title: `It was ${a.name}!`, text: `${c.keeper} shone a flashlight and there was ${a.name} the ${c.sp(a)}, ${what}`, animal: a.id });
        return { end: true };
      },
    ],
  },
  {
    id: 'school', weight: 1.8, cooldown: 4,
    start: (c, v) => { const a = c.animal(); if (!a) return false; v.a = a.id; v.kids = 18 + Math.floor(c.r() * 10); v.grade = pick(c.r, ['first', 'second', 'third', 'fourth']); return true; },
    steps: [
      (c, v) => { const a = c.get(v.a)!; c.say({ emoji: '✏️', title: `A ${v.grade}-grade class adopted ${a.name}!`, text: `They’re learning all about ${c.sp(a)}s this month and sent ${v.kids} drawings. The keepers hung them by the habitat.`, animal: a.id }); return { wait: 24 + c.r() * 30 }; },
      (c, v) => {
        const a = c.get(v.a)!;
        const each = pick(c.r, [2, 3, 5]);
        const pay = Number(v.kids) * each;
        c.z.money += pay;
        c.say({ kind: 'vip', emoji: '🐷', title: `The class raised money for ${a.name}!`, text: `Every kid brought coins from home.`, math: [`${v.kids} kids × ${money(each)} = ${money(pay)}`], animal: a.id });
        return { end: true };
      },
    ],
  },
  {
    id: 'science', weight: 1.4, cooldown: 4,
    start: (c, v) => { const a = c.animal((x) => species(x.species).look.body === 'quad' || species(x.species).look.body === 'ape'); if (!a) return false; v.a = a.id; return true; },
    steps: [
      (c, v) => { const a = c.get(v.a)!; c.say({ emoji: '🔬', title: `Scientists are studying ${a.name}`, text: `The Conservation & Research center put a step counter on ${a.name}’s favorite toy. They’ll share the results tomorrow.`, animal: a.id }); return { wait: 18 + c.r() * 10 }; },
      (c, v) => {
        const a = c.get(v.a)!;
        const steps = (2 + Math.floor(c.r() * 9)) * 1000;
        c.say({ emoji: '📊', title: `${a.name} walked ${steps.toLocaleString('en-US')} steps yesterday!`, text: `${species(a.species).fact}`, animal: a.id });
        return { end: true };
      },
    ],
  },
  {
    id: 'rivals', weight: 1.6, cooldown: 4,
    start: (c, v) => {
      const groups = HABITATS.map((h) => c.z.animals.filter((a) => a.habitat === h.id && awakeOk(a))).filter((g) => g.length >= 2);
      if (!groups.length) return false;
      const g = shuffle(pick(c.r, groups), c.r);
      if (g[0].species !== g[1].species && c.r() < 0.5) return false;
      v.a = g[0].id; v.b = g[1].id; v.thing = pick(c.r, ['the sunny rock', 'the best branch', 'the big red ball', 'the cozy corner', 'the spot by the window']);
      return true;
    },
    steps: [
      (c, v) => { const a = c.get(v.a)!, b = c.get(v.b)!; c.say({ emoji: '😤', title: `${a.name} and ${b.name} both want ${v.thing}`, text: `They’ve been pushing and huffing all morning. Should the keepers make a second one (${money(60)}) or let them work it out?`, todo: true, choices: [{ label: `Make another (${money(60)})`, cost: 60 }, { label: 'Let them work it out' }] }); },
      (c, v, ch) => {
        const a = c.get(v.a)!, b = c.get(v.b)!;
        if (ch === 0) { a.mood = Math.min(100, a.mood + 10); b.mood = Math.min(100, b.mood + 10); c.say({ emoji: '😌', title: 'One each!', text: `Now ${a.name} and ${b.name} each have their own, and they sit side by side.` }); }
        else if (c.r() < 0.5) { c.m.friends[a.id] = b.id; c.m.friends[b.id] = a.id; c.say({ emoji: '🤝', title: `${a.name} and ${b.name} decided to share`, text: `And now they’re best friends. Who knew?` }); }
        else c.say({ emoji: '🙄', title: `${trait(c.z, a) === 'grumpy' ? a.name : b.name} won, and is very proud`, text: `The other one pretended not to care.` });
        return { end: true };
      },
    ],
  },
  {
    id: 'invention', weight: 1.6, cooldown: 3,
    start: (c, v) => { v.toy = pick(c.r, ['a puzzle feeder', 'a bubble machine', 'a bell on a rope', 'a giant floating ball', 'a scent trail of spices', 'a mirror']); const opts = shuffle(EXHIBITS.filter((e) => e.habitats.some((h) => c.z.animals.some((a) => a.habitat === h.id))), c.r).slice(0, 3); if (opts.length < 3) return false; opts.forEach((e, i) => { v[`e${i}`] = e.id; }); return true; },
    steps: [
      (c, v) => { c.say({ emoji: '🧪', title: `Keeper ${c.keeper} invented ${v.toy}!`, text: 'Which animals should try it first?', todo: true, choices: [0, 1, 2].map((i) => ({ label: EXHIBITS.find((e) => e.id === v[`e${i}`])!.name })) }); },
      (c, v, ch) => {
        const e = EXHIBITS.find((x) => x.id === v[`e${ch}`])!;
        const list = c.z.animals.filter((a) => e.habitats.some((h) => h.id === a.habitat) && awakeOk(a));
        const a = pick(c.r, list);
        for (const x of list) x.mood = Math.min(100, x.mood + 10);
        happen(c.z, `Trying ${v.toy}`, '🧪', e.at, 4);
        c.say({ emoji: '🎉', title: a ? `${a.name} loved ${v.toy}!` : 'They loved it!', text: a ? one(c.r, `${a.name} played with it for two hours straight.`, `${a.name} was scared of it for five minutes, then wouldn’t let anyone else have a turn.`, `${a.name} figured out a way to use it the keepers never imagined.`) : '', animal: a?.id });
        return { end: true };
      },
    ],
  },
  {
    id: 'photo', weight: 1.2, cooldown: 6,
    start: (c, v) => { const list = shuffle(c.z.animals.filter(awakeOk), c.r).slice(0, 3); if (list.length < 3) return false; list.forEach((a, i) => { v[`a${i}`] = a.id; }); return true; },
    steps: [
      (c, v) => { const list = [0, 1, 2].map((i) => c.get(v[`a${i}`])!); c.say({ emoji: '📸', title: one(c.r, 'Pick the zoo’s photo of the week!', 'A photo contest!', 'Which picture goes on the new postcard?'), text: 'Visitors sent in their best pictures. The winner goes on a postcard in the gift shop.', todo: true, choices: list.map((a) => ({ label: `${a.name} ${one(c.r, 'mid-yawn', 'mid-jump', 'with a leaf on their head', 'looking right at the camera', 'upside down')}` })) }); },
      (c, v, ch) => { const a = c.get(v[`a${ch}`])!; const n = 30 + Math.floor(c.r() * 40); c.z.money += n * 3; c.say({ emoji: '💌', title: `${a.name}’s postcard is a hit!`, text: 'They’re flying off the shelf.', math: [`${n} postcards × $3 = ${money(n * 3)}`], animal: a.id }); return { end: true }; },
    ],
  },
  {
    id: 'question', weight: 2, cooldown: 1,
    when: (c) => c.open,
    start: (c, v) => {
      const all = [...new Set(c.z.animals.map((a) => a.species))];
      const sp = species(pick(c.r, all));
      const wrong = shuffle(all.filter((s) => s !== sp.id), c.r).slice(0, 2);
      v.sp = sp.id; v.w0 = wrong[0]; v.w1 = wrong[1]; v.right = Math.floor(c.r() * 3);
      v.kid = pick(c.r, ['a girl in a dinosaur shirt', 'a boy with a balloon', 'a kid on her dad’s shoulders', 'a boy holding a map', 'a girl with a butterfly painted on her face']);
      return true;
    },
    steps: [
      (c, v) => {
        const sp = species(String(v.sp));
        // Hide every word of its name, so the question doesn't give the answer away.
        let fact = sp.fact;
        for (const w of sp.name.split(/[\s-]+/)) {
          const word = w.replace(/[^a-z]/gi, '');
          if (word.length >= 3) fact = fact.replace(new RegExp(`\\b${word}\\w*`, 'gi'), '___');
        }
        fact = fact.replace(/___([\s-]+___)+/g, '___');
        const opts = [String(v.w0), String(v.w1)];
        opts.splice(Number(v.right), 0, sp.id);
        c.say({ emoji: '🙋', title: `${String(v.kid)[0].toUpperCase()}${String(v.kid).slice(1)} asked a question`, text: `"Which animal is this about?" ${fact}`, todo: true, choices: opts.map((s) => ({ label: `${species(s).emoji} ${species(s).name}` })) });
      },
      (c, v, ch) => {
        const sp = species(String(v.sp));
        if (ch === Number(v.right)) { c.z.money += 20; c.say({ emoji: '⭐', title: `Right, it’s the ${sp.name.toLowerCase()}!`, text: `The kid’s grown-up was so impressed they put ${money(20)} in the donation box.` }); }
        else c.say({ emoji: '🤔', title: `It was the ${sp.name.toLowerCase()}!`, text: sp.fact });
        return { end: true };
      },
    ],
  },
  {
    id: 'visitors-geese', weight: 1, cooldown: 7,
    when: (c) => c.month >= 8 || c.month <= 3,
    start: () => true,
    steps: [
      (c) => { happen(c.z, 'Wild geese on the lagoon', '🪿', [690, 266], 30); c.say({ emoji: '🪿', title: 'Wild visitors!', text: `A flock of ${20 + Math.floor(c.r() * 40)} wild geese landed on the lagoon on their way ${c.month >= 8 ? 'south for the winter' : 'north for the spring'}. They’re not ours, but everyone loves them.` }); return { wait: 30 }; },
      (c) => { c.say({ emoji: '👋', title: 'The geese flew away', text: 'They honked goodbye in a big V over the zoo.' }); return { end: true }; },
    ],
  },
  {
    id: 'storm-tree', weight: 1, cooldown: 6,
    when: (c) => c.z.weather === 'storm' || c.z.weather === 'rain',
    start: (c, v) => { v.where = pick(c.r, ['the path by the carousel', 'the path to the lions', 'the train track by Kenefick Station', 'the walkway to the aviary']); return true; },
    steps: [
      (c, v) => { c.say({ emoji: '🌳', title: `The storm knocked a tree down on ${v.where}!`, text: 'Nobody got hurt. Clearing it costs money, or the keepers can do it slowly for free over a few days.', todo: true, choices: [{ label: `Clear it now (${money(150)})`, cost: 150 }, { label: 'Keepers will do it slowly' }] }); },
      (c, v, ch) => {
        if (ch === 0) { c.say({ emoji: '🪚', title: 'All cleared!', text: 'The tree crew turned it into wood chips for the animals’ beds.' }); return { end: true }; }
        buzz(c.z, -0.1, 48, 'the fallen tree');
        c.say({ emoji: '🚧', title: `${String(v.where)[0].toUpperCase()}${String(v.where).slice(1)} is closed for now`, text: 'A few visitors grumbled about the detour.' });
        return { wait: 40 };
      },
      (c) => { c.say({ emoji: '🪵', title: 'The keepers finished clearing the tree', text: 'The red pandas got some of the branches to climb on.' }); return { end: true }; },
    ],
  },
  {
    id: 'festival', weight: 1.2, cooldown: 10,
    when: (c) => c.m.level >= 3,
    start: (c, v) => { v.kind = pick(c.r, c.month === 9 ? ['Zoo Boo'] : c.month === 11 ? ['Zoo Lights'] : ['Summer Safari Night', 'Zoo Lights', 'Animal Art Fair', 'Music in the Garden']); return true; },
    steps: [
      (c, v) => { c.say({ emoji: '🎪', title: `Let’s throw a festival: ${v.kind}!`, text: `Decorations and music cost ${money(400)}. The planners think about 300 extra people would come, at ${money(c.z.price)} each.`, math: [`300 × ${money(c.z.price)} = ${money(300 * c.z.price)}`, `${money(300 * c.z.price)} − ${money(400)} = ${money(300 * c.z.price - 400)}`], todo: true, choices: [{ label: `Let’s do it! (${money(400)})`, cost: 400 }, { label: 'Maybe next time' }] }); },
      (c, v, ch) => {
        if (ch !== 0) { c.say({ emoji: '🗓️', title: 'The festival will wait', text: 'The planners saved their notes for later.' }); return { end: true }; }
        c.say({ emoji: '🛠️', title: `Getting ready for ${v.kind}`, text: 'Keepers are hanging lights and the band is practicing.' });
        return { wait: 18 };
      },
      (c, v) => {
        const extra = 260 + Math.floor(c.r() * 100);
        c.z.money += extra * c.z.price; c.z.today.visitors += extra;
        happen(c.z, String(v.kind), '🎪', placeAt('entrance'), 12);
        addFame(c.z, 200);
        c.say({ kind: 'vip', emoji: '🎆', title: `${v.kind} was a hit!`, text: 'The whole zoo glowed and everyone danced.', math: [`${extra} extra visitors × ${money(c.z.price)} = ${money(extra * c.z.price)}`] });
        return { end: true };
      },
    ],
  },
  {
    id: 'keeper', weight: 1.4, cooldown: 4,
    start: (c, v) => { v.k = pick(c.r, c.m.keepers); const a = c.animal(); if (!a) return false; v.a = a.id; return true; },
    steps: [
      (c, v) => {
        const a = c.get(v.a)!;
        const k = String(v.k);
        c.say({ emoji: '🧑‍🌾', title: one(c.r, `It’s Keeper ${k}’s birthday!`, `Keeper ${k} has worked at the zoo for ${2 + Math.floor(c.r() * 18)} years today`, `Keeper ${k} is training a new keeper`), text: `${a.name} the ${c.sp(a)} is ${k}’s favorite. Should the zoo do something nice?`, todo: true, choices: [{ label: `A cake for the keepers (${money(30)})`, cost: 30 }, { label: `A card from ${a.name}` }] });
      },
      (c, v, ch) => { const a = c.get(v.a)!; for (const x of c.z.animals) x.mood = Math.min(100, x.mood + (ch === 0 ? 3 : 1)); c.say({ emoji: ch === 0 ? '🎂' : '💌', title: ch === 0 ? 'Cake for the keepers!' : `${a.name} "signed" the card`, text: ch === 0 ? 'Happy keepers take extra good care of everyone.' : `With a muddy footprint. ${v.k} put it on the fridge.`, animal: a.id }); return { end: true }; },
    ],
  },
  {
    id: 'swap', weight: 0.8, cooldown: 12,
    when: (c) => c.m.level >= 1,
    start: (c, v) => {
      const groups = HABITATS.map((h) => c.z.animals.filter((a) => a.habitat === h.id && awakeOk(a) && species(a.species).star >= 3)).filter((g) => g.length >= 3);
      if (!groups.length) return false;
      const a = pick(c.r, pick(c.r, groups));
      v.a = a.id; v.zoo = pick(c.r, ['the Denver Zoo', 'the San Diego Zoo', 'the Columbus Zoo', 'the Saint Louis Zoo', 'the Houston Zoo']);
      return true;
    },
    steps: [
      (c, v) => { const a = c.get(v.a)!; c.say({ emoji: '✈️', title: `${v.zoo} wants to borrow ${a.name}`, text: `They want ${a.name} the ${c.sp(a)} to visit for a while and meet their ${c.sp(a)}s. It helps keep ${c.sp(a)}s healthy all over the world. ${a.name} would come back with stories!`, todo: true, choices: [{ label: 'Bon voyage!' }, { label: 'We’d miss them too much' }] }); },
      (c, v, ch) => {
        const a = c.get(v.a)!;
        if (ch !== 0) { c.say({ emoji: '🏡', title: `${a.name} is staying home`, text: `${v.zoo} said they understood.` }); return { end: true }; }
        v.home = a.habitat;
        a.habitat = '__away';
        addFame(c.z, 150);
        c.say({ emoji: '🚚', title: `${a.name} is off to ${v.zoo}!`, text: 'The keepers packed a crate with a favorite blanket and some snacks for the trip.' });
        return { wait: 48 + c.r() * 48 };
      },
      (c, v) => {
        const a = c.get(v.a)!;
        a.habitat = String(v.home);
        a.mood = 95;
        const baby = c.r() < 0.4;
        c.say({ emoji: '🏠', title: `${a.name} is back from ${v.zoo}!`, text: baby ? `And guess what: there’s a new baby ${c.sp(a)} at ${v.zoo}, and it’s ${a.name}’s! They sent a photo.` : `${a.name} sniffed every corner of home and then took a very long nap.`, animal: a.id });
        return { end: true };
      },
    ],
  },
  {
    id: 'admirer', weight: 1, cooldown: 10,
    when: (c) => c.open,
    start: (c, v) => { const a = c.animal((x) => species(x.species).star >= 4); if (!a) return false; v.a = a.id; v.who = pick(c.r, ['a little boy who comes with his grandpa', 'a girl from the third-grade class', 'Keeper ' + pick(c.r, c.m.keepers), 'a mail carrier on her lunch break']); return true; },
    steps: [
      (c, v) => { const a = c.get(v.a)!; c.say({ emoji: '🌷', title: `A mystery: flowers for ${a.name}`, text: `Someone left a tiny bunch of flowers by ${a.name}’s window this morning. No note.`, animal: a.id }); return { wait: 20 + c.r() * 8 }; },
      (c, v) => { const a = c.get(v.a)!; c.say({ emoji: '💐', title: `More flowers for ${a.name}!`, text: 'And a drawing of a heart this time. Who could it be?', animal: a.id }); return { wait: 20 + c.r() * 8 }; },
      (c, v) => { const a = c.get(v.a)!; c.say({ emoji: '🥰', title: `The secret admirer is…`, text: `${String(v.who)[0].toUpperCase()}${String(v.who).slice(1)}! They said ${a.name} is their favorite animal in the whole world.`, animal: a.id }); return { end: true }; },
    ],
  },
  {
    id: 'babysteps', weight: 2, cooldown: 1,
    start: (c, v) => { const b = c.animal((x) => x.born !== undefined && Boolean(x.name)); if (!b) return false; v.b = b.id; return true; },
    steps: [
      (c, v) => {
        const b = c.get(v.b)!;
        const sp = species(b.species);
        const first = sp.swims ? 'first swim' : sp.flies ? 'first flutter' : sp.climbs ? 'first climb' : 'first wobbly run';
        happen(c.z, `${b.name}’s ${first}`, '🍼', spot(b.habitat), 3);
        c.say({ emoji: '🍼', title: `${b.name} had their ${first}!`, text: one(c.r, `Visitors cheered so loudly that ${b.name} got startled and then tried again.`, `The whole family watched. ${b.name} looked very proud.`), animal: b.id });
        return { end: true };
      },
    ],
  },
];

// ---------- Running the stories ----------

function context(z: Zoo, r: () => number): Ctx {
  const m = memory(z);
  const hour = hourOf(z.clock);
  const ok = z.animals.filter(awakeOk);
  return {
    z, r, m, hour,
    open: hour >= 9 && hour < 17, night: hour < 6 || hour >= 20, month: new Date().getMonth(),
    keeper: pick(r, m.keepers),
    say: (e) => note(z, { kind: 'story', ...e }),
    animal: (f) => { const list = f ? ok.filter(f) : ok; return list.length ? pick(r, list) : null; },
    get: (id) => z.animals.find((a) => a.id === id) ?? null,
    sp: (a) => species(a.species).name.toLowerCase(),
  };
}

function runStep(z: Zoo, arc: Arc, r: () => number, choice: number) {
  const recipe = RECIPES.find((x) => x.id === arc.recipe);
  if (!recipe || arc.step >= recipe.steps.length) { z.arcs = z.arcs!.filter((a) => a !== arc); return; }
  const c = context(z, r);
  const before = z.seq;
  let out: Out | void;
  try { out = recipe.steps[arc.step](c, arc.vars, choice); } catch { out = { end: true }; }
  arc.step++;
  // A step that asked something waits for the answer.
  const asked = z.events.find((e) => Number(e.id.slice(1)) > before && e.choices?.length);
  if (asked) { asked.arc = arc.id; arc.wait = asked.id; }
  else arc.wait = null;
  if (out?.end || (arc.step >= recipe.steps.length && !arc.wait)) { z.arcs = z.arcs!.filter((a) => a !== arc); return; }
  arc.next = z.clock + (out?.wait ?? 0) * 60;
}

/** Once an hour: move the stories along, and maybe start a new one. */
export function storyHour(z: Zoo, r: () => number, away: boolean) {
  const m = memory(z);
  // Stories waiting on an answer for two days: the keepers decide (the second choice).
  for (const arc of [...z.arcs!]) {
    if (arc.wait) {
      const e = z.events.find((x) => x.id === arc.wait);
      if (!e || e.done) { arc.wait = null; continue; }
      if (z.clock - e.at > 2 * DAY && e.choices) { e.done = true; e.picked = e.choices.length > 1 ? 1 : 0; arc.wait = null; runStep(z, arc, r, e.picked); }
      continue;
    }
    if (arc.next <= z.clock) runStep(z, arc, r, -1);
  }
  if (z.happening && z.happening.until < z.clock) z.happening = null;
  // A new story now and then: more often while the zoo's open, never too many at once.
  const h = hourOf(z.clock);
  const open = h >= 9 && h < 17;
  if (z.arcs!.length >= 3 || todos(z).length >= 4) return;
  if (r() > (open ? 0.2 : 0.07) * (away ? 0.6 : 1)) return;
  const c = context(z, r);
  // Fresh stories first: the more often one's happened, the less likely it comes up.
  const pool = RECIPES.filter((x) => !z.arcs!.some((a) => a.recipe === x.id) && (m.last[x.id] === undefined || z.clock - m.last[x.id] > x.cooldown * DAY) && (!x.when || x.when(c)));
  const w = pool.map((x) => x.weight / Math.pow(1 + (m.done[x.id] ?? 0), 0.8) * (m.done[x.id] ? 1 : 1.6));
  let roll = r() * w.reduce((s, x) => s + x, 0);
  for (let i = 0; i < pool.length; i++) {
    roll -= w[i];
    if (roll > 0) continue;
    const recipe = pool[i];
    const arc: Arc = { id: `s${++z.seq}`, recipe: recipe.id, step: 0, next: z.clock, wait: null, vars: {}, started: z.clock };
    if (!recipe.start(c, arc.vars)) return;
    m.done[recipe.id] = (m.done[recipe.id] ?? 0) + 1;
    m.last[recipe.id] = z.clock;
    z.arcs!.push(arc);
    runStep(z, arc, r, -1);
    return;
  }
}

/** The girls picked an answer to a story's question. */
export function choose(z: Zoo, eventId: string, i: number, r: () => number) {
  const e = z.events.find((x) => x.id === eventId);
  if (!e?.choices || e.done) return false;
  const c = e.choices[i];
  if (!c) return false;
  if (c.cost) {
    if (z.money < c.cost) return false;
    z.money -= c.cost;
    z.today.spent += c.cost;
  }
  e.done = true;
  e.picked = i;
  // A nickname for an escape artist.
  if (e.arc?.startsWith('nick:')) { memory(z).nicknames[e.arc.slice(5)] = c.label; note(z, { kind: 'story', emoji: '🎩', title: `Meet ${z.animals.find((a) => a.id === e.arc!.slice(5))?.name}, "${c.label}"`, text: 'The keepers made a little sign. Visitors love it.' }); return true; }
  const arc = z.arcs?.find((a) => a.id === e.arc);
  if (arc) { arc.wait = null; runStep(z, arc, r, i); }
  return true;
}

export const RECIPE_IDS = RECIPES.map((x) => x.id);
export function startStory(z: Zoo, id: string, r: () => number) {
  const recipe = RECIPES.find((x) => x.id === id);
  if (!recipe) return false;
  const arc: Arc = { id: `s${++z.seq}`, recipe: id, step: 0, next: z.clock, wait: null, vars: {}, started: z.clock };
  if (!recipe.start(context(z, r), arc.vars)) return false;
  z.arcs = [...(z.arcs ?? []), arc];
  runStep(z, arc, r, -1);
  return true;
}
