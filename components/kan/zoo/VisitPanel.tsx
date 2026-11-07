'use client';

import { useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { SPECIES, species } from '@/lib/kan/zoo/species';
import { remembered } from '@/lib/kan/zoo/stories';
import { AILMENT_WORD, VET_BILL, hourOf, money, type Animal, type Zoo } from '@/lib/kan/zoo/sim';
import { care, upNow, expectingText, foodChoices, hearts, howLong, weigh, type CareAction } from '@/lib/kan/zoo/care';
import { habitat } from '@/lib/kan/zoo/map';
import type { VisitAct } from './visit';

/**
 * The buttons and the words for a visit, one on one: feed it (if you can pick its
 * food), pet it or brush it (or train it through the fence, for the ones keepers
 * never go in with), play, put it on the scale, and for a mom-to-be, listen for the
 * heartbeat. Each thing counts once a day toward how well it knows you.
 */

/** Keepers never go in with these: they work with them through the fence, with a target stick and treats. */
const TRAINED = new Set(['lion', 'tiger', 'cheetah', 'snowleopard', 'slothbear', 'gorilla', 'orangutan', 'fossa', 'bobcat', 'alligator', 'elephant', 'rhino', 'indianrhino', 'hog', 'pygmyhippo', 'spidermonkey', 'siamang']);
const SCALE_BONUS = 15;
/** How you take each one out: birds ride on your shoulder, penguins and goats walk on a leash. */
const WALK_LABEL: Record<string, string> = { macaw: '🦜 Carry', budgie: '🦜 Carry', owl: '🦉 Carry', penguin: '🦮 Walk', goat: '🦮 Walk' };

const pick = <T,>(l: T[]) => l[Math.floor(Math.random() * l.length)];

export function VisitPanel({ zoo, a, onClose, onDo, onVet, onName, onScale, onWalk }: {
  zoo: Zoo; a: Animal; onClose: () => void;
  /** Take it out to meet visitors; says why not when it can't go. */
  onWalk?: () => string | null;
  /** Play it out, and count it; true when it was the first time today (a little more bond). */
  onDo: (show: VisitAct, extra?: string, care?: { action: CareAction; right: boolean }) => boolean;
  onVet: (a: Animal) => void; onName: (a: Animal) => void;
  onScale: (right: boolean, bonus: number) => void;
}) {
  const sp = species(a.species);
  const c = care(a.species);
  const up = upNow(a, hourOf(zoo.clock));
  const m = remembered(zoo, a);
  const baby = a.born !== undefined;
  const ex = expectingText(zoo, a);
  const [msg, setMsg] = useState<{ text: string; bond?: boolean } | null>(() => ({ text: hello(a, up, baby) }));
  const [mode, setMode] = useState<'main' | 'feed' | 'scale'>('main');
  const [about, setAbout] = useState(false);
  const foods = useMemo(() => foodChoices(sp, Object.values(SPECIES), Math.random), [sp, mode]); // eslint-disable-line react-hooks/exhaustive-deps
  const [scale, setScale] = useState<{ was: number; now: number; unit: string; options: number[]; done?: boolean; right?: boolean; tries: number } | null>(null);

  const say = (text: string, bond: boolean) => setMsg({ text, bond });
  const touch = TRAINED.has(sp.id) ? 'train' : c.touch === 'fence' ? 'brush' : c.touch;
  const petLabel = touch === 'pet' ? '✋ Pet' : touch === 'brush' ? '🪮 Brush' : touch === 'train' ? '🎯 Train' : '👀 Watch closely';

  const doFeed = (f: { emoji: string; food: string; right: boolean }) => {
    setMode('main');
    if (!f.right) {
      onDo('refuse', f.emoji, { action: 'feed', right: false });
      say(`${a.name} sniffed the ${f.food.split(' and ')[0]} and turned away. ${cap(sp.many)} don’t eat that! Try again?`, false);
      setMode('feed');
      return;
    }
    const first = onDo('feed', f.emoji, { action: 'feed', right: true });
    say(pick([`Yum! ${a.name} loves ${sp.food}.`, `${a.name} gobbled it right up!`, `Crunch, munch. ${a.name} ate every bite.`, `${a.name} ate it so fast! Keepers say that means a happy, healthy ${sp.name.toLowerCase()}.`]) + (a.expecting && !a.expecting.egg ? ' Extra snacks for a mom-to-be!' : ''), first);
  };
  const doPet = () => {
    const first = onDo('pet', undefined, { action: 'pet', right: true });
    const lines = touch === 'pet'
      ? [`${a.name} leaned right into your hand. So soft!`, `You scratched ${a.name} behind the ears. Happy sigh!`, `${a.name} closed their eyes. That’s the spot!`]
      : touch === 'brush'
        ? [`You reached over the fence with the big brush. ${a.name} loves a back scratch!`, `Brush, brush, brush. ${a.name} wiggled with joy.`, `${a.name} came right up to the fence for a brushing.`]
        : touch === 'train'
          ? [`Keepers never go in with ${sp.many}. You held up the target stick, ${a.name} touched it with their nose, and got a treat!`, `${a.name} showed you a paw through the fence, just like the vet needs. Good job!`, `You asked ${a.name} to open wide, through the fence. Teeth look great!`]
          : [`You watched ${a.name} up close for a while. ${pick(watching(sp.id, a.name))}`];
    say(pick(lines), first);
  };
  const doPlay = () => {
    const first = onDo('play', c.toy[0], { action: 'play', right: true });
    say(`You gave ${a.name} ${c.toy[1]}. ${pick(['Look at them go!', 'Best. Day. Ever.', 'Keepers call this enrichment: toys that keep animals’ brains busy.', 'So much fun!'])}`, first);
  };
  const doCheck = () => {
    const first = onDo('check', undefined, { action: 'check', right: true });
    const w = weigh(zoo, a);
    const was = w.was;
    const diff = was !== undefined ? w.n - was : 0;
    if (was !== undefined && diff !== 0 && Math.abs(diff) < w.n) {
      const ans = Math.abs(diff);
      const opts = new Set([ans]);
      for (const n of [ans + 1, ans - 1, ans + 10, ans * 2, ans + 5]) if (n > 0 && opts.size < 4) opts.add(n);
      setScale({ was, now: w.n, unit: w.unit, options: [...opts].sort(() => Math.random() - 0.5), tries: 0 });
    } else setScale({ was: was ?? w.n, now: w.n, unit: w.unit, options: [], done: true, tries: 0 });
    setMode('scale');
    const heart = a.expecting ? (a.expecting.egg ? ` The keepers shined a light through the ${a.expecting.n > 1 ? 'eggs' : 'egg'}: you can see the ${a.expecting.n > 1 ? 'babies' : 'baby'} moving inside!` : ` You listened with the stethoscope: thump-thump, thump-thump. That’s the baby’s heartbeat!${a.expecting.n > 1 ? ` Wait… there’s more than one! ${a.expecting.n === 2 ? 'Twins!' : 'Triplets!'}` : ''}`) : '';
    say(`${a.name} stepped on the scale: ${w.n.toLocaleString('en-US')} ${w.unit}.${heart}`, first);
  };
  const doNight = () => {
    const first = onDo('goodnight', undefined, { action: 'goodnight', right: true });
    say(`You whispered goodnight. ${a.name} ${sp.night ? 'will be up and about tonight' : 'will be awake in the morning'}. Shhh…`, first);
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-40 flex flex-col justify-between">
      {/* Who it is */}
      <div className="pointer-events-auto flex items-start gap-2 p-3">
        <button onClick={onClose} aria-label="Back to the zoo" className="flex items-center gap-1.5 rounded-full bg-neutral-950/70 px-3.5 py-2.5 text-[14px] font-semibold text-white shadow-lg backdrop-blur active:scale-95"><ArrowLeft className="h-4 w-4" /> Zoo</button>
        <div className="min-w-0 flex-1 rounded-2xl bg-white/90 px-3.5 py-2 text-neutral-900 shadow-lg backdrop-blur">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{sp.emoji}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[17px] font-bold leading-tight">{a.name || 'New baby'}{m.nickname ? <span className="font-normal text-neutral-500"> “{m.nickname}”</span> : null}</p>
              <p className="truncate text-[12px] text-neutral-500">{sp.name}{baby ? ' · baby' : ''} · {habitat(a.habitat)?.name}</p>
            </div>
            <span className="shrink-0 text-[15px] tracking-tight" title="How well they know you">{'💛'.repeat(hearts(a))}<span className="opacity-25">{'🤍'.repeat(5 - hearts(a))}</span></span>
          </div>
          {(ex || a.sick || a.needsName || !up) && (
            <div className="mt-1.5 flex flex-wrap gap-1.5 text-[12px] font-semibold">
              {ex && <span className="rounded-full bg-pink-100 px-2 py-0.5 text-pink-900">{ex}</span>}
              {a.sick && <span className="rounded-full bg-teal-100 px-2 py-0.5 text-teal-900">🤒 {AILMENT_WORD[a.sick]}</span>}
              {!up && <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-indigo-900">💤 Asleep</span>}
            </div>
          )}
        </div>
      </div>

      {/* What's happening, and what you can do */}
      <div className="pointer-events-auto mx-auto w-full max-w-lg p-3">
        {msg && (
          <div className="mb-2 rounded-2xl bg-white/95 px-4 py-3 text-[15px] leading-snug text-neutral-900 shadow-xl">
            {msg.text}
            {msg.bond && <span className="ml-1.5 whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-[12px] font-bold text-amber-800">+💛 {a.name} likes you more</span>}
          </div>
        )}
        {mode === 'feed' && (
          <div className="mb-2 rounded-2xl bg-white/95 p-3 shadow-xl">
            <p className="mb-2 text-center text-[14px] font-semibold text-neutral-700">What do {sp.many} eat?</p>
            <div className="grid grid-cols-3 gap-2">
              {foods.map((f) => (
                <button key={f.emoji} onClick={() => doFeed(f)} className="flex flex-col items-center gap-1 rounded-2xl bg-neutral-100 px-2 py-2.5 text-[12px] font-medium leading-tight text-neutral-700 active:scale-95">
                  <span className="text-3xl">{f.emoji}</span>{f.food}
                </button>
              ))}
            </div>
          </div>
        )}
        {mode === 'scale' && scale && (
          <div className="mb-2 rounded-2xl bg-white/95 p-3 text-neutral-900 shadow-xl">
            <p className="text-center text-[26px] font-bold">⚖️ {scale.now.toLocaleString('en-US')} <span className="text-[15px] font-semibold text-neutral-500">{scale.unit}</span></p>
            {a.expecting && !a.expecting.egg && <div className="mx-auto my-2 flex h-20 w-32 items-center justify-center rounded-[50%] bg-neutral-900 text-3xl ring-4 ring-neutral-700"><span className="animate-pulse grayscale">{'👶'.repeat(a.expecting.n)}</span></div>}
            {!scale.done && (
              <>
                <p className="mt-1 text-center text-[14px]">Last time: {scale.was.toLocaleString('en-US')} {scale.unit}. Now: {scale.now.toLocaleString('en-US')} {scale.unit}.<br /><b>How many {scale.unit} did {a.name} {scale.now > scale.was ? 'gain' : 'lose'}?</b> <span className="text-emerald-700">Bonus {money(SCALE_BONUS)}!</span></p>
                <div className="mt-2 grid grid-cols-4 gap-2">
                  {scale.options.map((o) => (
                    <button key={o} onClick={() => {
                      const right = o === Math.abs(scale.now - scale.was);
                      const tries = scale.tries + 1;
                      if (right) { onScale(true, SCALE_BONUS); say(`Yes! ${scale.now.toLocaleString('en-US')} − ${scale.was.toLocaleString('en-US')} = ${Math.abs(scale.now - scale.was)}. The vet gave the zoo ${money(SCALE_BONUS)} for helping. ⭐`, false); setScale({ ...scale, done: true, right, tries }); }
                      else if (tries >= 2) { say(`Good try! Take the smaller number away from the bigger one: ${Math.max(scale.now, scale.was).toLocaleString('en-US')} − ${Math.min(scale.now, scale.was).toLocaleString('en-US')} = ${Math.abs(scale.now - scale.was)}.`, false); setScale({ ...scale, done: true, tries }); }
                      else { say('Not quite. Try once more!', false); setScale({ ...scale, tries }); }
                    }} className="rounded-xl bg-violet-100 py-2.5 text-[16px] font-bold text-violet-900 active:scale-95">{o}</button>
                  ))}
                </div>
              </>
            )}
            {scale.done && <button onClick={() => setMode('main')} className="mt-2 w-full rounded-full bg-neutral-100 py-2 text-[14px] font-semibold">Done</button>}
          </div>
        )}
        {mode === 'main' && (
          <>
            {a.sick && <button onClick={() => onVet(a)} className="mb-2 w-full rounded-full bg-teal-500 py-3 text-[15px] font-bold text-white shadow-xl active:scale-95">🩺 Call Dr. Paws ({money(VET_BILL)})</button>}
            {a.needsName && <button onClick={() => onName(a)} className="mb-2 w-full rounded-full bg-violet-500 py-3 text-[15px] font-bold text-white shadow-xl active:scale-95">🍼 Give the baby a name</button>}
            <div className="grid grid-cols-4 gap-2">
              <Act emoji={sp.foodEmoji} label="Feed" onClick={() => { setMode('feed'); setMsg({ text: `Which food is right for ${a.name}?` }); }} disabled={!up} />
              <Act emoji={petLabel.split(' ')[0]} label={petLabel.split(' ').slice(1).join(' ')} onClick={doPet} disabled={!up} />
              <Act emoji={c.toy[0]} label="Play" onClick={doPlay} disabled={!up} />
              <Act emoji="⚖️" label="Check-up" onClick={doCheck} disabled={!up} />
            </div>
            {onWalk && up && (
              <button onClick={() => { const no = onWalk(); if (no) say(no, false); }} className="mt-2 w-full rounded-full bg-amber-500 py-3 text-[15px] font-bold text-white shadow-xl active:scale-95">
                {WALK_LABEL[a.species] ?? '🤲 Carry'} {a.name} to meet visitors
              </button>
            )}
            {!up && <button onClick={doNight} className="mt-2 w-full rounded-full bg-indigo-500 py-3 text-[15px] font-bold text-white shadow-xl active:scale-95">🌙 Whisper goodnight</button>}
            <button onClick={() => setAbout(!about)} className="mt-2 w-full text-center text-[13px] font-semibold text-white drop-shadow">{about ? 'Less' : `More about ${a.name || 'the baby'}`}</button>
            {about && (
              <div className="mt-1 rounded-2xl bg-white/95 p-3 text-[13px] text-neutral-800 shadow-xl">
                <div className="flex flex-wrap gap-1.5">
                  <span className="rounded-full bg-violet-100 px-2.5 py-1 text-violet-900">✨ {m.trait}</span>
                  {m.friend && <span className="rounded-full bg-pink-100 px-2.5 py-1 text-pink-900">💛 Best friend: {m.friend}</span>}
                  {m.trick && <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-900">🎓 Knows the {m.trick}</span>}
                  {m.escapes > 0 && <span className="rounded-full bg-rose-100 px-2.5 py-1 text-rose-900">🚨 Escaped {m.escapes === 1 ? 'once' : `${m.escapes} times`}</span>}
                </div>
                <p className="mt-2">💡 {sp.fact}</p>
                <p className="mt-1.5">{c.born === 'egg' ? '🥚' : '🍼'} {cap(sp.many)} {c.born === 'egg' ? `lay eggs that hatch in about ${howLong(c.days)}` : `carry a baby for about ${howLong(c.days)} before it’s born`}.</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Act({ emoji, label, onClick, disabled }: { emoji: string; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className="flex flex-col items-center gap-0.5 rounded-2xl bg-white/95 px-1 py-2.5 text-[12px] font-semibold text-neutral-800 shadow-xl active:scale-95 disabled:opacity-40">
      <span className="text-[26px] leading-none">{emoji}</span>{label}
    </button>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function hello(a: Animal, up: boolean, baby: boolean) {
  const name = a.name || 'The new baby';
  if (!up) return `${name} is fast asleep. Tiptoe, and say goodnight.`;
  if (a.expecting) return a.expecting.egg ? `${name} is keeping a close eye on ${a.expecting.n > 1 ? 'her eggs' : 'her egg'}.` : `${name} is going to be a mom! Give her a check-up to hear the heartbeat.`;
  if (baby) return pick([`${name} is so little! Babies need lots of food to grow.`, `${name} peeks out from behind mom.`, `${name} wobbles over to see you.`]);
  return pick([`${name} came over to see you!`, `${name} is looking right at you.`, `Hi, ${name}!`, `${name} wants to know what’s in your bucket.`]);
}

function watching(id: string, name: string) {
  const sp = SPECIES[id];
  return [
    `${name} ${sp?.swims ? 'swam right past your nose' : 'looked right back at you'}!`,
    `You counted how many times ${name} blinked. (Lots.)`,
    `${name} did something funny, and a kid next to you laughed out loud.`,
    `You spotted ${name} doing something you’ve never seen before.`,
  ];
}
