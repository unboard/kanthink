'use client';

import { useEffect, useMemo, useState } from 'react';
import { BoardMock, Cap } from './BoardMock';
import { COLUMNS, STATE_COLOR, STATE_LABEL, ACTION_LABEL, type DemoShroom, type OptionProps } from './types';

function Dot({ state }: { state: DemoShroom['state'] }) {
  return <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ background: STATE_COLOR[state] }} />;
}

function colName(id: string | null) {
  return COLUMNS.find((c) => c.id === id)?.name ?? null;
}

/* ────────────────────────────────────────────────────────────────────────────
   6 · Header Caps
   A facepile, but of shrooms. The channel header already carries the members
   pile, so this is a pattern the board has taught once already — and shrooms
   are closer to members than to settings.
   ──────────────────────────────────────────────────────────────────────────── */

export function HeaderCaps({ shrooms, runningId, onRun }: OptionProps) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <BoardMock
      label="Cost: zero layout — it borrows header space the icons weren't using."
      slots={{
        header: (
          <div className="relative flex items-center">
            <div className="flex items-center -space-x-1.5">
              {shrooms.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setOpen(open === s.id ? null : s.id)}
                  className={`relative flex h-7 w-7 items-center justify-center rounded-full ring-2 ring-[#0f0f12] transition-transform hover:z-10 hover:scale-110 ${
                    runningId === s.id ? 'animate-pulse' : ''
                  }`}
                  style={{ background: `${STATE_COLOR[s.state]}1f`, color: STATE_COLOR[s.state] }}
                  title={s.title}
                >
                  <Cap size={14} />
                </button>
              ))}
              <button className="relative flex h-7 w-7 items-center justify-center rounded-full bg-white/[0.06] text-[13px] text-neutral-500 ring-2 ring-[#0f0f12] hover:text-neutral-300">
                +
              </button>
            </div>

            {open && (() => {
              const s = shrooms.find((x) => x.id === open)!;
              return (
                <div className="absolute right-0 top-9 z-30 w-[260px] rounded-xl border border-white/[0.09] bg-[#141418] p-3 shadow-2xl">
                  <div className="flex items-center gap-2">
                    <Dot state={s.state} />
                    <span className="text-[13px] font-medium text-neutral-100">{s.title}</span>
                  </div>
                  <p className="mt-1.5 text-[11.5px] leading-relaxed text-neutral-400">{s.blurb}</p>
                  <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.1em] text-neutral-600">
                    {STATE_LABEL[s.state]} · {s.trigger ?? 'on demand'} · {s.lastRun ? `ran ${s.lastRun}` : 'never run'}
                  </p>
                  <div className="mt-2.5 flex gap-1.5">
                    <button
                      onClick={() => { onRun(s); setOpen(null); }}
                      className="flex-1 rounded-lg bg-violet-600 px-2 py-1.5 text-[11.5px] font-medium text-white hover:bg-violet-500"
                    >
                      Run now
                    </button>
                    <button className="rounded-lg border border-white/[0.09] px-2.5 py-1.5 text-[11.5px] text-neutral-300 hover:bg-white/[0.05]">
                      Edit
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        ),
      }}
    />
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   7 · Card Caps
   Nothing is on screen until a card is under the cursor, then the shrooms that
   can act on *that* card grow along its edge. The most contextual answer, and
   the least discoverable — you have to reach before it tells you anything.
   ──────────────────────────────────────────────────────────────────────────── */

