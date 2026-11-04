'use client';

import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { BOUNDARY, EXHIBITS, PATHS, PLACES, TRAIN, type Px } from '@/lib/kan/zoo/map';
import { species, awake } from '@/lib/kan/zoo/species';
import { FAME, remembered } from '@/lib/kan/zoo/stories';
import {
  AILMENT_WORD, FENCE_COST, FOOD_PER_ANIMAL, STAR_GIFT, UPGRADES, VET_BILL, canBuy, clockText, dailyDraw, day, hourOf, money, plan, upgrade,
  type Ailment, type Animal, type Question, type Zoo, type ZooEvent,
} from '@/lib/kan/zoo/sim';

/**
 * The zoo's sheets and little games: what happened at the zoo, an exhibit and its
 * animals, the shop with its saving-up plans, the money (and the ticket price), the
 * math helper, naming a baby, a visit from the vet, and the map.
 *
 * Built for two girls of seven and nine: big buttons, plain words, the arithmetic
 * written out in full every time money moves.
 */

export function Sheet({ title, emoji, onClose, children, wide }: { title: string; emoji?: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="absolute inset-0 z-50 flex items-end justify-center bg-neutral-950/50 sm:items-center sm:p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className={`relative max-h-[88vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 text-neutral-900 shadow-2xl sm:rounded-3xl ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'}`}>
        <button onClick={onClose} aria-label="Close" className="absolute right-3 top-3 rounded-full p-2 text-neutral-400 hover:bg-neutral-100"><X className="h-5 w-5" /></button>
        <h3 className="pr-8 text-[20px] font-bold">{emoji && <span className="mr-1.5">{emoji}</span>}{title}</h3>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}

const BTN = 'rounded-full px-4 py-2.5 text-[15px] font-semibold active:scale-95 disabled:opacity-40 disabled:active:scale-100';

export function Bar({ value, color, label }: { value: number; color: string; label: string }) {
  return (
    <span className="flex items-center gap-1 text-[11px] text-neutral-500" title={label}>
      <span className="relative h-2 w-14 overflow-hidden rounded-full bg-neutral-200"><span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.max(4, Math.min(100, value))}%`, background: color }} /></span>
    </span>
  );
}

export function Sums({ lines }: { lines: string[] }) {
  return (
    <div className="mt-2 space-y-0.5 rounded-xl bg-amber-50 px-3 py-2 font-mono text-[13px] text-amber-950">
      {lines.map((l, i) => <p key={i}>{l}</p>)}
    </div>
  );
}

const when = (clock: number) => `Day ${day(clock)} · ${clockText(clock)}`;

// ---------- What happened at the zoo ----------

/**
 * One thing at a time: the most important news, big, with its question or its
 * button. "Next" goes on to the next thing; "All the news" opens the whole list.
 */
export function NewsSheet({ zoo, onClose, onAct, onChoose, onQuiz, title = 'What happened at the zoo' }: {
  zoo: Zoo; onClose: () => void; onAct: (e: ZooEvent) => void; onChoose: (e: ZooEvent, i: number) => void; onQuiz: (e: ZooEvent, value: number) => boolean | null; title?: string;
}) {
  const waiting = (e: ZooEvent) => Boolean((e.todo && !e.done) || (e.quiz && !e.quiz.solved));
  // The order is set when it opens, so answering one doesn't reshuffle the rest.
  const [queue] = useState(() => {
    const first = zoo.events.filter((e) => e.todo && !e.done);
    const sums = zoo.events.filter((e) => !(e.todo && !e.done) && e.quiz && !e.quiz.solved && !e.seen);
    const fresh = zoo.events.filter((e) => !e.seen && !waiting(e));
    return [...first, ...sums, ...fresh].map((e) => e.id);
  });
  const [at, setAt] = useState(0);
  const [focus, setFocus] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const id = focus ?? queue[at] ?? zoo.events[0]?.id;
  const e = zoo.events.find((x) => x.id === id);
  const left = queue.length - at - 1;
  return (
    <Sheet title={all ? 'All the news' : title} emoji="📰" onClose={onClose}>
      {!all && e && <BigCard key={e.id} e={e} money={zoo.money} onAct={onAct} onChoose={onChoose} onQuiz={onQuiz} />}
      {!all && (
        <div className="mt-4 flex gap-2">
          {focus === null && left > 0 && <button onClick={() => setAt(at + 1)} className={`${BTN} flex-1 bg-violet-500 text-white`}>Next ({left} more) ›</button>}
          {focus !== null && <button onClick={() => setFocus(null)} className={`${BTN} flex-1 bg-violet-100 text-violet-900`}>‹ Back</button>}
          <button onClick={() => setAll(true)} className={`${BTN} flex-1 bg-neutral-100 text-neutral-700`}>All the news</button>
        </div>
      )}
      {all && (
        <>
          <div className="space-y-1.5">
            {zoo.events.slice(0, 50).map((x) => (
              <button key={x.id} onClick={() => { setFocus(x.id); setAll(false); }} className={`flex w-full items-center gap-2.5 rounded-2xl px-3 py-2 text-left hover:bg-neutral-100 ${waiting(x) ? 'bg-rose-50' : 'bg-neutral-50'}`}>
                <span className="text-xl">{x.emoji}</span>
                <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{x.title}</span>
                {waiting(x) && <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[11px] font-bold text-white">!</span>}
              </button>
            ))}
          </div>
          <button onClick={() => setAll(false)} className={`${BTN} mt-3 w-full bg-neutral-100 text-neutral-700`}>‹ Back</button>
        </>
      )}
    </Sheet>
  );
}

const ACT: Partial<Record<ZooEvent['kind'], string>> = { escape: 'Go find them', sick: 'Call the vet', baby: 'Pick a name', fence: `Fix it (${money(FENCE_COST)})`, lost: 'Go help' };

function BigCard({ e, money: have, onAct, onChoose, onQuiz }: { e: ZooEvent; money: number; onAct: (e: ZooEvent) => void; onChoose: (e: ZooEvent, i: number) => void; onQuiz: (e: ZooEvent, value: number) => boolean | null }) {
  const [said, setSaid] = useState<'right' | 'wrong' | null>(null);
  const q = e.quiz;
  const lines = (e.math ?? []).filter((_, i) => !q || q.solved || i !== q.line);
  return (
    <div className="text-center">
      <p className="text-6xl leading-none">{e.emoji}</p>
      <p className="mt-3 text-[20px] font-bold leading-snug">{e.title}</p>
      {e.text && <p className="mt-1.5 text-[15px] leading-relaxed text-neutral-600">{e.text}</p>}
      {q && !q.solved && (
        <div className="mt-4 rounded-3xl bg-amber-50 px-4 py-4">
          <p className="text-[13px] font-bold uppercase tracking-wider text-amber-700">🧮 Bonus question · win {money(q.reward)}</p>
          <p className="mt-1.5 font-mono text-[22px] font-bold text-amber-950">{q.q}</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {q.options.map((o) => (
              <button key={o} onClick={() => { const r = onQuiz(e, o); setSaid(r ? 'right' : 'wrong'); }} className="rounded-2xl bg-white py-3 text-[20px] font-bold text-amber-950 shadow-sm ring-1 ring-amber-200 active:scale-95">
                {q.dollars ? money(o) : o.toLocaleString('en-US')}
              </button>
            ))}
          </div>
          {said === 'wrong' && <p className="mt-2 text-[14px] font-semibold text-rose-600">Not quite. Try again!</p>}
        </div>
      )}
      {q?.solved && (
        <p className={`mt-4 rounded-2xl px-3 py-2 text-[15px] font-semibold ${q.won ? 'bg-emerald-50 text-emerald-700' : 'bg-sky-50 text-sky-800'}`}>
          {q.won ? `⭐ You got it! The zoo gets a ${money(q.reward)} bonus.` : 'Here’s how it works:'}
        </p>
      )}
      {lines.length > 0 && <div className="text-left"><Sums lines={lines} /></div>}
      {e.todo && !e.done && e.choices && (
        <div className="mt-4 grid gap-2">
          {e.choices.map((c, i) => (
            <button key={i} onClick={() => onChoose(e, i)} disabled={(c.cost ?? 0) > have} className={`${BTN} w-full py-3 text-[16px] ${i === 0 ? 'bg-violet-500 text-white' : 'bg-violet-100 text-violet-900'}`}>{c.label}</button>
          ))}
        </div>
      )}
      {e.todo && !e.done && !e.choices && ACT[e.kind] && <button onClick={() => onAct(e)} className={`${BTN} mt-4 w-full bg-rose-500 py-3 text-[16px] text-white`}>{ACT[e.kind]}</button>}
      {e.todo && e.done && <p className="mt-3 text-[14px] font-semibold text-emerald-600">✓ {e.choices && e.picked !== undefined ? `You picked: ${e.choices[e.picked]?.label}` : 'Done'}</p>}
      <p className="mt-3 text-[11px] text-neutral-400">{when(e.at)}</p>
    </div>
  );
}

// ---------- An exhibit ----------

/** An exhibit, the way a kid wants it: who lives here, what's wrong (and the fix), and one thing to make better. */
export function ExhibitSheet({ zoo, id, onClose, onAnimal, onFeed, onPlay, onBuy, onGoal, onFix, canFeed }: {
  zoo: Zoo; id: string; onClose: () => void; onAnimal: (a: Animal) => void; onFeed?: (habitat: string) => void; onPlay?: (habitat: string) => void;
  onBuy: (id: string) => void; onGoal: (id: string) => void; onFix: (habitat: string) => void; canFeed: string | null;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const e = EXHIBITS.find((x) => x.id === id);
  if (!e) return null;
  const ids = new Set(e.habitats.map((h) => h.id));
  const here = zoo.animals.filter((a) => ids.has(a.habitat));
  const groups = [...new Set(here.map((a) => a.species))].map((sp) => ({ sp: species(sp), list: here.filter((a) => a.species === sp) }));
  const h = hourOf(zoo.clock);
  const kind = (a: Animal) => species(a.species).name.toLowerCase();
  // What needs doing, in kid words, each with its fix.
  const issues: { key: string; text: string; act?: () => void; label?: string; cost?: number }[] = [];
  for (const a of here.filter((x) => x.loose)) issues.push({ key: `l${a.id}`, text: `❗ ${a.name} got out! Look for them on the map.` });
  for (const a of here.filter((x) => x.sick)) issues.push({ key: `s${a.id}`, text: `🤒 ${a.name} isn’t feeling well.`, act: () => onAnimal(a), label: 'Help' });
  for (const hb of e.habitats.filter((x) => zoo.broken.includes(x.id))) issues.push({ key: `f${hb.id}`, text: '🔧 There’s a hole in the fence.', act: () => onFix(hb.id), label: `Fix · ${money(FENCE_COST)}`, cost: FENCE_COST });
  for (const g of groups) {
    const list = g.list.filter((a) => !a.loose);
    if (list.length && list.reduce((s, a) => s + a.hunger, 0) / list.length > 60) issues.push({ key: `h${g.sp.id}`, text: `🍽️ The ${g.sp.many} are hungry.` });
  }
  for (const a of here.filter((x) => x.needsName)) issues.push({ key: `b${a.id}`, text: `🍼 A baby ${kind(a)} needs a name!`, act: () => onAnimal(a), label: 'Name it' });
  const next = UPGRADES.filter((u) => u.exhibit === id && canBuy(zoo, u)).sort((a, b) => a.cost - b.cost)[0];
  const sleepy = groups.filter((x) => !awake(x.sp, h)).map((x) => x.sp.many);
  return (
    <Sheet title={e.name} emoji={e.emoji} onClose={onClose}>
      <p className="text-[15px] leading-relaxed text-neutral-600">{e.blurb}</p>
      <div className="mt-3 space-y-2">
        {issues.length === 0 && <p className="rounded-2xl bg-emerald-50 px-3 py-2.5 text-[15px] font-semibold text-emerald-800">😊 Everyone here is happy and full.</p>}
        {issues.map((x) => (
          <div key={x.key} className="flex items-center gap-2 rounded-2xl bg-rose-50 px-3 py-2.5">
            <p className="flex-1 text-[15px] font-semibold text-rose-900">{x.text}</p>
            {x.act && <button onClick={x.act} disabled={(x.cost ?? 0) > zoo.money} className={`${BTN} bg-rose-500 py-2 text-white`}>{x.label}</button>}
          </div>
        ))}
        {sleepy.length > 0 && <p className="text-[13px] text-neutral-500">💤 Asleep right now: the {sleepy.join(', the ')}.</p>}
      </div>
      {canFeed && onFeed && (
        <div className="mt-3 flex gap-2">
          <button onClick={() => onFeed(canFeed)} className={`${BTN} flex-1 bg-emerald-500 py-3 text-white`}>{species(here.find((a) => a.habitat === canFeed)?.species ?? 'goat').foodEmoji} Feed them</button>
          {onPlay && <button onClick={() => onPlay(canFeed)} className={`${BTN} flex-1 bg-sky-500 py-3 text-white`}>🎾 Toss a toy</button>}
        </div>
      )}
      <p className="mt-4 text-[13px] font-bold uppercase tracking-wider text-neutral-500">Who lives here</p>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {groups.map(({ sp, list }) => (
          <button key={sp.id} onClick={() => setOpen(open === sp.id ? null : sp.id)} className={`rounded-2xl px-2 py-2.5 text-center ${open === sp.id ? 'bg-violet-100 ring-2 ring-violet-300' : 'bg-neutral-50 hover:bg-neutral-100'}`}>
            <span className="block text-3xl">{sp.emoji}</span>
            <span className="mt-0.5 block text-[13px] font-semibold leading-tight">{list.length} {list.length === 1 ? sp.name.split(' ').pop()!.toLowerCase() : sp.many}</span>
          </button>
        ))}
      </div>
      {open && (() => {
        const grp = groups.find((x) => x.sp.id === open);
        if (!grp) return null;
        return (
          <div className="mt-2 rounded-2xl bg-violet-50 px-3 py-3">
            <div className="flex flex-wrap gap-1.5">
              {grp.list.map((a) => <button key={a.id} onClick={() => onAnimal(a)} className="rounded-full bg-white px-3 py-1.5 text-[14px] font-semibold text-violet-900 shadow-sm">{a.name || 'Baby'}{a.born !== undefined ? ' 🍼' : ''}{a.sick ? ' 🤒' : ''}</button>)}
            </div>
            <p className="mt-2 text-[14px] leading-relaxed text-violet-950">💡 {grp.sp.fact}</p>
          </div>
        );
      })()}
      {!canFeed && <p className="mt-3 text-[12px] text-neutral-400">Walk up to the fence to feed them and play.</p>}
      {next && (
        <div className="mt-4">
          <p className="text-[13px] font-bold uppercase tracking-wider text-neutral-500">Make it better</p>
          <div className="mt-1.5"><UpgradeRow zoo={zoo} id={next.id} onBuy={onBuy} onGoal={onGoal} /></div>
        </div>
      )}
    </Sheet>
  );
}

export function AnimalSheet({ zoo, a, onClose, onVet, onName }: { zoo: Zoo; a: Animal; onClose: () => void; onVet: (a: Animal) => void; onName: (a: Animal) => void }) {
  const sp = species(a.species);
  const up = awake(sp, hourOf(zoo.clock));
  return (
    <Sheet title={a.name || 'A new baby!'} emoji={sp.emoji} onClose={onClose}>
      <p className="text-[14px] text-neutral-500">{sp.name}{a.born !== undefined ? ' · baby' : ''} · {sp.night ? 'a night animal 🌙' : 'a day animal ☀️'}</p>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[14px]">
        <div className="rounded-2xl bg-pink-50 px-3 py-2">Happy<div className="mt-1"><Bar value={a.mood} color="#ec4899" label="Happy" /></div></div>
        <div className="rounded-2xl bg-emerald-50 px-3 py-2">Full<div className="mt-1"><Bar value={100 - a.hunger} color="#22c55e" label="Full" /></div></div>
      </div>
      <p className="mt-3 text-[15px]">{a.loose ? `❗ ${a.name} got out and is hiding somewhere in the zoo!` : up ? `${a.name} is awake.` : `${a.name} is asleep right now. 💤`} Eats {sp.food} {sp.foodEmoji}.</p>
      {(() => {
        const m = remembered(zoo, a);
        return (
          <div className="mt-3 flex flex-wrap gap-1.5 text-[13px]">
            <span className="rounded-full bg-violet-100 px-2.5 py-1 text-violet-900">✨ {m.trait}</span>
            {m.nickname && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-900">🎩 “{m.nickname}”</span>}
            {m.friend && <span className="rounded-full bg-pink-100 px-2.5 py-1 text-pink-900">💛 Best friend: {m.friend}</span>}
            {m.trick && <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-900">🎓 Knows the {m.trick}</span>}
            {m.escapes > 0 && <span className="rounded-full bg-rose-100 px-2.5 py-1 text-rose-900">🚨 Escaped {m.escapes === 1 ? 'once' : `${m.escapes} times`}</span>}
          </div>
        );
      })()}
      <p className="mt-3 rounded-2xl bg-sky-50 px-3 py-2.5 text-[14px] leading-relaxed text-sky-950">💡 {sp.fact}</p>
      {a.sick && <button onClick={() => onVet(a)} className={`${BTN} mt-4 w-full bg-teal-500 text-white`}>🩺 {a.name} {AILMENT_WORD[a.sick]}. Call Dr. Paws ({money(VET_BILL)})</button>}
      {a.needsName && <button onClick={() => onName(a)} className={`${BTN} mt-4 w-full bg-violet-500 text-white`}>🍼 Give the baby a name</button>}
    </Sheet>
  );
}

// ---------- The shop ----------

function UpgradeRow({ zoo, id, onBuy, onGoal }: { zoo: Zoo; id: string; onBuy: (id: string) => void; onGoal: (id: string) => void }) {
  const u = upgrade(id)!;
  const owned = zoo.owned.includes(u.id);
  const ok = canBuy(zoo, u);
  const [show, setShow] = useState(false);
  const p = plan(zoo, u.cost);
  const goal = zoo.goal === u.id;
  return (
    <div className={`rounded-2xl px-3 py-2.5 ${owned ? 'bg-emerald-50' : goal ? 'bg-violet-50 ring-2 ring-violet-300' : 'bg-neutral-50'}`}>
      <div className="flex items-start gap-2.5">
        <span className="text-2xl">{u.emoji}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold">{u.name}</p>
          <p className="text-[13px] leading-snug text-neutral-600">{u.text}</p>
          {u.after && !zoo.owned.includes(u.after) && <p className="mt-0.5 text-[12px] text-neutral-400">First you need: {upgrade(u.after)?.name}</p>}
        </div>
        <span className="text-[15px] font-bold">{owned ? '✓' : money(u.cost)}</span>
      </div>
      {!owned && ok && (
        <div className="mt-2 flex gap-2">
          <button onClick={() => onBuy(u.id)} disabled={zoo.money < u.cost} className={`${BTN} flex-1 bg-emerald-500 text-white`}>Buy it</button>
          <button onClick={() => { setShow((s) => !s); if (!goal && zoo.money < u.cost) onGoal(u.id); }} className={`${BTN} flex-1 bg-violet-500 text-white`}>{zoo.money >= u.cost ? '🧮 The math' : goal ? '🧮 Our plan' : '🐷 Save up'}</button>
        </div>
      )}
      {show && <Sums lines={p.lines} />}
    </div>
  );
}

export function PlansSheet({ zoo, onClose, onBuy, onGoal }: { zoo: Zoo; onClose: () => void; onBuy: (id: string) => void; onGoal: (id: string) => void }) {
  const list = useMemo(() => [...UPGRADES].sort((a, b) => Number(zoo.owned.includes(a.id)) - Number(zoo.owned.includes(b.id)) || a.cost - b.cost), [zoo.owned]);
  return (
    <Sheet title="Zoo plans" emoji="🏗️" onClose={onClose} wide>
      <p className="text-[14px] text-neutral-600">Things you could build or bring to the zoo. Pick one to save up for, and the math helper shows how many visitors it takes.</p>
      <p className="mt-2 text-[15px] font-semibold">You have {money(zoo.money)}</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">{list.map((u) => <UpgradeRow key={u.id} zoo={zoo} id={u.id} onBuy={onBuy} onGoal={onGoal} />)}</div>
    </Sheet>
  );
}

// ---------- Money ----------

export function MoneySheet({ zoo, onClose, onPrice, onQuiz }: { zoo: Zoo; onClose: () => void; onPrice: (p: number) => void; onQuiz: () => void }) {
  const draw = dailyDraw(zoo);
  const per = Math.max(10, Math.round(draw / 10) * 10);
  const fed = zoo.animals.length;
  const last = zoo.reports[0];
  return (
    <Sheet title="The zoo’s money" emoji="💰" onClose={onClose}>
      <p className="text-[28px] font-extrabold">{money(zoo.money)}</p>
      <p className="mt-1 text-[14px] text-neutral-600">🏅 {FAME[zoo.mem?.level ?? 0]}{zoo.buzz && zoo.buzz.until > zoo.clock ? ` · ${zoo.buzz.k > 0 ? '📈 Extra visitors' : '📉 Fewer visitors'} because of ${zoo.buzz.why}` : ''}</p>
      <div className="mt-3 rounded-2xl bg-neutral-50 px-3 py-3">
        <p className="text-[13px] font-bold uppercase tracking-wider text-neutral-500">Ticket price</p>
        <div className="mt-2 flex items-center gap-3">
          <button onClick={() => onPrice(Math.max(1, zoo.price - 1))} className={`${BTN} bg-neutral-200 text-xl`}>−</button>
          <span className="flex-1 text-center text-[26px] font-bold">{money(zoo.price)}</span>
          <button onClick={() => onPrice(Math.min(20, zoo.price + 1))} className={`${BTN} bg-neutral-200 text-xl`}>+</button>
        </div>
        <Sums lines={[`About ${per} visitors a day at ${money(zoo.price)}`, `${per} × ${money(zoo.price)} = ${money(per * zoo.price)} a day`, zoo.price > 8 ? 'Pricey tickets mean fewer people come.' : zoo.price < 4 ? 'Cheap tickets bring lots of people, but each pays less.' : 'A fair price: lots of families come.']} />
      </div>
      <div className="mt-3 rounded-2xl bg-neutral-50 px-3 py-3">
        <p className="text-[13px] font-bold uppercase tracking-wider text-neutral-500">Every morning</p>
        <Sums lines={[`Breakfast: ${fed} animals × ${money(FOOD_PER_ANIMAL)} = ${money(fed * FOOD_PER_ANIMAL)}`]} />
      </div>
      {last && (
        <div className="mt-3 rounded-2xl bg-neutral-50 px-3 py-3">
          <p className="text-[13px] font-bold uppercase tracking-wider text-neutral-500">Yesterday (day {last.day})</p>
          <Sums lines={[`${last.visitors} visitors · tickets ${money(last.tickets)}`, `Snacks ${money(last.snacks)}`, `Food −${money(last.food)}${last.other ? ` · other −${money(last.other)}` : ''}`, `${money(last.tickets)} + ${money(last.snacks)} − ${money(last.food + last.other)} = ${money(last.tickets + last.snacks - last.food - last.other)}`]} />
        </div>
      )}
      <button onClick={onQuiz} className={`${BTN} mt-4 w-full bg-amber-400 text-neutral-900`}>⭐ Math helper · earn {money(STAR_GIFT)} a gold star</button>
    </Sheet>
  );
}

export function QuizSheet({ q, onClose, onAnswer }: { q: Question; onClose: () => void; onAnswer: (right: boolean) => void }) {
  const [picked, setPicked] = useState<number | null>(null);
  const right = picked === q.answer;
  const fmt = (n: number) => (q.unit === '$' ? money(n) : String(n));
  return (
    <Sheet title="Math helper" emoji="⭐" onClose={onClose}>
      <p className="text-[18px] font-semibold leading-snug">{q.q}</p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        {q.options.map((o) => (
          <button key={o} disabled={picked !== null} onClick={() => { setPicked(o); onAnswer(o === q.answer); }}
            className={`rounded-2xl py-4 text-[22px] font-bold active:scale-95 ${picked === null ? 'bg-violet-100 text-violet-900 hover:bg-violet-200' : o === q.answer ? 'bg-emerald-400 text-white' : o === picked ? 'bg-rose-300 text-white' : 'bg-neutral-100 text-neutral-400'}`}>
            {fmt(o)}
          </button>
        ))}
      </div>
      {picked !== null && (
        <div className="mt-4 text-center">
          <p className="text-[22px] font-bold">{right ? '⭐ You got it!' : 'Almost! Here’s how:'}</p>
          <Sums lines={[q.why]} />
          {right && <p className="mt-2 text-[14px] text-emerald-700">A visitor gave the zoo {money(STAR_GIFT)} for that!</p>}
          <button onClick={onClose} className={`${BTN} mt-3 w-full bg-violet-500 text-white`}>{right ? 'Yay!' : 'Got it'}</button>
        </div>
      )}
    </Sheet>
  );
}

// ---------- A new baby ----------

export function BabySheet({ a, names, onName, onClose }: { a: Animal; names: string[]; onName: (n: string) => void; onClose: () => void }) {
  const [own, setOwn] = useState('');
  const sp = species(a.species);
  return (
    <Sheet title={`A baby ${sp.name.toLowerCase()}!`} emoji="🍼" onClose={onClose}>
      <p className="text-center text-6xl">{sp.emoji}</p>
      <p className="mt-2 text-[15px]">What should we call the baby?</p>
      <div className="mt-3 grid gap-2">
        {names.map((n) => <button key={n} onClick={() => onName(n)} className={`${BTN} bg-violet-100 text-violet-900 hover:bg-violet-200`}>{n}</button>)}
      </div>
      <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (own.trim()) onName(own); }}>
        <input value={own} onChange={(e) => setOwn(e.target.value)} placeholder="Or type your own name…" maxLength={24}
          className="min-w-0 flex-1 rounded-full border border-neutral-300 px-4 py-2.5 text-[15px] text-neutral-900" />
        <button disabled={!own.trim()} className={`${BTN} bg-violet-500 text-white`}>Name</button>
      </form>
    </Sheet>
  );
}

// ---------- Dr. Paws ----------

const VISITS: Record<Ailment, { tool: string; label: string; after: string }[]> = {
  tummy: [{ tool: '🩺', label: 'Listen to their tummy', after: 'Rumble rumble! Too many snacks.' }, { tool: '💊', label: 'Give some tummy medicine', after: 'Yum, it tastes like berries.' }, { tool: '🍵', label: 'A warm drink and a rest', after: 'Much better.' }],
  tooth: [{ tool: '🔦', label: 'Look in their mouth', after: 'Found the sore tooth!' }, { tool: '🪥', label: 'Brush it clean', after: 'Sparkly!' }, { tool: '🧊', label: 'An ice pack for the cheek', after: 'Ahhh, that feels good.' }],
  cold: [{ tool: '🌡️', label: 'Take their temperature', after: 'A little warm.' }, { tool: '💧', label: 'Give the medicine', after: 'Down it goes.' }, { tool: '🧣', label: 'Wrap them in a cozy blanket', after: 'Snug as a bug.' }],
  splinter: [{ tool: '🔍', label: 'Find the splinter', after: 'There it is!' }, { tool: '🪡', label: 'Gently pull it out', after: 'Out it comes. So brave!' }, { tool: '🩹', label: 'Put on a bandage', after: 'All patched up.' }],
  itchy: [{ tool: '🔍', label: 'Look at the itchy spot', after: 'Just dry skin.' }, { tool: '🧴', label: 'Rub in some lotion', after: 'Smooth and soft.' }, { tool: '🛁', label: 'A cool bath', after: 'No more itchies!' }],
};

export function VetSheet({ a, onDone, onClose }: { a: Animal; onDone: () => void; onClose: () => void }) {
  const sp = species(a.species);
  const steps = VISITS[a.sick ?? 'tummy'];
  const [i, setI] = useState(0);
  const [said, setSaid] = useState<string | null>(null);
  const done = i >= steps.length;
  const step = steps[Math.min(i, steps.length - 1)];
  return (
    <Sheet title="Dr. Paws, the zoo vet" emoji="🩺" onClose={onClose}>
      <div className="relative mx-auto flex h-40 w-40 items-center justify-center rounded-full bg-teal-50 text-[88px]">
        {sp.emoji}
        {i > 0 && <span className="absolute bottom-1 right-1 text-4xl">{steps[i - 1].tool}</span>}
        {done && <span className="absolute -top-2 right-0 text-4xl">💖</span>}
      </div>
      <p className="mt-3 text-center text-[18px] font-semibold">{done ? `${a.name} feels all better!` : `${a.name} ${AILMENT_WORD[a.sick ?? 'tummy']}`}</p>
      <p className="mt-1 min-h-[22px] text-center text-[14px] text-neutral-500">{said ?? `Step ${i + 1} of ${steps.length}`}</p>
      {!done ? (
        <button onClick={() => { setSaid(step.after); setI(i + 1); }} className={`${BTN} mt-3 w-full bg-teal-500 text-white`}><span className="mr-1 text-xl">{step.tool}</span> {step.label}</button>
      ) : (
        <>
          <Sums lines={[`Vet bill: ${money(VET_BILL)}`]} />
          <button onClick={onDone} className={`${BTN} mt-3 w-full bg-pink-500 text-white`}>Thank you, Dr. Paws!</button>
        </>
      )}
    </Sheet>
  );
}

// ---------- The map ----------

export function ZooMap({ me, heading, markers, onGo, small, onOpen }: {
  me: Px; heading: number; markers: { kind: 'loose' | 'kid' | 'parent' | 'train'; px: Px; name: string }[]; onGo?: (px: Px) => void; small?: boolean; onOpen?: () => void;
}) {
  const vb = '60 -20 1110 980';
  const poly = (pts: Px[]) => pts.map((p) => p.join(',')).join(' ');
  return (
    <svg viewBox={vb} className={small ? 'h-full w-full' : 'h-auto w-full'} onClick={small ? onOpen : undefined}>
      <polygon points={poly(BOUNDARY)} fill="#8bc77a" stroke="#2f5d3a" strokeWidth={6} />
      <polyline points={poly([...TRAIN, TRAIN[0]])} fill="none" stroke="#7c2d12" strokeWidth={4} strokeDasharray="10 8" />
      {PATHS.map((p, i) => <polyline key={i} points={poly(p)} fill="none" stroke="#f5ecd6" strokeWidth={small ? 10 : 8} strokeLinecap="round" strokeLinejoin="round" />)}
      {EXHIBITS.map((e) => e.habitats.map((h) => (
        <ellipse key={h.id} cx={h.at[0]} cy={h.at[1]} rx={h.rx} ry={h.ry} transform={`rotate(${((h.angle ?? 0) * 180) / Math.PI} ${h.at[0]} ${h.at[1]})`}
          fill={h.pool === 1 ? '#5ab0e0' : h.walkIn ? '#b7e4a0' : '#d9c48a'} stroke="#7a5636" strokeWidth={2} />
      )))}
      {EXHIBITS.filter((e) => e.hall).map((e) => <circle key={e.id} cx={e.hall!.at[0]} cy={e.hall!.at[1]} r={e.hall!.r} fill={e.hall!.kind === 'house' ? '#6b5a4a' : 'rgba(200,230,255,.55)'} stroke="#4a5a6a" strokeWidth={3} />)}
      {!small && EXHIBITS.map((e) => (
        <g key={e.id} onClick={() => onGo?.(e.at)} style={{ cursor: 'pointer' }}>
          <circle cx={e.at[0]} cy={e.at[1]} r={22} fill="white" stroke="#1f2937" strokeWidth={2} opacity={0.92} />
          <text x={e.at[0]} y={e.at[1] + 9} textAnchor="middle" fontSize={26}>{e.emoji}</text>
          <text x={e.at[0]} y={e.at[1] + 40} textAnchor="middle" fontSize={15} fontWeight={700} fill="#1f2937" stroke="white" strokeWidth={4} paintOrder="stroke">{e.name}</text>
        </g>
      ))}
      {!small && PLACES.filter((p) => ['food', 'ride', 'station', 'play'].includes(p.kind)).map((p) => (
        <g key={p.id} onClick={() => onGo?.(p.at)} style={{ cursor: 'pointer' }}><text x={p.at[0]} y={p.at[1] + 7} textAnchor="middle" fontSize={20}>{p.emoji}</text></g>
      ))}
      {markers.map((m, i) => (
        <g key={i} onClick={() => !small && m.kind !== 'train' && onGo?.(m.px)}>
          {m.kind === 'train' ? <text x={m.px[0]} y={m.px[1] + 8} textAnchor="middle" fontSize={small ? 34 : 24}>🚂</text>
            : <><circle cx={m.px[0]} cy={m.px[1]} r={small ? 26 : 18} fill={m.kind === 'loose' ? '#ef4444' : '#f59e0b'} className="kz-pulse" /><text x={m.px[0]} y={m.px[1] + 9} textAnchor="middle" fontSize={small ? 30 : 22}>{m.kind === 'loose' ? '❗' : m.kind === 'kid' ? '🧒' : '👋'}</text></>}
        </g>
      ))}
      <g transform={`translate(${me[0]} ${me[1]}) rotate(${(-heading * 180) / Math.PI + 180})`}>
        <circle r={small ? 22 : 14} fill="#7c3aed" stroke="white" strokeWidth={5} />
        <path d={`M0 ${small ? -34 : -24} L${small ? 12 : 8} ${small ? -16 : -12} L${small ? -12 : -8} ${small ? -16 : -12} Z`} fill="#7c3aed" />
      </g>
    </svg>
  );
}
