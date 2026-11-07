import { place } from './map';
import { awake, species } from './species';
import { hourOf, money, note, type Animal, type Zoo, type ZooEvent } from './sim';
import { addFame, memory } from './stories';

/**
 * Two things you do as yourself, not as the owner at a desk: eat lunch at the zoo's
 * restaurants, and take a small animal out for a walk.
 *
 * A walk is an animal encounter, the way real zoos do them: a keeper carries a lemur
 * or walks a penguin through the crowd, and the family that gets to meet one up close
 * remembers it. Here they come back another day and buy tickets again, so every
 * encounter shows its sum (who's coming back, times the ticket), and the zoo gets a
 * little more famous for them. An animal can only meet so many people before it's
 * tired and wants to go home.
 */

// ---------- Walks ----------

/** Carried in your arms, on your shoulder (the birds), or walking beside you on a leash. */
export type HoldStyle = 'arms' | 'shoulder' | 'leash';
const STYLE: Record<string, HoldStyle> = {
  lemur: 'arms', ruffedlemur: 'arms', sloth: 'arms', echidna: 'arms',
  macaw: 'shoulder', budgie: 'shoulder', owl: 'shoulder',
  penguin: 'leash', goat: 'leash',
};
/** How many people an animal meets on one walk before it's had enough. */
export const MEET_MAX = 6;

/** Whether you can take this one out for a walk right now, and how; or why not. */
export function holdStyle(z: Zoo, a: Animal): { style: HoldStyle } | { no: string } {
  const style = STYLE[a.species];
  const sp = species(a.species);
  if (!style || !sp) return { no: `${cap(sp?.many ?? 'they')} stay in their home. Keepers only take small, calm animals out to meet people.` };
  if (a.sick) return { no: `${a.name} isn’t feeling well. Rest first, walks later.` };
  if (a.expecting) return { no: `${a.name} is going to be a mom. She’d rather stay home.` };
  if (a.born !== undefined) return { no: `${a.name} is too little to leave mom.` };
  if (!awake(sp, hourOf(z.clock))) return { no: `${a.name} is asleep. Let them sleep!` };
  return { style };
}
export const canWalk = (id: string) => id in STYLE;

const KIDS = ['Ava', 'Leo', 'Maya', 'Eli', 'Ruby', 'Theo', 'June', 'Finn', 'Isla', 'Milo', 'Hazel', 'Owen', 'Luna', 'Jack', 'Nora', 'Sam', 'Quinn', 'Rosa', 'Kai', 'Ivy', 'Ezra', 'Pearl', 'Arlo', 'Wren'];
/** Grown-ups, as the headline says them and as a sentence does. */
const GROWNUPS: Record<string, [string, string][]> = {
  teen: [['A big sister', 'the big sister'], ['A teenager with headphones', 'the teenager'], ['A girl on a school trip', 'the girl'], ['A boy on a school trip', 'the boy']],
  adult: [['A dad with a stroller', 'the dad'], ['A mom with a backpack', 'the mom'], ['A man in a Huskers hat', 'the man in the Huskers hat'], ['A lady in a sun hat', 'the lady'], ['A zookeeper from another zoo', 'the other zookeeper']],
  grand: [['A grandpa', 'the grandpa'], ['A grandma', 'the grandma'], ['Great-grandma Rose', 'Great-grandma Rose'], ['A grandpa with a cane', 'the grandpa']],
};

/**
 * One of a list nobody's heard lately: remembered by which line it was, not its words,
 * so the same moment with a different kid's name still counts as heard.
 */
function freshPick<T>(z: Zoo, r: () => number, key: string, list: T[]): T {
  const m = memory(z);
  const unused = list.map((_, i) => i).filter((i) => !m.said.includes(`${key}${i}`));
  const i = pick(unused.length ? unused : list.map((_, k) => k), r);
  m.said.push(`${key}${i}`);
  if (m.said.length > 80) m.said.shift();
  return list[i];
}

