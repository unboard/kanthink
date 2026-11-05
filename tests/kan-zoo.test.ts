import { describe, expect, it } from 'vitest';
import { HABITATS, EXHIBITS, PLACES, toPx, toWorld } from '@/lib/kan/zoo/map';
import { SPECIES } from '@/lib/kan/zoo/species';
import { DAY, UPGRADES, advance, answerQuiz, buy, catchLoose, dailyDraw, heal, nameBaby, newZoo, note, plan, question, seeded, setCoach, todos } from '@/lib/kan/zoo/sim';
import { KIDS, coachFor, fits, howTo, parseCoach } from '@/lib/kan/players';
import { choose, escape, memory, startStory } from '@/lib/kan/zoo/stories';
import { CARE, careFor, foodChoices, startPregnancy, weigh } from '@/lib/kan/zoo/care';

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

  it('turns a times sum in the news into a bonus question, and hides its answer until it is solved', () => {
    const z = newZoo(0, seeded(12));
    const e = note(z, { kind: 'vip', emoji: '🎂', title: 'Party', text: '', math: ['9 kids × $8 = $72'] });
    expect(e.quiz?.q).toBe('9 kids × $8 = ?');
    expect(e.quiz?.answer).toBe(72);
    expect(e.quiz?.options).toContain(72);
    expect(new Set(e.quiz?.options).size).toBe(4);
    const before = z.money;
    expect(answerQuiz(z, e.id, 81)).toBe(false);
    expect(answerQuiz(z, e.id, 72)).toBe(true);
    expect(z.money).toBe(before + e.quiz!.reward);
    expect(answerQuiz(z, e.id, 72)).toBeNull();
  });

  it('never gives away the animal in the which-animal question', () => {
    for (let i = 0; i < 40; i++) {
      const z = newZoo(0, seeded(20 + i));
      z.clock = 11 * 60;
      expect(startStory(z, 'question', seeded(i))).toBe(true);
      const ask = z.events[0];
      const arc = z.arcs!.find((a) => a.recipe === 'question')!;
      const sp = SPECIES[String(arc.vars.sp)];
      for (const w of sp.name.split(/[\s-]+/)) if (w.replace(/[^a-z]/gi, '').length >= 3) expect(ask.text.toLowerCase()).not.toContain(w.toLowerCase().replace(/[^a-z]/g, ''));
    }
  });

  it('has keeper notes for every animal', () => {
    for (const id of Object.keys(SPECIES)) expect(CARE[id], id).toBeTruthy();
  });

  it('turns a pregnancy into babies when they are due, and names twins one at a time', () => {
    const z = newZoo(0, seeded(3));
    for (const a of z.animals) a.mood = 90;
    expect(startPregnancy(z, seeded(4))).toBe(true);
    const mom = z.animals.find((a) => a.expecting)!;
    mom.expecting!.n = 2;
    const before = z.animals.length;
    advance(z, mom.expecting!.due - z.clock + 61, seeded(5), { away: true });
    expect(mom.expecting).toBeUndefined();
    const babies = z.animals.filter((a) => a.mom === mom.id);
    expect(babies.length).toBe(2);
    expect(z.animals.length).toBeGreaterThanOrEqual(before + 2);
    const e = z.events.find((x) => x.kind === 'baby' && x.todo && !x.done && babies.some((b) => b.id === x.animal))!;
    nameBaby(z, babies[0].id, 'Pip');
    expect(e.done).toBeFalsy();
    expect(e.animal).toBe(babies[1].id);
    nameBaby(z, babies[1].id, 'Pop');
    expect(e.done).toBe(true);
  });

  it('never offers a wrong food that is really the right one', () => {
    for (const sp of Object.values(SPECIES)) {
      const opts = foodChoices(sp, Object.values(SPECIES), seeded(sp.id.length));
      expect(opts.filter((o) => o.right).length).toBe(1);
      expect(opts.length).toBe(3);
      if (sp.id === 'giraffe') expect(opts.some((o) => !o.right && /leaves/.test(o.food))).toBe(false);
    }
  });

  it('counts each kind of care once a day toward the bond, and weighs babies heavier each day', () => {
    const z = newZoo(0, seeded(6));
    const a = z.animals[0];
    expect(careFor(z, a, 'pet')).toBe(true);
    expect(careFor(z, a, 'pet')).toBe(false);
    expect(careFor(z, a, 'feed', false)).toBe(false);
    expect(a.bond).toBe(6);
    const baby = { ...a, id: 'b1', born: z.clock, lb: undefined };
    const w1 = weigh(z, baby);
    z.clock += DAY;
    const w2 = weigh(z, baby);
    expect(w2.was).toBe(w1.n);
    expect(w2.n).toBeGreaterThan(w1.n);
  });

  it('sizes every question to whoever is playing', () => {
    const z = newZoo(0, seeded(11));
    const r = seeded(12);
    const lennon = coachFor(7);
    setCoach(lennon);
    try {
      for (let i = 0; i < 300; i++) {
        const q = question(z, r);
        expect(q.answer, q.q).toBeLessThanOrEqual(lennon.max);
        expect(q.options).toContain(q.answer);
        expect(new Set(q.options).size).toBe(4);
        expect(q.why).not.toContain('÷');
      }
      // 37 kids × $8 is too big for a 7-year-old; the + line under it isn't.
      const hard = note(z, { kind: 'fieldtrip', emoji: '🚌', title: 't', text: '', math: ['37 kids × $8 = $296', '$20 + $30 = $50'] });
      expect(hard.quiz?.q).toBe('$20 + $30 = ?');
      const none = note(z, { kind: 'fieldtrip', emoji: '🚌', title: 't', text: '', math: ['37 kids × $8 = $296'] });
      expect(none.quiz).toBeUndefined();
      setCoach(coachFor(9));
      expect(note(z, { kind: 'fieldtrip', emoji: '🚌', title: 't', text: '', math: ['37 kids × $8 = $296'] }).quiz?.answer).toBe(296);
    } finally { setCoach(null); }
  });

  it('keeps coach settings sane and gives a hint for each kind of sum', () => {
    expect(KIDS.map((k) => k.name)).toEqual(['Scarlett', 'Lennon']);
    const c = parseCoach({ skills: ['times', 'flying'], max: -5, tables: [3, 3, 99, 7], readAloud: 'yes' }, coachFor(7));
    expect(c.skills).toEqual(['times']);
    expect(c.max).toBe(10);
    expect(c.tables).toEqual([3, 7]);
    expect(c.readAloud).toBe(true);
    expect(fits(coachFor(7), '×', 5, 7, 35)).toBe(true);
    expect(fits(coachFor(7), '×', 7, 8, 56)).toBe(false);
    expect(fits(coachFor(7), '÷', 20, 5, 4)).toBe(false);
    for (const sum of ['3 × $8', '40 × $5', '$100 ÷ $5', '$50 − $12', '24 + 13']) expect(howTo(sum).length).toBeGreaterThan(10);
  });
});
