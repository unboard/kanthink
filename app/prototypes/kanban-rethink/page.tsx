'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, X } from 'lucide-react';

import Spine from './concepts/Spine';
import Sort from './concepts/Sort';
import Decay from './concepts/Decay';
import Pressure from './concepts/Pressure';
import Horizon from './concepts/Horizon';

/**
 * Rethinking the board.
 *
 * The brief was a menu — vertically folded panels, one open, the rest reduced to
 * a spine — and the observation underneath it: a kanban board is easy to add to
 * and nearly impossible to keep. This round takes that seriously enough to stop
 * redesigning the card and start attacking the five separate reasons boards rot.
 *
 * Each concept is a whole board, running on the same deliberately-overloaded
 * data, and each one gives something up. That is the point: the current board
 * gives nothing up, which is why it fills.
 *
 * The navigation itself is the reference — the concepts fold to spines and only
 * one is ever open, which is also concept 01's argument. Eat your own cooking.
 */

const CONCEPTS = [
  {
    name: 'Spine',
    attacks: 'Everything is visible at once',
    line: 'One column open, the rest folded to a spine. The spine is the drop target, so you never need two columns open to move a card between them.',
    gives_up: 'Seeing the whole board.',
    Component: Spine,
  },
  {
    name: 'The Sort',
    attacks: 'Deciding means comparing everything',
    line: 'One card, four exits, a finite queue. Forty decisions about one thing instead of one decision about forty things — and unlike a board, it ends.',
    gives_up: 'Browsing. You get what you are given.',
    Component: Sort,
  },
  {
    name: 'Decay',
    attacks: 'Adding is free, removing is a decision',
    line: 'Attention is the only thing keeping a card alive. Neglected cards fade, shrink and fall into the compost. The board tidies itself; one click is a full reprieve.',
    gives_up: 'The promise that nothing is ever lost.',
    Component: Decay,
  },
  {
    name: 'Pressure',
    attacks: 'Nothing pushes back',
    line: 'A column is a fixed volume, not a scrolling list. Each card added squeezes the others until they are slivers. At the limit it is a wall, not a warning.',
    gives_up: 'The ability to say yes to one more.',
    Component: Pressure,
  },
  {
    name: 'Horizon',
    attacks: 'Everything looks equally urgent',
    line: 'Distance replaces status, drawn the way distance looks: Now is sharp and large, Someday is small and genuinely out of focus. Lean in to read it.',
    gives_up: 'Legibility of the far stuff — on purpose.',
    Component: Horizon,
  },
];

export default function KanbanRethinkPage() {
  const [active, setActive] = useState<number | null>(null);

  if (active === null) return <Index onOpen={setActive} />;

  const concept = CONCEPTS[active];
  const { Component } = concept;

  return (
    <div className="flex h-full min-h-0 bg-[#0c0c0c] text-neutral-100">
      {/* Desktop: the folded stack. Every concept is a spine; one is open. */}
      <nav className="hidden shrink-0 md:flex">
        <button
          onClick={() => setActive(null)}
          className="group relative w-[52px] shrink-0 border-r border-white/[0.07] transition-colors hover:bg-white/[0.03]"
          title="All concepts"
        >
          <X className="absolute left-1/2 top-6 h-3.5 w-3.5 -translate-x-1/2 text-white/35 transition-colors group-hover:text-white" />
          <span
            className="absolute bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] uppercase tracking-[0.2em] text-white/35 transition-colors group-hover:text-white"
            style={{ writingMode: 'vertical-rl', transform: 'translateX(-50%) rotate(180deg)' }}
          >
            Close
          </span>
        </button>

        {CONCEPTS.map((c, i) => {
          const isActive = i === active;
          return (
            <button
              key={c.name}
              onClick={() => setActive(i)}
              className={`group relative w-[52px] shrink-0 border-r border-white/[0.07] transition-colors ${
                isActive ? 'bg-white/[0.05]' : 'hover:bg-white/[0.03]'
              }`}
            >
              <span
                className={`absolute inset-x-0 top-6 text-center font-mono text-[10px] tabular-nums ${
                  isActive ? 'text-violet-400' : 'text-white/25'
                }`}
              >
                {String(i + 1).padStart(2, '0')}
              </span>
              <span
                className={`absolute bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap text-[13px] tracking-[0.14em] transition-colors ${
                  isActive ? 'text-white' : 'text-white/40 group-hover:text-white/85'
                }`}
                style={{ writingMode: 'vertical-rl', transform: 'translateX(-50%) rotate(180deg)' }}
              >
                {c.name}
              </span>
            </button>
          );
        })}
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile bar — the spines would eat the whole screen on a phone. */}
        <div className="flex shrink-0 items-center gap-3 border-b border-white/[0.07] px-4 py-3 md:hidden">
          <button onClick={() => setActive(null)} className="shrink-0 text-white/45">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span className="font-mono text-[10px] tabular-nums text-violet-400">
            {String(active + 1).padStart(2, '0')}
          </span>
          <span className="truncate text-sm tracking-wide text-white">{concept.name}</span>
        </div>

        {/* What this one is arguing, kept above the board so the board stays clean. */}
        <header className="shrink-0 border-b border-white/[0.07] px-6 py-4 sm:px-12">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/30">
            Against — {concept.attacks}
          </p>
          <p className="mt-2 max-w-3xl text-sm font-light leading-relaxed text-white/55">{concept.line}</p>
          <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.16em] text-amber-200/40">
            Gives up — {concept.gives_up}
          </p>
        </header>

        <div className="min-h-0 flex-1">
          <Component />
        </div>
      </div>
    </div>
  );
}

