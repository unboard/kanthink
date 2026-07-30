'use client';

import { ACTION_LABEL, STATE_COLOR, seededRandom, type ConceptProps } from './types';

/**
 * Specimen study — Spore Print
 *
 * A spore print is how you actually identify a mushroom: rest the cap on paper overnight
 * and the spores fall into a pattern unique to the species. So every shroom gets one,
 * drawn deterministically from its id — the same shroom always prints the same mark, and
 * no two shrooms print alike.
 *
 * It's an identity you learn by sight rather than by reading, which is what a card in a
 * long column actually needs. The print takes the state colour, so it doubles as the
 * status light without needing a separate dot.
 */
function Print({ id, color, live }: { id: string; color: string; live: boolean }) {
  const rand = seededRandom(id);
  // Radial scatter, denser toward the centre the way real spores fall
  const spores = Array.from({ length: 220 }, () => {
    const angle = rand() * Math.PI * 2;
    const radius = Math.pow(rand(), 0.55) * 25;
    return {
      x: 28 + Math.cos(angle) * radius,
      y: 28 + Math.sin(angle) * radius,
      r: 0.35 + rand() * 0.85,
      o: 0.25 + rand() * 0.6,
    };
  });
  // Gill rays — the radial streaks a cap leaves behind
  const rays = Array.from({ length: 15 + Math.floor(rand() * 12) }, () => rand() * Math.PI * 2);

  return (
    <svg viewBox="0 0 56 56" className="h-12 w-12 flex-shrink-0 sm:h-14 sm:w-14" aria-hidden>
      {rays.map((a, i) => (
        <line
          key={i}
          x1={28 + Math.cos(a) * 6}
          y1={28 + Math.sin(a) * 6}
          x2={28 + Math.cos(a) * 24}
          y2={28 + Math.sin(a) * 24}
          stroke={color}
          strokeWidth={0.4}
          opacity={0.18}
        />
      ))}
      {spores.map((s, i) => (
        <circle key={i} cx={s.x} cy={s.y} r={s.r} fill={color} opacity={s.o * (live ? 1 : 0.55)} />
      ))}
      <circle cx={28} cy={28} r={26} fill="none" stroke={color} strokeWidth={0.5} opacity={0.22} />
    </svg>
  );
}

export function SporePrint({ shroom, index, isRunning, onRun, onEdit }: ConceptProps) {
  const accent = isRunning ? '#8b5cf6' : STATE_COLOR[shroom.state];

  return (
    // flex-col + mt-auto on the footer keeps the action bar on the floor of the card.
    // Not h-full: grid items already stretch to their row, and in a fixed-height scroller
    // height:100% would blow a single card up to fill the whole viewport.
    <div className="group flex flex-col rounded-lg border border-neutral-700 bg-neutral-800/50 p-4 transition-colors hover:border-neutral-600 hover:bg-neutral-800">
      <div className="flex flex-1 gap-3.5 pb-3.5 sm:gap-4">
        <div className={isRunning ? 'animate-pulse motion-reduce:animate-none' : ''}>
          <Print id={shroom.id} color={accent} live={shroom.state !== 'manual'} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-baseline gap-x-2 font-mono text-[9.5px] uppercase tracking-[0.16em]">
            <span className="text-neutral-500">{String(index + 1).padStart(3, '0')}</span>
            <span style={{ color: accent }}>
              {ACTION_LABEL[shroom.action]}
              {shroom.trigger ? ` / ${shroom.trigger}` : ''}
            </span>
          </div>

          <h3 title={shroom.title} className="truncate text-[16px] font-semibold leading-snug tracking-tight text-neutral-100">
            {shroom.title}
          </h3>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-neutral-400 wrap-anywhere">
            {shroom.summary}
          </p>

          {/* Hand-off. A chained shroom sets off another one when it finishes, which is
              invisible today until you open the drawer and read the chain field. */}
          {shroom.chainsTo && (
            <div className="mt-2.5 flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-neutral-500">
              <svg className="h-3 w-3 flex-shrink-0 text-neutral-600" viewBox="0 0 12 12" fill="none" aria-hidden>
                <path
                  d="M1 1v5.5a2 2 0 0 0 2 2h7M8 6l3 2.5L8 11"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="truncate">
                Then <span className="text-neutral-300">{shroom.chainsTo}</span>
              </span>
            </div>
          )}
        </div>
      </div>

      {/* mt-auto pins this to the bottom edge whatever the summary length */}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-dashed border-neutral-700 pt-3">
        <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-neutral-500">
          {shroom.totalRuns} runs
          <span className="mx-1.5 text-neutral-600">·</span>
          {shroom.lastRun ?? 'Never'}
        </span>
        <div className="flex flex-shrink-0 items-center gap-1.5">
          <button
            onClick={onRun}
            disabled={isRunning}
            className="rounded border border-neutral-600 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-200 transition-colors hover:border-violet-500 hover:bg-violet-500/15 hover:text-violet-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 disabled:opacity-40"
          >
            {isRunning ? 'Running' : 'Run'}
          </button>
          <button
            onClick={onEdit}
            className="rounded px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-500 transition-colors hover:bg-white/5 hover:text-neutral-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500"
          >
            Edit
          </button>
        </div>
      </div>
    </div>
  );
}
