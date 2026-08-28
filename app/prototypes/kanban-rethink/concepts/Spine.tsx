'use client';

import { useState } from 'react';
import { CARDS, COLUMNS, ageLabel, type ColumnId, type DemoCard } from '../data';

/**
 * 01 — SPINE
 *
 * Attacks: "everything is visible at once."
 *
 * A kanban board shows you five columns because it can, not because you can act
 * on five columns. The cost is that the backlog is permanently in your eyeline —
 * every glance at the one thing you're doing includes forty things you aren't.
 *
 * So: exactly one column is open. The rest fold down to a spine — a name, a
 * count, nothing else. The spine is not a tab. It is also the drop target, which
 * is the trick that makes the folding survivable: you never need two columns open
 * to move a card between them. Select a card, hit a spine, it's gone.
 *
 * Kept from kanban: place, and movement-as-decision.
 * Dropped: the guilt surface, and horizontal scroll.
 */
export default function Spine() {
  const [cards, setCards] = useState<DemoCard[]>(CARDS);
  const [open, setOpen] = useState<ColumnId>('inbox');
  const [picked, setPicked] = useState<string | null>(null);
  const [justMoved, setJustMoved] = useState<ColumnId | null>(null);

  const move = (to: ColumnId) => {
    if (!picked) return;
    setCards((cs) => cs.map((c) => (c.id === picked ? { ...c, column: to, age: 0 } : c)));
    setPicked(null);
    setJustMoved(to);
    setTimeout(() => setJustMoved(null), 550);
  };

  const openCards = cards.filter((c) => c.column === open);

  return (
    <div className="flex h-full min-h-0 select-none">
      {COLUMNS.map((col) => {
        const count = cards.filter((c) => c.column === col.id).length;
        const isOpen = col.id === open;

        if (!isOpen) {
          return (
            <button
              key={col.id}
              onClick={() => (picked ? move(col.id) : setOpen(col.id))}
              className={`group relative w-[46px] shrink-0 border-r border-white/[0.07] transition-colors sm:w-[58px] ${
                picked ? 'hover:bg-violet-500/[0.09]' : 'hover:bg-white/[0.03]'
              } ${justMoved === col.id ? 'bg-violet-500/15' : ''}`}
            >
              {/* Count, pinned to the top like a page number. */}
              <span className="absolute inset-x-0 top-5 text-center font-mono text-[10px] tabular-nums text-white/25">
                {String(count).padStart(2, '0')}
              </span>

              <span
                className={`absolute bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] uppercase tracking-[0.18em] transition-colors ${
                  picked ? 'text-violet-300/80' : 'text-white/40 group-hover:text-white/80'
                }`}
                style={{ writingMode: 'vertical-rl', transform: 'translateX(-50%) rotate(180deg)' }}
              >
                {picked ? `Move to ${col.name}` : col.name}
              </span>
            </button>
          );
        }

        return (
          <section key={col.id} className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <header className="flex shrink-0 items-baseline gap-4 px-6 pt-8 sm:px-12">
              <h2 className="text-3xl font-light tracking-tight text-white sm:text-4xl">{col.name}</h2>
              <span className="font-mono text-[11px] text-white/30">{count}</span>
            </header>

            <p className="shrink-0 px-6 pt-3 font-mono text-[10px] uppercase tracking-[0.16em] text-white/25 sm:px-12">
              {picked ? 'Now pick a spine' : 'Pick a card'}
            </p>

            <ul className="min-h-0 flex-1 overflow-y-auto px-6 pb-16 pt-5 sm:px-12">
              {openCards.map((card, i) => {
                const isPicked = card.id === picked;
                return (
                  <li key={card.id}>
                    <button
                      onClick={() => setPicked(isPicked ? null : card.id)}
                      className="group flex w-full items-baseline gap-4 border-b border-white/[0.05] py-3 text-left sm:gap-6 sm:py-4"
                    >
                      <span
                        className={`w-6 shrink-0 font-mono text-[10px] tabular-nums transition-colors ${
                          isPicked ? 'text-violet-400' : 'text-white/20'
                        }`}
                      >
                        {String(i + 1).padStart(2, '0')}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span
                          className={`block truncate text-xl font-light tracking-tight transition-colors sm:text-[26px] ${
                            isPicked ? 'text-violet-200' : 'text-white/85 group-hover:text-white'
                          }`}
                        >
                          {card.title}
                        </span>
                        {isPicked && card.note && (
                          <span className="mt-1 block text-sm text-white/40">{card.note}</span>
                        )}
                      </span>

                      <span className="shrink-0 font-mono text-[10px] tabular-nums text-white/20">
                        {ageLabel(card.age)}
                      </span>
                    </button>
                  </li>
                );
              })}

              {openCards.length === 0 && (
                <li className="py-10 text-lg font-light text-white/25">Nothing here.</li>
              )}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
