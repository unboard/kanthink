import { describe, expect, it } from 'vitest';
import { HABITATS, EXHIBITS, PLACES, toPx, toWorld } from '@/lib/kan/zoo/map';
import { SPECIES } from '@/lib/kan/zoo/species';
import { DAY, UPGRADES, advance, buy, catchLoose, dailyDraw, heal, nameBaby, newZoo, plan, question, seeded, todos } from '@/lib/kan/zoo/sim';
import { choose, escape, memory, startStory } from '@/lib/kan/zoo/stories';

describe('kan zoo', () => {
  it('lays out every habitat with animals that exist', () => {
    for (const h of HABITATS) for (const a of h.animals) expect(SPECIES[a.species], `${h.id} → ${a.species}`).toBeTruthy();
    for (const u of UPGRADES) {
      if (u.exhibit) expect(EXHIBITS.some((e) => e.id === u.exhibit), u.id).toBe(true);
      if (u.adds) expect(HABITATS.some((h) => h.id === u.adds!.habitat), u.id).toBe(true);
      if (u.after) expect(UPGRADES.some((x) => x.id === u.after), u.id).toBe(true);
    }
    expect(new Set(HABITATS.map((h) => h.id)).size).toBe(HABITATS.length);
    expect(PLACES.find((p) => p.id === 'entrance')).toBeTruthy();
    const w = toWorld([700, 880]);
    const back = toPx(w.x, w.z);
    expect(back[0]).toBeCloseTo(700);
    expect(back[1]).toBeCloseTo(880);
  });

  it('starts with $500, a welcome, and visitors at a fair price', () => {
    const z = newZoo(0, seeded(1));
    expect(z.money).toBe(500);
    expect(z.animals.length).toBeGreaterThan(150);
    expect(z.events[0].kind).toBe('welcome');
    // About a hundred-something visitors a day at $5, like the girls' own math.
    const draw = dailyDraw(z);
    expect(draw).toBeGreaterThan(80);
    expect(draw).toBeLessThan(300);
  });

  it('runs a week: money in at the gate, breakfast out, reports with the sums, and never too much drama at once', () => {
    const z = newZoo(0, seeded(7));
    const r = seeded(42);
    for (let d = 0; d < 7; d++) {
      advance(z, DAY, r);
      expect(todos(z).length).toBeLessThanOrEqual(6);
      expect(Number.isFinite(z.money)).toBe(true);
    }
    expect(z.reports.length).toBe(7);
    const rep = z.events.find((e) => e.kind === 'report');
    expect(rep?.math?.[0]).toMatch(/visitors × \$5 = \$/);
    const bill = z.events.find((e) => e.kind === 'bills');
    expect(bill?.math?.[0]).toMatch(/animals × \$2 each = \$/);
    expect(z.money).toBeGreaterThan(500);
    // Only small, quick animals ever get out.
    for (const a of z.animals.filter((x) => x.loose)) expect(SPECIES[a.species].sneaky).toBe(true);
  });

  it('brings an escaped animal home and closes the to-do', () => {
    const z = newZoo(0, seeded(3));
    const lemur = z.animals.find((a) => a.species === 'lemur')!;
    lemur.loose = [500, 500];
    z.events.unshift({ id: 'e999', at: 0, kind: 'escape', emoji: '🚨', title: 'x', text: 'x', animal: lemur.id, todo: true });
    catchLoose(z, lemur.id);
    expect(lemur.loose).toBeUndefined();
    expect(z.events.find((e) => e.id === 'e999')?.done).toBe(true);
  });

  it('writes out a saving-up plan the way a kid would work it', () => {
    const z = newZoo(0, seeded(5));
    z.money = 200;
    const p = plan(z, 1000);
    expect(p.need).toBe(800);
    expect(p.lines.join('\n')).toContain('$1,000 − $200 = $800 more to go.');
    expect(p.lines.some((l) => /× \$5 = \$/.test(l))).toBe(true);
    expect(p.visitors).toBe(160);
  });

  it('buys a thing: costs the money, brings any new animals', () => {
    const z = newZoo(0, seeded(9));
    z.money = 5000;
    const before = z.animals.filter((a) => a.species === 'penguin').length;
    expect(buy(z, 'more-penguins', seeded(1))).toBe(true);
    expect(z.money).toBe(3800);
    expect(z.animals.filter((a) => a.species === 'penguin').length).toBe(before + 4);
    expect(buy(z, 'more-penguins', seeded(1))).toBe(false);
    // Needs the pool first.
    expect(buy(z, 'baby-elephant', seeded(1))).toBe(false);
  });

  it('asks math questions whose answer is one of the choices', () => {
    const z = newZoo(0, seeded(11));
    const r = seeded(2);
    for (let i = 0; i < 60; i++) {
      const q = question(z, r);
      expect(q.options).toContain(q.answer);
      expect(new Set(q.options).size).toBe(q.options.length);
      expect(Number.isInteger(q.answer)).toBe(true);
    }
  });

  it('tells many different stories over a month, and rarely the same thing twice', () => {
    const z = newZoo(0, seeded(3));
    const r = seeded(99);
    const titles: string[] = [];
    for (let h = 0; h < 30 * 24; h++) {
      for (const e of advance(z, 60, r)) if (!['report', 'bills', 'storm', 'fog'].includes(e.kind)) titles.push(e.title);
      for (const e of todos(z)) {
        if (e.choices) choose(z, e.id, Math.floor(r() * e.choices.length), r);
        else if (e.kind === 'escape' && e.animal) catchLoose(z, e.animal, r);
        else if (e.kind === 'sick' && e.animal) heal(z, e.animal);
        else if (e.kind === 'baby' && e.animal) nameBaby(z, e.animal, `Bean ${e.id}`);
      }
    }
    expect(Object.keys(memory(z).done).length).toBeGreaterThanOrEqual(15);
    const counts = new Map<string, number>();
    for (const t of titles) counts.set(t, (counts.get(t) ?? 0) + 1);
    // Nothing the girls read comes up more than a few times in a month.
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(4);
    expect(new Set(titles).size / titles.length).toBeGreaterThan(0.85);
    expect(Number.isFinite(z.money)).toBe(true);
  });

  it('learns from an escape: that habitat is locked for a while, and the next escape is told differently', () => {
    const z = newZoo(0, seeded(4));
    const r = seeded(8);
    expect(escape(z, r)).toBe(true);
    const e = z.events[0];
    const a = z.animals.find((x) => x.id === e.animal)!;
    catchLoose(z, a.id, r);
    expect(memory(z).locks[a.habitat]).toBeGreaterThan(z.clock);
    expect(z.events.some((x) => x.kind === 'learned')).toBe(true);
    for (let i = 0; i < 40; i++) { if (escape(z, r)) { const b = z.events[0]; expect(z.animals.find((x) => x.id === b.animal)!.habitat).not.toBe(a.habitat); catchLoose(z, b.animal!, r); } }
  });

  it('a story asks, waits for the answer, charges for it, and carries on', () => {
    const z = newZoo(0, seeded(5));
    const r = seeded(6);
    z.clock = 10 * 60;
    expect(startStory(z, 'heatwave', r)).toBe(true);
    const ask = z.events[0];
    expect(ask.choices?.length).toBe(2);
    const before = z.money;
    expect(choose(z, ask.id, 0, r)).toBe(true);
    expect(z.money).toBe(before - ask.choices![0].cost!);
    expect(z.events[0].title).toBe('Ice pop day!');
    expect(z.arcs!.length).toBe(0);
  });
});