function Index({ onOpen }: { onOpen: (i: number) => void }) {
  return (
    <div className="h-full overflow-y-auto bg-[#0c0c0c] text-neutral-100">
      <div className="mx-auto max-w-4xl px-6 py-12 sm:px-10 sm:py-20">
        <Link
          href="/prototypes"
          className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-white/35 transition-colors hover:text-white"
        >
          <ArrowLeft className="h-3 w-3" /> Prototypes
        </Link>

        <h1 className="mt-10 max-w-2xl text-4xl font-light leading-[1.08] tracking-tight text-white sm:text-6xl">
          A board you can finish.
        </h1>

        <p className="mt-7 max-w-2xl text-lg font-light leading-relaxed text-white/50">
          Kanban is a manufacturing instrument wearing a to-do list costume. On a factory floor it
          worked because the column had a physical limit and the work physically left. Strip both of
          those out — which every software kanban did — and what remains is a very good tool for
          <em className="not-italic text-white/75"> accumulating</em> and no tool at all for deciding.
        </p>

        <div className="mt-14 border-t border-white/[0.08] pt-8">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/30">
            Five reasons a board rots
          </p>
          <ul className="mt-5 max-w-2xl space-y-3 text-[15px] font-light leading-relaxed text-white/45">
            <li><span className="text-white/70">Adding costs a second, removing costs a decision.</span> The asymmetry alone guarantees the board fills.</li>
            <li><span className="text-white/70">The backlog is always in your eyeline.</span> Every glance at the one thing you&rsquo;re doing includes forty you aren&rsquo;t.</li>
            <li><span className="text-white/70">Nothing pushes back.</span> WIP limits are a red number, and a number is not a force.</li>
            <li><span className="text-white/70">A card has no age.</span> February and this morning render identically.</li>
            <li><span className="text-white/70">Processing means comparing everything to everything.</span> So you look at it, feel the weight, and close the tab.</li>
          </ul>
        </div>

        {/* The menu, in the shape that started this. */}
        <div className="mt-16">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/30">
            Five boards, one per reason
          </p>

          <ul className="mt-6 border-t border-white/[0.08]">
            {CONCEPTS.map((c, i) => (
              <li key={c.name}>
                <button
                  onClick={() => onOpen(i)}
                  className="group flex w-full items-start gap-5 border-b border-white/[0.08] py-6 text-left sm:gap-8"
                >
                  <span className="mt-3 shrink-0 font-mono text-[11px] tabular-nums text-white/25 transition-colors group-hover:text-violet-400">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-3xl font-light tracking-tight text-white/85 transition-colors group-hover:text-white sm:text-[40px]">
                      {c.name}
                    </span>
                    <span className="mt-2 block font-mono text-[10px] uppercase tracking-[0.16em] text-white/30">
                      Against — {c.attacks}
                    </span>
                    <span className="mt-2.5 block max-w-xl text-[15px] font-light leading-relaxed text-white/45">
                      {c.line}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-16 max-w-2xl">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/30">If it were one thing</p>
          <p className="mt-5 text-lg font-light leading-relaxed text-white/50">
            Take <span className="text-white/80">Decay</span> as the substrate — it is the only one that
            fixes the board while you are not looking, and the only one that needs no discipline to
            work. Put <span className="text-white/80">The Sort</span> on top of it as the way in, so
            &quot;open the board&quot; means &quot;make five decisions&quot; rather than &quot;survey the damage&quot;. Borrow
            the <span className="text-white/80">Spine</span> for layout, because a folded column is a
            column that cannot accuse you. Keep <span className="text-white/80">Pressure</span> on one
            column only — the current one — where a wall is a kindness rather than an obstruction.
          </p>
          <p className="mt-5 text-lg font-light leading-relaxed text-white/50">
            <span className="text-white/80">Horizon</span> is the one to leave alone for now. It is the
            most beautiful and the most expensive: it asks you to give up status entirely, and status
            is the thing everyone else on a shared board is reading.
          </p>
        </div>

        <p className="mt-16 font-mono text-[10px] uppercase tracking-[0.16em] text-white/20">
          Nothing here is wired into the app.
        </p>
      </div>
    </div>
  );
}