/** What meeting an animal looks like, by how you're holding it. */
function moment(z: Zoo, a: Animal, who: string, kid: boolean, style: HoldStyle, r: () => number): string {
  const sp = species(a.species);
  const n = a.name;
  const coat = sp.look.extras?.includes('spines') ? 'spines (not as pokey as they look)' : 'fur';
  const lines: string[] = style === 'shoulder' ? [
    `${n} hopped down to ${who}’s hand for a second. ${who} didn’t breathe the whole time!`,
    `${n} fluffed up all their feathers at ${who}.`,
    `${who} asked if ${n} can talk. ${n} answered with a loud squawk!`,
    `${n} looked at ${who} with one eye, then the other. That’s how birds look at things!`,
    `${n} bobbed their head up and down at ${who}, and ${who} bobbed back.`,
    `${who} held out a flat hand, and ${n} gave it a careful nibble. Tickly!`,
  ] : style === 'leash' ? [
    `${n} ${a.species === 'penguin' ? 'waddled' : 'trotted'} right up to ${who} and stopped.`,
    `${who} walked next to ${n} for a bit. ${n} didn’t mind at all.`,
    `${n} sniffed ${who}’s shoes very carefully. Very important sniffing.`,
    `${who} got to give ${n} a gentle pat on the back with two fingers, the keeper way.`,
    `${n} sat right down at ${who}’s feet like they’d been friends forever.`,
    a.species === 'penguin' ? `${n} flapped both flippers at ${who}. That means hello in penguin.` : `${n} tried to nibble the string on ${who}’s jacket. Silly goat!`,
  ] : [
    `${who} got to touch ${n}’s ${coat} with two fingers, the keeper way.`,
    `${n} looked right at ${who}, and ${who} looked right back. Neither of them blinked!`,
    `${who} asked a hundred questions about ${sp.many}. You knew the answers!`,
    `${n} held on tight to you and peeked at ${who}. ${who} waved, and ${n} kind of waved back.`,
    `${n} reached out and grabbed ${who}’s finger. ${who} couldn’t stop smiling.`,
    `${who} whispered hello so they wouldn’t scare ${n}. ${n} leaned in to listen.`,
  ];
  const after = kid
    ? [`💡 ${sp.fact}`, `${who} is going to tell everyone at school.`, `${who}’s family took about fifty pictures.`, `“Can we come back and see ${n} again?”`, `${who} wants to be a zookeeper now.`]
    : [`💡 ${sp.fact}`, `${who} took about fifty pictures.`, `“We have to bring the grandkids to see ${n}!”`, `${who} said it made their whole day.`, `${who} asked how you got to be a zookeeper.`];
  // A grown-up is "the grandpa" mid-sentence and "The grandpa" at the start of one.
  return `${freshPick(z, r, `meet:${style}:`, lines)} ${freshPick(z, r, `meet:after:${kid ? 'k' : 'g'}:`, after)}`.replace(/(^|[.!?”] )the /g, (_, p: string) => `${p}The `);
}

/**
 * Someone met the animal you're walking. Their family will come back another day
 * (and buy tickets again), and the zoo gets a little more famous. Past MEET_MAX on one
 * walk, the animal's tired: the meeting doesn't happen, and they'd like to go home.
 */
export function meet(z: Zoo, animalId: string, who: { kind: string; met: number }, style: HoldStyle, r: () => number): ZooEvent | null {
  const a = z.animals.find((x) => x.id === animalId);
  if (!a || who.met >= MEET_MAX) return null;
  const kid = who.kind === 'kid';
  const [name, inText] = kid ? [freshPick(z, r, 'meet:kid:', KIDS), ''] : freshPick(z, r, `meet:${who.kind}:`, GROWNUPS[who.kind] ?? GROWNUPS.adult);
  // A kid's whole family comes back; a grown-up brings one more.
  const people = kid ? 2 + Math.floor(r() * 3) : 2;
  const fans = (z.fans ??= { back: 0, total: 0 });
  fans.back += people;
  fans.total += 1;
  addFame(z, kid ? 8 : 5);
  a.bond = Math.min(100, (a.bond ?? 0) + 1);
  const tired = who.met + 1 >= MEET_MAX;
  if (tired) a.mood = Math.max(5, a.mood - 4);
  return note(z, {
    kind: 'meet', emoji: kid ? '🤩' : '😍', animal: a.id,
    title: `${name} met ${a.name}!`,
    text: moment(z, a, kid ? name : inText, kid, style, r)
      + (tired ? ` ${a.name} is getting tired. Time to take them home!` : ''),
    math: [`${people} people × ${money(z.price)} a ticket = ${money(people * z.price)} when they come back`],
  });
}

/** Families who met an animal come back, a few each morning when the gates open. */
export function fansReturn(z: Zoo): ZooEvent | null {
  const f = z.fans;
  if (!f || f.back <= 0) return null;
  const n = Math.min(f.back, Math.max(2, Math.ceil(f.back / 2)));
  f.back -= n;
  const tickets = n * z.price;
  z.today.visitors += n;
  z.today.tickets += tickets;
  z.money += tickets;
  return note(z, {
    kind: 'meet', emoji: '🔁', title: `${n} people came back to see the animals they met!`,
    text: 'They remembered meeting an animal up close, so they came back again.',
    math: [`${n} people × ${money(z.price)} = ${money(tickets)} in tickets`, `Money now: ${money(z.money)}`],
  });
}

