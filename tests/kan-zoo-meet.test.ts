import { describe, expect, it } from 'vitest';
import { DAY, OPEN, advance, catchLoose, heal, nameBaby, newZoo, seeded, todos, type ZooEvent } from '@/lib/kan/zoo/sim';
import { choose } from '@/lib/kan/zoo/stories';
import { MEET_MAX, MENUS, buyLunch, fansReturn, holdStyle, meet, orderMath } from '@/lib/kan/zoo/meet';

/** Every sum the girls read: a × b = c and a ÷ b = c must be true, and never padding like "1 day × 24 hours". */
function checkSums(events: ZooEvent[]) {
  const num = (s: string) => Number(s.replace(/[$,]/g, ''));
  for (const e of events) for (const line of e.math ?? []) {
    expect(line).not.toMatch(/thousand|hours/);
    const m = line.match(/(\$?[\d,]+)\s*[^\d$]*?\s*([×÷])\s*(\$?[\d,]+)[^=]*=\s*(\$?[\d,]+)/);
    if (!m) continue;
    const [a, op, b, c] = [num(m[1]), m[2], num(m[3]), num(m[4])];
    expect(a > 1 && b > 1, line).toBe(true);
    expect(op === '×' ? a * b : a / b, line).toBe(c);
  }
}

describe('kan zoo: walks and lunch', () => {
  it('lets small calm animals out for a walk, and keeps the rest home', () => {
    const z = newZoo(0, seeded(1));
    z.clock = 12 * 60;
    const lemur = z.animals.find((a) => a.species === 'lemur')!;
    const lion = z.animals.find((a) => a.species === 'lion')!;
    expect(holdStyle(z, lemur)).toEqual({ style: 'arms' });
    expect('no' in holdStyle(z, lion)).toBe(true);
    lemur.sick = 'cold';
    expect('no' in holdStyle(z, lemur)).toBe(true);
  });

  it('turns each meeting into fans who come back and buy tickets, until the animal is tired', () => {
    const z = newZoo(0, seeded(2));
    const r = seeded(5);
    const lemur = z.animals.find((a) => a.species === 'lemur')!;
    const evs: ZooEvent[] = [];
    for (let met = 0; met < MEET_MAX; met++) evs.push(meet(z, lemur.id, { kind: met % 2 ? 'kid' : 'grand', met }, 'arms', r)!);
    expect(meet(z, lemur.id, { kind: 'kid', met: MEET_MAX }, 'arms', r)).toBeNull();
    expect(z.fans!.total).toBe(MEET_MAX);
    const back = z.fans!.back;
    expect(back).toBeGreaterThanOrEqual(MEET_MAX * 2);
    expect(evs.at(-1)!.text).toContain('tired');
    // One walk never tells the same moment twice, or meets the same kid twice.
    const firsts = evs.map((e) => e.text.split(/[.!] /)[0].replace(/^\S+/, ''));
    expect(new Set(firsts).size).toBe(evs.length);
    expect(new Set(evs.map((e) => e.title)).size).toBe(evs.length);
    // Grown-ups read as grown-ups: no lowercase "the" starting a sentence.
    for (const e of evs) expect(e.text).not.toMatch(/(^|[.!?] )the /);
    const before = z.money;
    const ev = fansReturn(z)!;
    expect(z.money - before).toBe((back - z.fans!.back) * z.price);
    checkSums([...evs, ev]);
  });

  it('brings the fans back when the gates open', () => {
    const z = newZoo(0, seeded(3));
    z.fans = { back: 6, total: 2 };
    z.clock = DAY + OPEN - 30;
    const evs = advance(z, 60, seeded(4));
    expect(evs.some((e) => e.kind === 'meet')).toBe(true);
    expect(z.fans.back).toBeLessThan(6);
  });

  it('adds up lunch line by line, and won’t spend money the zoo doesn’t have', () => {
    const { lines, total } = orderMath('treetops', { pizza: 2, juice: 1 });
    expect(lines).toEqual(['2 × $4 = $8', '1 Apple juice = $2', '$8 + $2 = $10']);
    expect(total).toBe(10);
    const z = newZoo(0, seeded(4));
    z.money = 9;
    expect(buyLunch(z, 'treetops', { pizza: 2, juice: 1 })).toBeNull();
    z.money = 50;
    const got = buyLunch(z, 'treetops', { pizza: 2, juice: 1 })!;
    expect(z.money).toBe(40);
    expect(got.food).toEqual(['🍕', '🍕', '🧃']);
    for (const id of Object.keys(MENUS)) expect(MENUS[id].length).toBeGreaterThan(2);
  });

  it('writes only sums that are true and worth working out, over a month', () => {
    const z = newZoo(0, seeded(7));
    const r = seeded(70);
    const all: ZooEvent[] = [];
    for (let h = 0; h < 30 * 24; h++) {
      all.push(...advance(z, 60, r));
      for (const e of todos(z)) {
        if (e.choices) choose(z, e.id, Math.floor(r() * e.choices.length), r);
        else if (e.kind === 'escape' && e.animal) catchLoose(z, e.animal, r);
        else if (e.kind === 'sick' && e.animal) heal(z, e.animal);
        else if (e.kind === 'baby' && e.animal) nameBaby(z, e.animal, `Bean ${e.id}`);
      }
    }
    checkSums(all);
  });
});
