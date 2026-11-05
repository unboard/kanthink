'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import {
  SHIRTS, SKILLS, coachFor, howTo, loadPlayers, onPlayers, playing, readAloud, savePlayers,
  type Coach, type HairStyle, type Kid, type Players, type Who,
} from '@/lib/kan/players';

/**
 * Who's playing Kan City: Kan the mushroom, Scarlett or Lennon. A girl picks her
 * shirt and how she's wearing her hair. Behind a grown-ups-only question, a parent
 * sets each girl's age and what math she's working on, and can write Kan notes about
 * her, which Kan reads into those settings.
 */

/** Who's playing right now, kept current when anyone switches. */
export function usePlayers(): Players {
  const [p, setP] = useState<Players>(() => (typeof window === 'undefined' ? { who: 'kan', kids: [] } : loadPlayers()));
  useEffect(() => onPlayers(setP), []);
  return p;
}

/** A little drawing of her: hair, face, eyes, shirt. Kan is the mushroom. */
export function Portrait({ kid, size = 64 }: { kid: Kid | null; size?: number }) {
  if (!kid) return <span style={{ fontSize: size * 0.72, lineHeight: 1 }}>🍄</span>;
  const long = kid.style === 'down' ? (kid.length === 'long' ? 62 : 48) : 34;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      {kid.style === 'down' && <path d={`M14 30 Q12 ${long} 18 ${long + 2} L46 ${long + 2} Q52 ${long} 50 30 Z`} fill={kid.hair} />}
      {kid.style === 'ponytail' && <path d="M44 18 Q58 24 52 44 Q48 34 42 26 Z" fill={kid.hair} />}
      {kid.style === 'braids' && [18, 46].map((x) => <g key={x}>{[0, 1, 2, 3].map((i) => <ellipse key={i} cx={x} cy={38 + i * 6} rx="3.6" ry="3.8" fill={kid.hair} />)}<circle cx={x} cy={62} r="2.4" fill={kid.shirt} /></g>)}
      <path d="M12 64 Q14 48 32 48 Q50 48 52 64 Z" fill={kid.shirt} />
      <rect x="28" y="40" width="8" height="9" rx="3" fill={kid.skin} />
      <ellipse cx="32" cy="29" rx="14" ry="15" fill={kid.skin} />
      <path d="M17 28 Q16 12 32 12 Q48 12 47 28 Q42 18 30 19 Q22 20 17 28 Z" fill={kid.hair} />
      {[26, 38].map((x) => <g key={x}><ellipse cx={x} cy="30" rx="3" ry="3.3" fill="#fff" /><circle cx={x} cy="30.3" r="2.1" fill={kid.eyes} /><circle cx={x} cy="30.3" r="1" fill="#120c08" /><circle cx={x + 0.7} cy="29.4" r="0.55" fill="#fff" /></g>)}
      {[22, 42].map((x) => <ellipse key={x} cx={x} cy="35" rx="2.6" ry="1.6" fill="#f28b8b" opacity="0.45" />)}
      <path d="M28.5 37 Q32 40 35.5 37" stroke="#b5524f" strokeWidth="1.4" fill="none" strokeLinecap="round" />
    </svg>
  );
}

const BTN = 'rounded-full px-4 py-2.5 text-[15px] font-semibold active:scale-95 disabled:opacity-40 disabled:active:scale-100';

