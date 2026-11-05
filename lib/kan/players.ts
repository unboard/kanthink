/**
 * Who's playing Kan City: Kan the mushroom, or one of the girls as herself. Each girl
 * has a look (hair, eyes, height, a favorite shirt) and a coach: what kind of math
 * she's working on and how big the numbers go. A grown-up sets her age and writes
 * notes for Kan; Kan reads the notes into the coach. The zoo sizes every question to
 * whoever is playing.
 *
 * Kept per device, like the zoo itself: it's the family's tablet.
 */

export type Skill = 'add' | 'subtract' | 'times' | 'divide' | 'money';
export const SKILLS: { id: Skill; label: string; emoji: string }[] = [
  { id: 'add', label: 'Adding', emoji: '➕' },
  { id: 'subtract', label: 'Taking away', emoji: '➖' },
  { id: 'times', label: 'Times', emoji: '✖️' },
  { id: 'divide', label: 'Sharing (divide)', emoji: '➗' },
  { id: 'money', label: 'Money & change', emoji: '💵' },
];

export interface Coach {
  skills: Skill[];
  /** The biggest answer a question should ask for. */
  max: number;
  /** Times tables she's practicing; a × question keeps one side on these. */
  tables: number[];
  /** Read each question out loud. */
  readAloud: boolean;
  /** Offer a "how do I do this?" hint before she answers. */
  showHow: boolean;
  /** Kan's own line about what it took from the notes, shown back to the grown-up. */
  said?: string;
}

export type HairStyle = 'down' | 'ponytail' | 'braids';
export interface Kid {
  id: 'scarlett' | 'lennon';
  name: string;
  age: number;
  hair: string;
  eyes: string;
  skin: string;
  /** How far down her back her hair falls when it's down: 'long' is past the shoulders. */
  length: 'long' | 'shoulder';
  style: HairStyle;
  shirt: string;
  pants: string;
  shoes: string;
  /** What the grown-up told Kan about her, word for word. */
  notes: string;
  coach: Coach;
}
export type Who = 'kan' | Kid['id'];
export interface Players { who: Who; kids: Kid[] }

export const SHIRTS = ['#14b8a6', '#ec4899', '#8b5cf6', '#3b82f6', '#f59e0b', '#ef4444', '#22c55e', '#f8fafc'];

/** Where a girl that age usually is, before a grown-up says otherwise. */
export function coachFor(age: number): Coach {
  if (age <= 6) return { skills: ['add', 'subtract'], max: 20, tables: [2, 5, 10], readAloud: true, showHow: true };
  if (age === 7) return { skills: ['add', 'subtract', 'times', 'money'], max: 100, tables: [2, 5, 10], readAloud: true, showHow: true };
  if (age === 8) return { skills: ['add', 'subtract', 'times', 'divide', 'money'], max: 500, tables: [2, 3, 4, 5, 10], readAloud: false, showHow: true };
  if (age === 9) return { skills: ['add', 'subtract', 'times', 'divide', 'money'], max: 1000, tables: [2, 3, 4, 5, 6, 7, 8, 9, 10], readAloud: false, showHow: false };
  return { skills: ['add', 'subtract', 'times', 'divide', 'money'], max: 10000, tables: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], readAloud: false, showHow: false };
}

export const KIDS: Kid[] = [
  { id: 'scarlett', name: 'Scarlett', age: 9, hair: '#e3c27e', eyes: '#3d84c6', skin: '#f6d5c0', length: 'long', style: 'down', shirt: '#14b8a6', pants: '#3b5b8c', shoes: '#f5f5f4', notes: '', coach: coachFor(9) },
  { id: 'lennon', name: 'Lennon', age: 7, hair: '#5b3a22', eyes: '#8a7a3e', skin: '#efc9ad', length: 'shoulder', style: 'down', shirt: '#ec4899', pants: '#6d28d9', shoes: '#f5f5f4', notes: '', coach: coachFor(7) },
];

/** About how tall a girl is at that age, in meters (the zoo's units). */
export const heightAt = (age: number) => Math.min(1.6, Math.max(1.0, 0.78 + age * 0.062));

const KEY = 'kan-players-v1';

export function loadPlayers(): Players {
  const fresh: Players = { who: 'kan', kids: KIDS.map((k) => ({ ...k, coach: { ...k.coach } })) };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Players> | null;
    if (!raw) return fresh;
    const kids = fresh.kids.map((k) => {
      const saved = raw.kids?.find((x) => x.id === k.id);
      return saved ? { ...k, ...saved, coach: parseCoach(saved.coach, coachFor(saved.age ?? k.age)) } : k;
    });
    const who = raw.who === 'kan' || kids.some((k) => k.id === raw.who) ? raw.who! : 'kan';
    return { who, kids };
  } catch { return fresh; }
}

