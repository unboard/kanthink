'use client';

import { useState } from 'react';
import { CARDS, type DemoCard } from '../data';

/**
 * 05 — HORIZON
 *
 * Attacks: "everything looks equally urgent."
 *
 * A kanban card from this morning and a card from last February are rendered
 * identically: same box, same weight, same crispness. The board has a horizontal
 * axis for *status* and no axis at all for *distance*, so the mind has to hold
 * the distance itself. That is the exhausting part.
 *
 * So: replace status with distance, and draw distance the way distance actually
 * looks. Now is close, sharp and large. Someday is far, small and genuinely out
 * of focus — you can see there is something there, you cannot read it, and that
 * is correct. Lean in (hover) and it resolves.
 *
 * Now holds three. Pull a fourth forward and something is pushed back, visibly,
 * and it tells you what. The trade is never silent.
 */

type Band = 'now' | 'next' | 'later' | 'someday';

const BANDS: { id: Band; label: string; z: number; blur: number; dim: number; weight: number }[] = [
  { id: 'someday', label: 'Someday', z: -430, blur: 3.4, dim: 0.3, weight: 1 },
  { id: 'later', label: 'Later', z: -270, blur: 1.9, dim: 0.46, weight: 1 },
  { id: 'next', label: 'Next', z: -125, blur: 0.7, dim: 0.68, weight: 1.15 },
  { id: 'now', label: 'Now', z: 0, blur: 0, dim: 1, weight: 1.9 },
];

const ORDER: Band[] = ['now', 'next', 'later', 'someday'];
const NOW_CAP = 3;

const START: Record<string, Band> = {};
CARDS.forEach((c) => {
  START[c.id] =
    c.column === 'week' ? 'next' : c.column === 'someday' ? 'someday' : c.column === 'waiting' ? 'later' : 'later';
});
START['c12'] = 'now';
START['c13'] = 'now';

export default function Horizon() {
  const [placement, setPlacement] = useState<Record<string, Band>>(START);
  const [nowOrder, setNowOrder] = useState<string[]>(['c12', 'c13']);
  const [leaned, setLeaned] = useState<Band | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const pool = CARDS.filter((c) => c.column !== 'done');
  const inBand = (b: Band) => pool.filter((c) => placement[c.id] === b);

  const say = (m: string) => {
    setMessage(m);
    setTimeout(() => setMessage(null), 2600);
  };

  const shift = (card: DemoCard, dir: -1 | 1) => {
    const cur = ORDER.indexOf(placement[card.id]);
    const target = ORDER[Math.min(ORDER.length - 1, Math.max(0, cur + dir))];
    if (target === placement[card.id]) return;

    const updates: Record<string, Band> = { [card.id]: target };
    let order = nowOrder.filter((id) => id !== card.id);

    if (target === 'now') {
      if (order.length >= NOW_CAP) {
        const evicted = order[0];
        order = order.slice(1);
        updates[evicted] = 'next';
        say(`“${pool.find((c) => c.id === evicted)?.title}” went back to Next. Now holds three.`);
      }
      order = [...order, card.id];
    }

    setPlacement((p) => ({ ...p, ...updates }));
    setNowOrder(order);
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div
        className="flex min-h-0 flex-1 flex-col justify-end gap-1 px-6 py-6 sm:px-12"
        style={{ perspective: '1000px', perspectiveOrigin: '50% 100%' }}
      >
        {BANDS.map((band) => {
          const near = leaned === band.id;
          const cards = inBand(band.id);
          return (
            <div
              key={band.id}
              onMouseEnter={() => setLeaned(band.id)}
              onMouseLeave={() => setLeaned(null)}
              className="min-h-0 origin-bottom transition-all duration-300 ease-out"
              style={{
                flex: band.weight,
                transform: `translateZ(${near ? Math.max(band.z, -60) : band.z}px)`,
                filter: `blur(${near ? 0 : band.blur}px)`,
                opacity: near ? 1 : band.dim,
              }}
            >
              <div className="flex h-full min-h-0 flex-col">
                <div className="flex shrink-0 items-baseline gap-3 border-b border-white/[0.08] pb-1.5">
                  <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/45">{band.label}</span>
                  <span className="font-mono text-[10px] tabular-nums text-white/25">{cards.length}</span>
                  {band.id === 'now' && (
                    <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.16em] text-white/25">
                      max {NOW_CAP}
                    </span>
                  )}
                </div>

                <ul className="min-h-0 flex-1 overflow-y-auto pt-1.5">
                  {cards.map((c) => (
                    <li key={c.id} className="group flex items-center gap-3 py-[3px]">
                      <button
                        onClick={() => shift(c, -1)}
                        disabled={band.id === 'now'}
                        className="min-w-0 flex-1 truncate text-left font-light tracking-tight text-white/85 transition-colors hover:text-violet-200 disabled:cursor-default disabled:hover:text-white/85"
                        style={{ fontSize: band.id === 'now' ? 22 : band.id === 'next' ? 16 : 14 }}
                        title={band.id === 'now' ? undefined : 'Pull forward'}
                      >
                        {c.title}
                      </button>
                      {band.id === 'someday' ? (
                        <span className="w-8 shrink-0" />
                      ) : (
                        <button
                          onClick={() => shift(c, 1)}
                          className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-white/40 opacity-0 transition-opacity hover:text-white group-hover:opacity-100"
                          title="Push back"
                        >
                          back
                        </button>
                      )}
                    </li>
                  ))}
                  {cards.length === 0 && (
                    <li className="py-1 text-sm font-light text-white/20">—</li>
                  )}
                </ul>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex h-9 shrink-0 items-center border-t border-white/[0.07] px-6 sm:px-12">
        <p className="truncate font-mono text-[10px] uppercase tracking-[0.16em] text-white/30">
          {message ?? 'Click a title to pull it forward · “back” to push it away'}
        </p>
      </div>
    </div>
  );
}