export function PlayerSheet({ onClose }: { onClose: () => void }) {
  const players = usePlayers();
  const [grown, setGrown] = useState<'no' | 'ask' | 'yes'>('no');
  const me = playing(players);
  const set = (next: Players) => savePlayers(next);
  const pick = (who: Who) => set({ ...players, who });
  const change = (id: Kid['id'], patch: Partial<Kid>) => set({ ...players, kids: players.kids.map((k) => (k.id === id ? { ...k, ...patch } : k)) });

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-neutral-950/50 sm:items-center sm:p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="relative max-h-[90vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 text-neutral-900 shadow-2xl sm:max-w-lg sm:rounded-3xl">
        <button onClick={onClose} aria-label="Close" className="absolute right-3 top-3 rounded-full p-2 text-neutral-400 hover:bg-neutral-100"><X className="h-5 w-5" /></button>
        {grown !== 'yes' ? (
          <>
            <h3 className="pr-8 text-[20px] font-bold">Who’s playing?</h3>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {([null, ...players.kids] as (Kid | null)[]).map((k) => {
                const on = (k?.id ?? 'kan') === players.who;
                return (
                  <button key={k?.id ?? 'kan'} onClick={() => pick(k?.id ?? 'kan')}
                    className={`flex flex-col items-center gap-1.5 rounded-3xl px-2 py-3 transition active:scale-95 ${on ? 'bg-violet-100 ring-2 ring-violet-500' : 'bg-neutral-50 ring-1 ring-neutral-200 hover:bg-neutral-100'}`}>
                    <span className="flex h-16 w-16 items-center justify-center"><Portrait kid={k} /></span>
                    <span className="text-[16px] font-bold">{k?.name ?? 'Kan'}</span>
                    <span className="text-[12px] text-neutral-500">{k ? `${k.age} years old` : 'the mushroom'}</span>
                  </button>
                );
              })}
            </div>
            {me && (
              <div className="mt-5">
                <p className="text-[14px] font-bold text-neutral-700">{me.name}’s shirt</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {SHIRTS.map((c) => (
                    <button key={c} onClick={() => change(me.id, { shirt: c })} aria-label={`Shirt color ${c}`}
                      className={`h-10 w-10 rounded-full ring-offset-2 active:scale-95 ${me.shirt === c ? 'ring-2 ring-violet-500' : 'ring-1 ring-neutral-300'}`} style={{ background: c }} />
                  ))}
                </div>
                <p className="mt-4 text-[14px] font-bold text-neutral-700">{me.name}’s hair</p>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {([['down', 'Down'], ['ponytail', 'Ponytail'], ['braids', 'Braids']] as [HairStyle, string][]).map(([s, label]) => (
                    <button key={s} onClick={() => change(me.id, { style: s })}
                      className={`flex flex-col items-center rounded-2xl py-2 active:scale-95 ${me.style === s ? 'bg-violet-100 ring-2 ring-violet-500' : 'bg-neutral-50 ring-1 ring-neutral-200'}`}>
                      <Portrait kid={{ ...me, style: s }} size={44} />
                      <span className="text-[13px] font-semibold">{label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <button onClick={onClose} className={`${BTN} mt-5 w-full bg-violet-500 text-white`}>{me ? `Let’s go, ${me.name}!` : 'Let’s go!'}</button>
            {grown === 'no' ? (
              <button onClick={() => setGrown('ask')} className="mt-3 w-full text-center text-[13px] font-semibold text-neutral-400 hover:text-neutral-600">👋 Grown-ups</button>
            ) : <Gate onPass={() => setGrown('yes')} onCancel={() => setGrown('no')} />}
          </>
        ) : <Grownups players={players} change={change} onDone={() => setGrown('no')} />}
      </div>
    </div>
  );
}

/** A question no 9-year-old does in her head, so the settings stay with the grown-ups. */
function Gate({ onPass, onCancel }: { onPass: () => void; onCancel: () => void }) {
  const [[a, b]] = useState(() => [13 + Math.floor(Math.random() * 15), 13 + Math.floor(Math.random() * 15)]);
  const [v, setV] = useState('');
  const [wrong, setWrong] = useState(false);
  return (
    <form className="mt-4 rounded-2xl bg-neutral-50 p-4" onSubmit={(e) => { e.preventDefault(); if (Number(v) === a * b) onPass(); else { setWrong(true); setV(''); } }}>
      <p className="text-[14px] font-semibold">For grown-ups: what’s {a} × {b}?</p>
      <div className="mt-2 flex gap-2">
        <input value={v} onChange={(e) => setV(e.target.value.replace(/\D/g, ''))} inputMode="numeric" autoFocus className="min-w-0 flex-1 rounded-full border border-neutral-300 px-4 py-2 text-[15px]" />
        <button className={`${BTN} bg-neutral-900 text-white`}>Go</button>
        <button type="button" onClick={onCancel} className={`${BTN} bg-neutral-200`}>Cancel</button>
      </div>
      {wrong && <p className="mt-2 text-[13px] text-rose-600">Not quite.</p>}
    </form>
  );
}

function Grownups({ players, change, onDone }: { players: Players; change: (id: Kid['id'], p: Partial<Kid>) => void; onDone: () => void }) {
  const [id, setId] = useState<Kid['id']>(players.kids.find((k) => k.id === players.who)?.id ?? players.kids[0].id);
  const kid = players.kids.find((k) => k.id === id)!;
  const c = kid.coach;
  const [notes, setNotes] = useState(kid.notes);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setNotes(kid.notes); setErr(null); }, [kid.id, kid.notes]);
  const coach = (patch: Partial<Coach>) => change(id, { coach: { ...c, ...patch } });
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const askKan = async () => {
    setBusy(true); setErr(null);
    try {
      const res = await fetch('/api/prototypes/kan/city/coach', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: kid.name, age: kid.age, notes, coach: c }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? 'Kan couldn’t read that.');
      change(id, { notes, coach: j.coach });
    } catch (e) { setErr(e instanceof Error ? e.message : 'Kan couldn’t read that.'); }
    setBusy(false);
  };

  return (
    <>
      <h3 className="pr-8 text-[20px] font-bold">For grown-ups</h3>
      <p className="mt-1 text-[13px] text-neutral-500">The zoo sizes every math question to whoever’s playing. Kept on this device.</p>
      <div className="mt-3 flex gap-2">
        {players.kids.map((k) => (
          <button key={k.id} onClick={() => setId(k.id)} className={`flex flex-1 items-center gap-2 rounded-2xl px-3 py-2 ${k.id === id ? 'bg-violet-100 ring-2 ring-violet-500' : 'bg-neutral-50 ring-1 ring-neutral-200'}`}>
            <Portrait kid={k} size={36} /><span className="font-bold">{k.name}</span>
          </button>
        ))}
      </div>

      <Row label="Age">
        <div className="flex items-center gap-2">
          <button onClick={() => change(id, { age: Math.max(4, kid.age - 1), coach: coachFor(Math.max(4, kid.age - 1)) })} className={`${BTN} bg-neutral-100 px-3`}>−</button>
          <span className="w-8 text-center text-[18px] font-bold">{kid.age}</span>
          <button onClick={() => change(id, { age: Math.min(14, kid.age + 1), coach: coachFor(Math.min(14, kid.age + 1)) })} className={`${BTN} bg-neutral-100 px-3`}>+</button>
        </div>
      </Row>
      <p className="-mt-1 text-[11px] text-neutral-400">Changing her age resets the math below to what’s usual for that age.</p>

      <Row label="Math she’s working on" stack>
        <div className="flex flex-wrap gap-1.5">
          {SKILLS.map((s) => (
            <button key={s.id} onClick={() => coach({ skills: toggle(c.skills, s.id) })} className={`rounded-full px-3 py-1.5 text-[13px] font-semibold ${c.skills.includes(s.id) ? 'bg-violet-500 text-white' : 'bg-neutral-100 text-neutral-500'}`}>{s.emoji} {s.label}</button>
          ))}
        </div>
      </Row>
      <Row label="Biggest answer">
        <select value={c.max} onChange={(e) => coach({ max: Number(e.target.value) })} className="rounded-full border border-neutral-300 px-3 py-1.5 text-[14px]">
          {[...new Set([20, 50, 100, 200, 500, 1000, 5000, 10000, c.max])].sort((a, b) => a - b).map((n) => <option key={n} value={n}>{n.toLocaleString('en-US')}</option>)}
        </select>
      </Row>
      {c.skills.includes('times') && (
        <Row label="Times tables" stack>
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
              <button key={n} onClick={() => coach({ tables: toggle(c.tables, n).sort((a, b) => a - b) })} className={`h-9 w-9 rounded-full text-[14px] font-bold ${c.tables.includes(n) ? 'bg-violet-500 text-white' : 'bg-neutral-100 text-neutral-500'}`}>{n}</button>
            ))}
          </div>
        </Row>
      )}
      <Row label="Read questions out loud"><Switch on={c.readAloud} set={(v) => coach({ readAloud: v })} /></Row>
      <Row label="Offer a hint (“How?”)"><Switch on={c.showHow} set={(v) => coach({ showHow: v })} /></Row>

      <div className="mt-4">
        <p className="text-[14px] font-bold">Notes for Kan about {kid.name}</p>
        <p className="text-[12px] text-neutral-500">What she’s learning in school, what’s hard, what she loves. Kan turns it into the settings above.</p>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} maxLength={1500}
          placeholder={`e.g. ${kid.name} is learning to borrow in subtraction. Big numbers frustrate her. She loves the penguins.`}
          className="mt-2 w-full rounded-2xl border border-neutral-300 px-3 py-2 text-[14px]" />
        <button onClick={askKan} disabled={busy || !notes.trim()} className={`${BTN} mt-2 w-full bg-violet-500 text-white`}>{busy ? 'Kan is reading…' : '🍄 Have Kan read my notes'}</button>
        {err && <p className="mt-2 text-[13px] text-rose-600">{err}</p>}
        {c.said && !err && <p className="mt-2 rounded-2xl bg-violet-50 px-3 py-2 text-[13px] text-violet-900">🍄 {c.said}</p>}
      </div>
      <button onClick={onDone} className={`${BTN} mt-5 w-full bg-neutral-900 text-white`}>Done</button>
    </>
  );
}