/** Fans make the zoo a little more popular for good: a bit more draw each, up to a fifth more. */
export const fanDraw = (z: Zoo) => Math.min(0.2, (z.fans?.total ?? 0) * 0.002);

// ---------- Lunch ----------

export interface MenuItem { id: string; name: string; emoji: string; price: number }
const I = (id: string, name: string, emoji: string, price: number): MenuItem => ({ id, name, emoji, price });

/** What each place sells: the sit-down restaurants and the snack stands. */
export const MENUS: Record<string, MenuItem[]> = {
  lodge: [I('burger', 'Cheeseburger', '🍔', 6), I('tenders', 'Chicken tenders', '🍗', 6), I('fries', 'Fries', '🍟', 3), I('lemonade', 'Lemonade', '🍋', 3), I('cookie', 'Cookie', '🍪', 2)],
  treetops: [I('pizza', 'Pizza slice', '🍕', 4), I('mac', 'Mac and cheese', '🧀', 5), I('salad', 'Salad', '🥗', 5), I('juice', 'Apple juice', '🧃', 2), I('brownie', 'Brownie', '🍫', 3)],
  'plaza-cafe': [I('sandwich', 'Sandwich', '🥪', 5), I('pretzel', 'Pretzel', '🥨', 4), I('fruit', 'Fruit cup', '🍓', 3), I('milk', 'Milk', '🥛', 2), I('muffin', 'Muffin', '🧁', 3)],
  glacier: [I('hotdog', 'Hot dog', '🌭', 4), I('corndog', 'Corn dog', '🍢', 4), I('nuggets', 'Fish nuggets', '🐟', 5), I('slushie', 'Blue slushie', '🧊', 3), I('icecream', 'Ice cream', '🍨', 3)],
  yeti: [I('popcorn', 'Popcorn', '🍿', 3), I('cottoncandy', 'Cotton candy', '🍭', 4), I('slushie', 'Slushie', '🧊', 3), I('pretzel', 'Pretzel', '🥨', 4)],
  'orangutan-oasis': [I('cone', 'Ice cream cone', '🍦', 3), I('dots', 'Dippin’ Dots', '🔵', 5), I('popsicle', 'Popsicle', '🧊', 2), I('lemonade', 'Lemonade', '🍋', 3)],
};
/** The ones with tables inside to walk into; the rest are a window you order at. */
export const DINERS = new Set(['lodge', 'treetops', 'plaza-cafe', 'glacier']);

export type Order = Record<string, number>;

/** An order as sums: a line per thing, then adding them up. */
export function orderMath(placeId: string, order: Order): { lines: string[]; total: number } {
  const menu = MENUS[placeId] ?? [];
  const parts = menu.filter((m) => (order[m.id] ?? 0) > 0).map((m) => ({ m, n: order[m.id], sum: order[m.id] * m.price }));
  const total = parts.reduce((s, p) => s + p.sum, 0);
  const lines = parts.map((p) => (p.n === 1 ? `1 ${p.m.name} = ${money(p.sum)}` : `${p.n} × ${money(p.m.price)} = ${money(p.sum)}`));
  if (parts.length > 1) lines.push(`${parts.map((p) => money(p.sum)).join(' + ')} = ${money(total)}`);
  return { lines, total };
}

/** Pay for lunch out of the zoo's money. Null when it costs more than there is. */
export function buyLunch(z: Zoo, placeId: string, order: Order): { event: ZooEvent; food: string[] } | null {
  const { lines, total } = orderMath(placeId, order);
  if (total <= 0 || z.money < total) return null;
  z.money -= total;
  z.today.spent += total;
  const menu = MENUS[placeId] ?? [];
  const food = menu.flatMap((m) => Array.from({ length: order[m.id] ?? 0 }, () => m.emoji));
  const event = note(z, {
    kind: 'math', emoji: food[0] ?? '🍽️', title: `Lunch at ${place(placeId).name}`,
    text: `You bought ${food.length === 1 ? 'one thing' : `${food.length} things`} and paid out of the zoo’s money.`,
    math: [...lines, `${money(z.money + total)} − ${money(total)} = ${money(z.money)} left`],
  });
  return { event, food };
}

const pick = <T,>(list: T[], r: () => number) => list[Math.floor(r() * list.length)];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