export function savePlayers(p: Players) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* private window: it just won't keep */ }
  for (const f of listeners) f(p);
}

const listeners = new Set<(p: Players) => void>();
/** Hear about a switch of player or a change to someone's look, from anywhere in the city. */
export function onPlayers(f: (p: Players) => void) { listeners.add(f); return () => { listeners.delete(f); }; }

export const playing = (p: Players): Kid | null => p.kids.find((k) => k.id === p.who) ?? null;

/** A coach from anywhere (saved, or Kan's read of the notes), kept to sensible values. */
export function parseCoach(raw: unknown, fallback: Coach): Coach {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const skills = Array.isArray(r.skills) ? r.skills.filter((s): s is Skill => SKILLS.some((x) => x.id === s)) : fallback.skills;
  const tables = Array.isArray(r.tables) ? [...new Set(r.tables.map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 12))].sort((a, b) => a - b) : fallback.tables;
  const max = Number(r.max);
  return {
    skills: skills.length ? skills : fallback.skills,
    max: Number.isFinite(max) ? Math.round(Math.min(100000, Math.max(10, max))) : fallback.max,
    tables: tables.length ? tables : fallback.tables,
    readAloud: typeof r.readAloud === 'boolean' ? r.readAloud : fallback.readAloud,
    showHow: typeof r.showHow === 'boolean' ? r.showHow : fallback.showHow,
    said: typeof r.said === 'string' ? r.said.slice(0, 300) : fallback.said,
  };
}

/**
 * Whether a sum is the right size for her: she's working on that kind of math, the
 * answer isn't bigger than she can handle, and a times question keeps one side on a
 * table she's practicing.
 */
export function fits(c: Coach, op: '+' | '−' | '×' | '÷', a: number, b: number, answer: number) {
  const skill: Skill = op === '+' ? 'add' : op === '−' ? 'subtract' : op === '×' ? 'times' : 'divide';
  if (!c.skills.includes(skill)) return false;
  if (Math.max(a, b, answer) > c.max) return false;
  if (op === '×') {
    // Younger: both sides small. Once the numbers go to 500 or more, the other side can be
    // as big as she likes (37 × 8), as long as the answer fits.
    const other = c.max >= 500 ? Infinity : Math.max(10, ...c.tables);
    return (c.tables.includes(a) && b <= other) || (c.tables.includes(b) && a <= other) || (c.tables.includes(10) && (a % 10 === 0 || b % 10 === 0) && Math.min(a, b) <= Math.max(...c.tables));
  }
  if (op === '÷') return c.tables.includes(b) || c.tables.includes(answer);
  return true;
}

/** A nudge for how to work out a sum ("9 kids × $8"), the way a teacher would say it. */
export function howTo(sum: string): string {
  const [a = 0, b = 0] = (sum.match(/[\d,]+/g) ?? []).map((x) => Number(x.replace(/,/g, '')));
  if (sum.includes('×')) {
    if (b === 10 || a === 10) return `Times 10 is easy: put a 0 on the end of the other number.`;
    if (b % 10 === 0 && b > 10) return `Do ${a} × ${b / 10} first, then put a 0 on the end.`;
    if (a % 10 === 0 && a > 10) return `Do ${a / 10} × ${b} first, then put a 0 on the end.`;
    const small = Math.min(a, b), big = Math.max(a, b);
    if (small === 1) return `One group of ${big} is just ${big}.`;
    if (small === 2) return `Two of them is a double: ${big} + ${big}.`;
    if (small <= 5) return `Count by ${big}s, ${small} times: ${Array.from({ length: small - 1 }, (_, i) => big * (i + 1)).join(', ')}${small > 1 ? ', …' : '…'}`;
    const part = big > 5 ? 5 : 2;
    return `Break it up: ${small} × ${part} = ${small * part}, then ${small} × ${big - part} more, and add them.`;
  }
  if (sum.includes('÷')) return `How many ${b}s fit into ${a}? Count by ${b}s until you get to ${a}.`;
  if (sum.includes('−')) return `Start at ${b} and count up to ${a}. How far did you go?`;
  if (sum.includes('+')) return `Add the tens first, then the ones, then put them together.`;
  return `Read it again slowly, and find the two numbers that matter.`;
}

/** Say it out loud, if the device can. */
export function readAloud(text: string) {
  try {
    if (typeof speechSynthesis === 'undefined') return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/×/g, ' times ').replace(/÷/g, ' divided by ').replace(/−/g, ' minus ').replace(/= \?/g, 'equals what?'));
    u.rate = 0.92;
    speechSynthesis.speak(u);
  } catch { /* no voice here */ }
}