function Row({ label, children, stack }: { label: string; children: React.ReactNode; stack?: boolean }) {
  return (
    <div className={`mt-3 ${stack ? '' : 'flex items-center justify-between gap-3'}`}>
      <p className={`text-[14px] font-semibold ${stack ? 'mb-1.5' : ''}`}>{label}</p>
      {children}
    </div>
  );
}

function Switch({ on, set }: { on: boolean; set: (v: boolean) => void }) {
  return (
    <button onClick={() => set(!on)} role="switch" aria-checked={on} className={`relative h-7 w-12 rounded-full transition ${on ? 'bg-violet-500' : 'bg-neutral-300'}`}>
      <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  );
}

/**
 * Next to a question: read it out loud (and say it as soon as it shows, if she likes
 * that), and a "How?" hint if a grown-up turned hints on.
 */
export function QuizHelp({ text, sum }: { text: string; sum: string }) {
  const me = playing(usePlayers());
  const [how, setHow] = useState(false);
  const c = me?.coach;
  useEffect(() => { if (c?.readAloud) readAloud(text); }, [text, c?.readAloud]);
  if (!c || (!c.readAloud && !c.showHow)) return null;
  return (
    <div className="mt-2">
      <div className="flex justify-center gap-2">
        {c.readAloud && <button onClick={() => readAloud(text)} className="rounded-full bg-white px-3 py-1.5 text-[13px] font-semibold text-neutral-700 shadow-sm ring-1 ring-neutral-200 active:scale-95">🔊 Read it</button>}
        {c.showHow && <button onClick={() => setHow((h) => !h)} className="rounded-full bg-white px-3 py-1.5 text-[13px] font-semibold text-neutral-700 shadow-sm ring-1 ring-neutral-200 active:scale-95">💡 How?</button>}
      </div>
      {how && <p className="mt-2 rounded-2xl bg-white/80 px-3 py-2 text-[14px] text-neutral-700">{howTo(sum)}</p>}
    </div>
  );
}