export function CardCaps({ shrooms, runningId, onRun }: OptionProps) {
  const applicable = shrooms.filter((s) => s.cardScoped);

  return (
    <BoardMock
      label="Cost: zero, until you hover. Shows only the shrooms that can act on that card."
      slots={{
        cardAccessory: () => (
          <div className="pointer-events-none absolute -bottom-2.5 right-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
            {applicable.map((s) => (
              <button
                key={s.id}
                onClick={() => onRun(s)}
                className={`flex h-6 w-6 items-center justify-center rounded-full border shadow-md transition-transform hover:scale-110 ${
                  runningId === s.id
                    ? 'animate-pulse border-violet-500/50 bg-violet-500/25 text-violet-200'
                    : 'border-white/[0.09] bg-[#1d1d22] text-neutral-500 hover:text-violet-300'
                }`}
                title={`${s.title} — ${ACTION_LABEL[s.action].toLowerCase()} this card`}
              >
                <Cap size={13} />
              </button>
            ))}
          </div>
        ),
        underHeader: (
          <div className="border-y border-white/[0.05] px-4 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-700">
            Hover any card ↓
          </div>
        ),
      }}
    />
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   8 · Living Ticker
   Not a control surface — a presence. One line that says what the shrooms are
   actually doing, cycling slowly. It answers "are they alive?", which is the
   question a lost shroom is really failing to answer.
   ──────────────────────────────────────────────────────────────────────────── */

export function LivingTicker({ shrooms, onRun }: OptionProps) {
  const [i, setI] = useState(0);

  const lines = useMemo(
    () =>
      shrooms.map((s) => ({
        shroom: s,
        text:
          s.state === 'watching'
            ? `watching ${colName(s.watches)} — ${s.lastRun ? `last ran ${s.lastRun}` : 'not yet run'}`
            : s.state === 'scheduled'
              ? `next run ${s.trigger} — ${s.lastRun ? `last ran ${s.lastRun}` : 'not yet run'}`
              : `on demand — ${s.lastRun ? `last ran ${s.lastRun}` : 'never run'}`,
      })),
    [shrooms]
  );

  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % lines.length), 2600);
    return () => clearInterval(t);
  }, [lines.length]);

  const cur = lines[i];

  return (
    <BoardMock
      label="Cost: 24px of height. Reads as status, not as a menu — you can ignore it."
      slots={{
        underHeader: (
          <button
            onClick={() => onRun(cur.shroom)}
            className="group flex w-full items-center gap-2 border-y border-white/[0.05] px-4 py-1.5 text-left"
          >
            <span className="relative flex h-1.5 w-1.5 flex-shrink-0">
              <span
                className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
                style={{ background: STATE_COLOR[cur.shroom.state] }}
              />
              <span
                className="relative inline-flex h-1.5 w-1.5 rounded-full"
                style={{ background: STATE_COLOR[cur.shroom.state] }}
              />
            </span>
            <span key={cur.shroom.id} className="flex min-w-0 animate-sprout items-baseline gap-1.5">
              <span className="text-[11.5px] font-medium text-neutral-300">{cur.shroom.title}</span>
              <span className="truncate text-[11.5px] text-neutral-600">{cur.text}</span>
            </span>
            <span className="ml-auto flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
              <span className="text-[11px] text-violet-400">Run now</span>
            </span>
            <span className="ml-2 flex flex-shrink-0 gap-1">
              {lines.map((_, n) => (
                <span
                  key={n}
                  className={`h-1 w-1 rounded-full ${n === i ? 'bg-neutral-500' : 'bg-neutral-800'}`}
                />
              ))}
            </span>
          </button>
        ),
      }}
    />
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   9 · Spore Palette
   Zero chrome. Press S — or type / in any card composer — and the shrooms come
   to you. Fastest for anyone who knows, invisible to anyone who doesn't, so it
   is really a companion to one of the others rather than an answer on its own.
   ──────────────────────────────────────────────────────────────────────────── */

export function SporePalette({ shrooms, runningId, onRun }: OptionProps) {
  const [open, setOpen] = useState(true);
  const [q, setQ] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
      if ((e.key === 's' || e.key === 'S') && !open && !(e.target as HTMLElement)?.closest?.('input')) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const filtered = shrooms.filter((s) => s.title.toLowerCase().includes(q.toLowerCase()));

  return (
    <BoardMock
      label="Cost: zero layout, all discoverability. Press S to reopen it."
      slots={{
        header: (
          <button
            onClick={() => setOpen(true)}
            className="flex items-center gap-1.5 rounded-md border border-white/[0.07] px-2 py-1 text-neutral-600 hover:border-violet-500/25 hover:text-violet-300"
          >
            <Cap size={12} />
            <kbd className="font-mono text-[10px]">S</kbd>
          </button>
        ),
        overlay: open ? (
          <div className="absolute inset-0 z-30 flex items-start justify-center bg-black/40 pt-10 backdrop-blur-[1px]">
            <div className="w-[380px] overflow-hidden rounded-xl border border-white/[0.1] bg-[#141418] shadow-2xl">
              <div className="flex items-center gap-2 border-b border-white/[0.07] px-3 py-2.5">
                <Cap size={14} className="text-violet-400" />
                <input
                  autoFocus
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Run a shroom…"
                  className="flex-1 bg-transparent text-[13px] text-neutral-100 placeholder:text-neutral-600 focus:outline-none"
                />
                <button onClick={() => setOpen(false)} className="font-mono text-[10px] text-neutral-600">
                  ESC
                </button>
              </div>
              <div className="max-h-[240px] overflow-y-auto p-1.5">
                {filtered.map((s, n) => (
                  <button
                    key={s.id}
                    onClick={() => { onRun(s); setOpen(false); }}
                    className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left ${
                      n === 0 ? 'bg-white/[0.06]' : 'hover:bg-white/[0.04]'
                    }`}
                  >
                    <Dot state={s.state} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] text-neutral-200">{s.title}</span>
                      <span className="block truncate text-[11px] text-neutral-600">{s.blurb}</span>
                    </span>
                    {runningId === s.id && <span className="text-[10px] text-violet-400">running</span>}
                  </button>
                ))}
                {filtered.length === 0 && (
                  <p className="px-2 py-6 text-center text-[12px] text-neutral-600">Nothing matches.</p>
                )}
              </div>
            </div>
          </div>
        ) : null,
      }}
    />
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   10 · Mycelium
   Shrooms live in the gutters — the only part of a board that was never carrying
   anything. Threads run between the columns a shroom connects; the cap sits on
   the thread. Hover one and its run lights up across the board.
   ──────────────────────────────────────────────────────────────────────────── */

const COL_W = 224;
const GAP = 12;
const PAD = 16;
/** Centre of the gutter to the right of column `i`. */
const gutterX = (i: number) => PAD + (i + 1) * (COL_W + GAP) - GAP / 2;
const colIndex = (id: string | null) => COLUMNS.findIndex((c) => c.id === id);

export function Mycelium({ shrooms, runningId, onRun }: OptionProps) {
  const [hover, setHover] = useState<string | null>(null);

  // Each shroom gets a spot in the gutter beside the column it reads from.
  const placed = shrooms.map((s, n) => {
    const src = colIndex(s.watches);
    const gi = src >= 0 ? src : COLUMNS.length - 2;
    const stack = shrooms.slice(0, n).filter((o) => colIndex(o.watches) === src).length;
    return { shroom: s, x: gutterX(gi), y: 58 + stack * 74, gi, src, dst: colIndex(s.movesTo) };
  });

  return (
    <BoardMock
      label="Cost: zero — the gutters were empty. Threads sit behind the cards, never over them."
      slots={{
        underlay: (
          <svg className="pointer-events-none absolute inset-0 z-0 h-full w-full" aria-hidden>
            {/* Resting filaments: a faint vertical thread down each gutter */}
            {COLUMNS.slice(0, -1).map((_, i) => (
              <path
                key={i}
                d={`M${gutterX(i)} 8 C${gutterX(i) - 5} 90, ${gutterX(i) + 5} 190, ${gutterX(i)} 320`}
                stroke="#ffffff"
                strokeOpacity={0.05}
                strokeWidth={1}
                fill="none"
              />
            ))}
            {/* The hovered (or running) shroom's actual route, lit up */}
            {placed.map(({ shroom, x, y, src, dst }) => {
              const live = hover === shroom.id || runningId === shroom.id;
              if (!live || src < 0) return null;
              const from = PAD + src * (COL_W + GAP) + COL_W / 2;
              const to = dst >= 0 ? PAD + dst * (COL_W + GAP) + COL_W / 2 : from;
              return (
                <g key={shroom.id}>
                  <path
                    d={`M${from} ${y} Q${x} ${y - 26} ${to} ${y}`}
                    stroke={STATE_COLOR[shroom.state]}
                    strokeOpacity={0.5}
                    strokeWidth={1.25}
                    strokeDasharray="3 4"
                    fill="none"
                  />
                  <circle cx={from} cy={y} r={2.5} fill={STATE_COLOR[shroom.state]} fillOpacity={0.7} />
                  {dst >= 0 && <circle cx={to} cy={y} r={2.5} fill={STATE_COLOR[shroom.state]} fillOpacity={0.7} />}
                </g>
              );
            })}
          </svg>
        ),
        overlay: (
          <div className="pointer-events-none absolute inset-0 z-20">
            {placed.map(({ shroom: s, x, y }) => (
              <div key={s.id} className="pointer-events-auto absolute" style={{ left: x - 11, top: y - 11 }}>
                <button
                  onMouseEnter={() => setHover(s.id)}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => onRun(s)}
                  className={`flex h-[22px] w-[22px] items-center justify-center rounded-full border transition-transform hover:scale-125 ${
                    runningId === s.id ? 'animate-pulse' : ''
                  }`}
                  style={{
                    background: '#0f0f12',
                    borderColor: `${STATE_COLOR[s.state]}55`,
                    color: STATE_COLOR[s.state],
                  }}
                  title={s.title}
                >
                  <Cap size={12} />
                </button>
                {hover === s.id && (
                  <div className="absolute left-7 top-0 z-30 w-[190px] rounded-lg border border-white/[0.09] bg-[#141418] p-2 shadow-2xl">
                    <p className="text-[12px] font-medium text-neutral-100">{s.title}</p>
                    <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.1em] text-neutral-600">
                      {ACTION_LABEL[s.action]}
                      {s.movesTo ? ` ${colName(s.watches)} → ${colName(s.movesTo)}` : ` ${colName(s.watches) ?? 'the board'}`}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        ),
      }}
    />
  );
}
