'use client';

import { useEffect, useRef, useState } from 'react';
import { CARDS, type DemoCard } from '../data';

/**
 * 04 — PRESSURE
 *
 * Attacks: "nothing pushes back."
 *
 * WIP limits are the right idea implemented as a scold: a red number appears and
 * you ignore it, because a number is not a force. Meanwhile the column just keeps
 * scrolling, so the tenth card costs exactly as much as the first.
 *
 * So: a column is a fixed volume, not a scrolling list. Cards are elastic. Each
 * new one squeezes the others — first the notes go, then the breathing room, then
 * the cards are slivers you can barely read. You watch your own work get harder
 * to see, which is the honest representation of what adding work does.
 *
 * At the limit the column simply cannot take another card. Not a warning: a wall.
 * Finish something or drop something.
 */

const GAP = 8;
const MIN_H = 30;
const IDEAL_PER_SIZE = 74;

export default function Pressure() {
  const boxRef = useRef<HTMLDivElement>(null);
  const [boxH, setBoxH] = useState(480);

  const [inColumn, setInColumn] = useState<DemoCard[]>(CARDS.filter((c) => c.column === 'week'));
  const [pool, setPool] = useState<DemoCard[]>(CARDS.filter((c) => c.column === 'inbox'));
  const [refused, setRefused] = useState(false);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setBoxH(entry.contentRect.height));
    ro.observe(el);
    setBoxH(el.getBoundingClientRect().height);
    return () => ro.disconnect();
  }, []);

  const n = inColumn.length;
  const gaps = Math.max(0, n - 1) * GAP;
  const available = Math.max(0, boxH - gaps);
  const idealTotal = inColumn.reduce((s, c) => s + c.size * IDEAL_PER_SIZE, 0);
  const scale = idealTotal > 0 ? Math.min(1, available / idealTotal) : 1;

  const heights = inColumn.map((c) => Math.max(MIN_H, c.size * IDEAL_PER_SIZE * scale));
  const floorTotal = (n + 1) * MIN_H + n * GAP; // what one more card would need
  const full = floorTotal > boxH;

  const next = pool[0];
  const load = Math.min(1, idealTotal / Math.max(1, available));

  const add = () => {
    if (!next) return;
    if (full) {
      setRefused(true);
      setTimeout(() => setRefused(false), 900);
      return;
    }
    setInColumn((cs) => [...cs, next]);
    setPool((p) => p.slice(1));
  };

  const finish = (id: string) => setInColumn((cs) => cs.filter((c) => c.id !== id));

  return (
    <div className="flex h-full min-h-0 flex-col px-6 py-6 sm:px-12 sm:py-8">
      <header className="flex shrink-0 items-end justify-between gap-6">
        <div>
          <h2 className="text-2xl font-light tracking-tight text-white sm:text-3xl">This week</h2>
          <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-white/30">
            {n} in the column · click one to finish it
          </p>
        </div>

        {/* Load, as a gauge you feel rather than read. */}
        <div className="w-28 shrink-0 sm:w-44">
          <div className="h-[3px] w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${load * 100}%`,
                background: full ? 'rgb(248 113 113 / 0.9)' : load > 0.8 ? 'rgb(251 191 36 / 0.85)' : 'rgb(167 139 250 / 0.8)',
              }}
            />
          </div>
          <p className="mt-2 text-right font-mono text-[10px] uppercase tracking-[0.16em] text-white/35">
            {full ? 'Full' : `${Math.round(load * 100)}% pressure`}
          </p>
        </div>
      </header>

      {/* The volume. It does not scroll. That is the entire point. */}
      <div
        ref={boxRef}
        className={`relative mt-5 min-h-0 flex-1 overflow-hidden rounded-lg border transition-colors duration-200 ${
          refused ? 'border-red-400/60' : full ? 'border-amber-400/25' : 'border-white/[0.09]'
        }`}
        style={{ padding: 0 }}
      >
        <div className="absolute inset-0 flex flex-col" style={{ gap: GAP }}>
          {inColumn.map((c, i) => {
            const h = heights[i];
            const roomy = h > 62;
            return (
              <button
                key={c.id}
                onClick={() => finish(c.id)}
                className="group flex w-full shrink-0 items-center overflow-hidden border-b border-white/[0.05] bg-white/[0.02] px-4 text-left transition-[height] duration-300 ease-out last:border-b-0 hover:bg-white/[0.05]"
                style={{ height: h }}
              >
                <span className="min-w-0 flex-1">
                  <span
                    className="block truncate font-light tracking-tight text-white/90 transition-all duration-300"
                    style={{ fontSize: roomy ? 18 : 13 }}
                  >
                    {c.title}
                  </span>
                  {roomy && c.note && (
                    <span className="mt-1 block truncate text-xs font-light text-white/35">{c.note}</span>
                  )}
                </span>
                <span className="ml-4 shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-transparent transition-colors group-hover:text-emerald-300">
                  Done
                </span>
              </button>
            );
          })}
        </div>

        {refused && (
          <div className="absolute inset-x-0 bottom-0 bg-red-500/12 px-4 py-3 text-center text-sm font-light text-red-200">
            No room. Something has to leave first.
          </div>
        )}
      </div>

      {/* The queue outside the wall. */}
      <div className="mt-5 flex shrink-0 items-center gap-4">
        <button
          onClick={add}
          disabled={!next}
          className={`shrink-0 rounded-md border px-4 py-2.5 text-sm transition-colors disabled:opacity-30 ${
            full
              ? 'border-red-400/40 text-red-200 hover:bg-red-400/10'
              : 'border-white/15 text-white/70 hover:border-white/35 hover:text-white'
          }`}
        >
          Add next
        </button>
        <p className="min-w-0 flex-1 truncate text-sm font-light text-white/40">
          {next ? next.title : 'Nothing waiting.'}
          {pool.length > 1 && <span className="ml-2 font-mono text-[10px] text-white/20">+{pool.length - 1} behind it</span>}
        </p>
      </div>
    </div>
  );
}
