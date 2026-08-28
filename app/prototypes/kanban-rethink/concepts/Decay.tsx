'use client';

import { useEffect, useRef, useState } from 'react';
import { CARDS, ageLabel } from '../data';

/**
 * 03 — DECAY
 *
 * Attacks: "columns are unbounded, and grooming is a chore nobody does."
 *
 * The reason boards become unmanageable is that adding costs one second and
 * removing costs a decision. The asymmetry is the whole disease. Every proposed
 * cure so far has been *more* work — archive sweeps, quarterly reviews, WIP
 * limits — which is asking the person who couldn't do the small chore to do a
 * bigger one.
 *
 * So: attention is the only thing keeping a card alive. Untouched cards fade,
 * shrink and sink; at zero they drop into the compost and the board is clean
 * again without anyone tidying it. Touching a card is a full reprieve — one
 * click, no dialog — so nothing important can actually be lost by someone who
 * is paying any attention at all.
 *
 * Drag the scrubber. Watch six months pass.
 */

const LIFE = 90; // days of neglect a card survives

export default function Decay() {
  const [elapsed, setElapsed] = useState(0);
  const [touched, setTouched] = useState<Record<string, number>>({});
  const [playing, setPlaying] = useState(false);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      setElapsed((e) => {
        const next = e + dt * 0.06; // ~60 days per second
        if (next >= 180) {
          setPlaying(false);
          return 180;
        }
        return next;
      });
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [playing]);

  const scored = CARDS.filter((c) => c.column !== 'done').map((c) => {
    const base = touched[c.id] !== undefined ? elapsed - touched[c.id] : c.age + elapsed;
    const vitality = Math.max(0, Math.min(1, 1 - base / LIFE));
    return { ...c, effAge: base, vitality };
  });

  const alive = scored.filter((c) => c.vitality > 0).sort((a, b) => b.vitality - a.vitality);
  const composted = scored.filter((c) => c.vitality === 0);

  const touch = (id: string) => setTouched((t) => ({ ...t, [id]: elapsed }));

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Scrubber */}
      <div className="shrink-0 border-b border-white/[0.07] px-6 py-5 sm:px-12">
        <div className="flex items-center gap-5">
          <button
            onClick={() => {
              if (elapsed >= 180) setElapsed(0);
              setPlaying((p) => !p);
            }}
            className="w-24 shrink-0 rounded border border-white/15 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-white/55 transition-colors hover:border-white/35 hover:text-white"
          >
            {playing ? 'Pause' : elapsed >= 180 ? 'Replay' : 'Run time'}
          </button>

          <input
            type="range"
            min={0}
            max={180}
            step={1}
            value={Math.round(elapsed)}
            onChange={(e) => {
              setPlaying(false);
              setElapsed(Number(e.target.value));
            }}
            className="h-1 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-white/10 accent-violet-400"
          />

          <span className="w-28 shrink-0 text-right font-mono text-[11px] tabular-nums text-white/45">
            +{Math.round(elapsed)} days
          </span>
        </div>

        <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.16em] text-white/25">
          {alive.length} alive · {composted.length} composted · click a card to revive it
        </p>
      </div>

      {/* The living board */}
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 sm:px-12">
        <ul>
          {alive.map((c) => (
            <li key={c.id}>
              <button
                onClick={() => touch(c.id)}
                className="group flex w-full items-baseline gap-4 border-b border-white/[0.05] py-2.5 text-left sm:gap-6"
                style={{ opacity: 0.18 + c.vitality * 0.82 }}
              >
                <span
                  className="min-w-0 flex-1 truncate font-light tracking-tight text-white transition-colors group-hover:text-violet-200"
                  style={{ fontSize: `${14 + c.vitality * 14}px` }}
                >
                  {c.title}
                </span>

                {/* Remaining life, as a bar you read without reading. */}
                <span className="h-[2px] w-16 shrink-0 rounded-full bg-white/10 sm:w-28">
                  <span
                    className="block h-[2px] rounded-full"
                    style={{
                      width: `${c.vitality * 100}%`,
                      background: c.vitality < 0.25 ? 'rgb(248 113 113 / 0.8)' : 'rgb(167 139 250 / 0.75)',
                    }}
                  />
                </span>

                <span className="w-12 shrink-0 text-right font-mono text-[10px] tabular-nums text-white/30">
                  {ageLabel(Math.round(c.effAge))}
                </span>
              </button>
            </li>
          ))}
        </ul>

        {alive.length === 0 && (
          <p className="py-16 text-center text-2xl font-light text-white/25">
            Nothing survived. Nothing was doing anything.
          </p>
        )}
      </div>

      {/* Compost */}
      <div className="max-h-[34%] shrink-0 overflow-y-auto border-t border-white/[0.07] bg-black/30 px-6 py-4 sm:px-12">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/30">
          Compost · {composted.length}
        </p>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {composted.map((c) => (
            <button
              key={c.id}
              onClick={() => touch(c.id)}
              className="rounded-full border border-white/[0.08] px-3 py-1 text-xs font-light text-white/25 transition-colors hover:border-violet-400/40 hover:text-violet-200"
            >
              {c.title}
            </button>
          ))}
          {composted.length === 0 && (
            <span className="text-xs font-light text-white/20">Empty — nothing has been neglected long enough yet.</span>
          )}
        </div>
      </div>
    </div>
  );
}
