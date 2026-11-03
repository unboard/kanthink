'use client';

import { useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { RescuedCat, VetNeed } from './rescue';

/**
 * The two jobs at the rescue, made for kids: a bath (scrub the mud off, rinse,
 * towel dry) and a visit to the vet (a few steps, one big button each). Finishing
 * one is what lets a cat go home.
 */

function CatPortrait({ cat, children, onPointer }: { cat: RescuedCat; children?: React.ReactNode; onPointer?: (x: number, y: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const at = (e: React.PointerEvent) => {
    const r = ref.current?.getBoundingClientRect();
    if (r && onPointer) onPointer(((e.clientX - r.left) / r.width) * 100, ((e.clientY - r.top) / r.height) * 100);
  };
  return (
    <div ref={ref} onPointerDown={at} onPointerMove={at}
      className="relative mx-auto aspect-square w-64 touch-none select-none overflow-hidden rounded-full" style={{ background: `radial-gradient(circle at 50% 40%, ${cat.color} 0 46%, #fde7f0 47%)` }}>
      {/* A simple face, so it reads as that cat in that fur. */}
      <div className="absolute left-[30%] top-[14%] h-0 w-0 border-x-[18px] border-b-[34px] border-x-transparent" style={{ borderBottomColor: cat.color }} />
      <div className="absolute right-[30%] top-[14%] h-0 w-0 border-x-[18px] border-b-[34px] border-x-transparent" style={{ borderBottomColor: cat.color }} />
      <div className="absolute left-[36%] top-[36%] h-4 w-4 rounded-full bg-neutral-900" />
      <div className="absolute right-[36%] top-[36%] h-4 w-4 rounded-full bg-neutral-900" />
      <div className="absolute left-1/2 top-[48%] h-3 w-4 -translate-x-1/2 rounded-full bg-pink-400" />
      {children}
    </div>
  );
}

function Frame({ title, step, onClose, children }: { title: string; step: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-neutral-950/60 p-4">
      <div className="relative w-full max-w-sm rounded-3xl bg-white p-5 text-center text-neutral-900 shadow-2xl">
        <button onClick={onClose} aria-label="Close" className="absolute right-3 top-3 rounded-full p-1.5 text-neutral-400 hover:bg-neutral-100"><X className="h-4 w-4" /></button>
        <p className="text-[12px] font-bold uppercase tracking-wider text-pink-600">{title}</p>
        <h3 className="mt-1 text-[20px] font-bold">{step}</h3>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

const BIG = 'mt-4 w-full rounded-full px-4 py-3 text-[16px] font-semibold text-white active:scale-95';

export function BathGame({ cat, onDone, onClose }: { cat: RescuedCat; onDone: () => void; onClose: () => void }) {
  const spots = useMemo(() => Array.from({ length: 7 }, (_, i) => ({ x: 22 + ((cat.seed >>> i) % 56), y: 22 + ((cat.seed >>> (i + 7)) % 52), r: 9 + ((cat.seed >>> (i + 3)) % 6) })), [cat.seed]);
  const [mud, setMud] = useState(() => spots.map(() => 1));
  const [bubbles, setBubbles] = useState<{ x: number; y: number; id: number }[]>([]);
  const [step, setStep] = useState<'scrub' | 'rinse' | 'dry' | 'done'>('scrub');
  const [rinse, setRinse] = useState(0);
  const [dry, setDry] = useState(0);
  const scrub = (x: number, y: number) => {
    if (step !== 'scrub') return;
    let hit = false;
    setMud((m) => {
      const next = m.map((v, i) => (Math.hypot(spots[i].x - x, spots[i].y - y) < spots[i].r + 8 ? Math.max(0, v - 0.25) : v));
      hit = next.some((v, i) => v !== m[i]);
      if (next.every((v) => v === 0)) setTimeout(() => setStep('rinse'), 400);
      return next;
    });
    if (hit || Math.random() < 0.3) setBubbles((b) => [...b.slice(-24), { x, y, id: Math.random() }]);
  };
  const stepTitle = { scrub: `Scrub the mud off ${cat.name}!`, rinse: 'Rinse off the bubbles', dry: 'Dry with a fluffy towel', done: `${cat.name} is sparkly clean!` }[step];
  return (
    <Frame title="🛁 Bath time" step={stepTitle} onClose={onClose}>
      <CatPortrait cat={cat} onPointer={scrub}>
        {spots.map((sp, i) => mud[i] > 0 && (
          <div key={i} className="pointer-events-none absolute rounded-full" style={{ left: `${sp.x}%`, top: `${sp.y}%`, width: `${sp.r * 2}%`, height: `${sp.r * 1.6}%`, transform: 'translate(-50%,-50%)', background: '#6b4a2b', opacity: mud[i] * 0.9 }} />
        ))}
        {step !== 'done' && step !== 'dry' && bubbles.map((b) => <span key={b.id} className="pointer-events-none absolute text-xl" style={{ left: `${b.x}%`, top: `${b.y}%`, transform: 'translate(-50%,-50%)' }}>🫧</span>)}
        {step === 'rinse' && rinse > 0 && <div className="pointer-events-none absolute inset-0 animate-pulse bg-sky-300/30 text-4xl">💧💧💧</div>}
        {step === 'done' && <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-5xl">✨</div>}
      </CatPortrait>
      {step === 'scrub' && <p className="mt-3 text-[14px] text-neutral-500">Rub your finger (or mouse) over the mud.</p>}
      {step === 'rinse' && <button className={`${BIG} bg-sky-500`} onClick={() => { const n = rinse + 1; setRinse(n); setBubbles((b) => b.slice(Math.ceil(b.length / 2))); if (n >= 3) { setBubbles([]); setStep('dry'); } }}>🚿 Rinse ({rinse}/3)</button>}
      {step === 'dry' && <button className={`${BIG} bg-amber-500`} onClick={() => { const n = dry + 1; setDry(n); if (n >= 3) setStep('done'); }}>🧺 Towel ({dry}/3)</button>}
      {step === 'done' && <button className={`${BIG} bg-pink-500`} onClick={onDone}>Yay! All done</button>}
    </Frame>
  );
}

const VISITS: Record<VetNeed, { say: string; steps: { tool: string; label: string; after: string }[] }> = {
  sniffles: { say: 'has the sniffles', steps: [
    { tool: '🩺', label: 'Listen to their breathing', after: 'Just a little stuffy.' },
    { tool: '💧', label: 'Give the medicine', after: 'Yum, tastes like tuna!' },
    { tool: '🧣', label: 'Wrap them in a cozy blanket', after: 'All warm and snuggly.' },
  ] },
  paw: { say: 'has a sore paw', steps: [
    { tool: '🔍', label: 'Look at the paw', after: 'There’s a tiny thorn!' },
    { tool: '🪡', label: 'Gently take out the thorn', after: 'Out it comes. Brave kitty!' },
    { tool: '🩹', label: 'Wrap a bandage', after: 'Good as new soon.' },
  ] },
  checkup: { say: 'needs a checkup', steps: [
    { tool: '⚖️', label: 'Weigh them on the scale', after: 'Just the right size.' },
    { tool: '🩺', label: 'Listen to their heart', after: 'Thump thump, nice and strong!' },
    { tool: '⭐', label: 'Give them a brave sticker', after: 'They love it!' },
  ] },
};

export function VetGame({ cat, need, onDone, onClose }: { cat: RescuedCat; need: VetNeed; onDone: () => void; onClose: () => void }) {
  const visit = VISITS[need];
  const [i, setI] = useState(0);
  const [said, setSaid] = useState<string | null>(null);
  const done = i >= visit.steps.length;
  const step = visit.steps[Math.min(i, visit.steps.length - 1)];
  return (
    <Frame title="🩺 Dr. Whiskers, the vet" step={done ? `${cat.name} feels all better!` : `${cat.name} ${visit.say}`} onClose={onClose}>
      <CatPortrait cat={cat}>
        {i > 0 && <div className="pointer-events-none absolute bottom-[12%] left-1/2 -translate-x-1/2 text-4xl">{visit.steps[i - 1].tool}</div>}
        {done && <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-5xl">💖</div>}
      </CatPortrait>
      <p className="mt-3 min-h-[22px] text-[14px] text-neutral-600">{said ?? `Step ${Math.min(i + 1, visit.steps.length)} of ${visit.steps.length}`}</p>
      {!done ? (
        <button className={`${BIG} bg-teal-500`} onClick={() => { setSaid(step.after); setI(i + 1); }}><span className="mr-1 text-xl">{step.tool}</span> {step.label}</button>
      ) : (
        <button className={`${BIG} bg-pink-500`} onClick={onDone}>Thank you, Dr. Whiskers!</button>
      )}
    </Frame>
  );
}
