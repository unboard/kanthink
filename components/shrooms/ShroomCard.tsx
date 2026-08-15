'use client';

import { useMemo } from 'react';
import type { Channel, InstructionCard } from '@/lib/types';
import { describeShroom, type ShroomRunState } from '@/lib/shrooms/describe';

// Inline hex because SVG fill/stroke can't take a Tailwind class. These are the same
// values the rest of the board uses: green-500 for live, blue-500 for scheduled,
// neutral-500 for dormant, violet-500 while running.
const STATE_COLOR: Record<ShroomRunState, string> = {
  watching: '#22c55e',
  scheduled: '#3b82f6',
  manual: '#a1a1aa',
};

const ACTION_LABEL: Record<string, string> = {
  generate: 'Generate',
  modify: 'Modify',
  move: 'Move',
  report: 'Report',
};

/** Deterministic 0–1 sequence from a shroom's id. */
function seededRandom(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A spore print is how you actually identify a mushroom — rest the cap on paper and the
 * spores fall into a pattern specific to the species. Each shroom gets one drawn from its
 * id, so the same shroom always prints the same mark and no two print alike. It's an
 * identity you learn by sight, which is what a card in a long column needs, and it takes
 * the state colour so it doubles as the status light.
 */
function SporePrint({ id, color, live }: { id: string; color: string; live: boolean }) {
  const { spores, rays } = useMemo(() => {
    const rand = seededRandom(id);
    return {
      spores: Array.from({ length: 200 }, () => {
        const angle = rand() * Math.PI * 2;
        const radius = Math.pow(rand(), 0.55) * 25;
        return {
          x: 28 + Math.cos(angle) * radius,
          y: 28 + Math.sin(angle) * radius,
          r: 0.35 + rand() * 0.85,
          o: 0.25 + rand() * 0.6,
        };
      }),
      rays: Array.from({ length: 15 + Math.floor(rand() * 12) }, () => rand() * Math.PI * 2),
    };
  }, [id]);

  return (
    <svg viewBox="0 0 56 56" className="h-11 w-11 flex-shrink-0 sm:h-12 sm:w-12" aria-hidden>
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
        <circle key={i} cx={s.x} cy={s.y} r={s.r} fill={color} opacity={s.o * (live ? 1 : 0.5)} />
      ))}
      <circle cx={28} cy={28} r={26} fill="none" stroke={color} strokeWidth={0.5} opacity={0.22} />
    </svg>
  );
}

interface ShroomCardProps {
  shroom: InstructionCard;
  channel?: Channel;
  allShrooms: Record<string, InstructionCard>;
  /** Position in the list — becomes the specimen number. */
  index: number;
  isRunning?: boolean;
  onRun?: () => void;
  onEdit: () => void;
  /**
   * Take this card off whatever surface it's on. Only the thread passes it: a shroom
   * in a card thread is a copy you put there, so it can be cleared away without the
   * shroom itself going anywhere.
   */
  onRemove?: () => void;
  /** Override the run button's wording where "Run" alone would be ambiguous. */
  runLabel?: string;
}

/**
 * The shroom card, everywhere one is shown.
 *
 * One component for the desktop panel and the mobile sheet — they used to carry separate
 * markup, which is how they ended up describing the same shroom differently.
 */
export function ShroomCard({
  shroom,
  channel,
  allShrooms,
  index,
  isRunning = false,
  onRun,
  onEdit,
  onRemove,
  runLabel = 'Run',
}: ShroomCardProps) {
  const facts = describeShroom(shroom, channel, allShrooms);
  const accent = isRunning ? '#8b5cf6' : STATE_COLOR[facts.state];

  return (
    // flex-col + mt-auto on the footer keeps the action bar on the floor of the card, so
    // an equal-height grid row lines up instead of stepping. Deliberately NOT h-full:
    // grid items already stretch to their row, and in a plain vertical list — the mobile
    // sheet — the parent is a fixed-height scroller, so height:100% would blow one card
    // up to the full viewport.
    <div className="group flex flex-col rounded-lg border border-neutral-200 bg-white p-3.5 transition-colors hover:border-neutral-300 dark:border-neutral-700 dark:bg-neutral-800/50 dark:hover:border-neutral-600 dark:hover:bg-neutral-800">
      <div className="flex flex-1 gap-3 pb-3">
        <div className={isRunning ? 'animate-pulse motion-reduce:animate-none' : ''}>
          <SporePrint id={shroom.id} color={accent} live={facts.state !== 'manual'} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-baseline gap-x-2 font-mono text-[9.5px] uppercase tracking-[0.16em]">
            <span className="text-neutral-400 dark:text-neutral-500">
              {String(index + 1).padStart(3, '0')}
            </span>
            <span style={{ color: accent }}>
              {ACTION_LABEL[shroom.action] ?? shroom.action}
              {facts.trigger ? ` / ${facts.trigger}` : ''}
            </span>
            {facts.usesWeb && (
              <span className="text-neutral-400 dark:text-neutral-500">Web</span>
            )}
            {shroom.isGlobalResource && (
              <span className="text-violet-500 dark:text-violet-400">By Kanthink</span>
            )}
          </div>

          {/* One line. A wrapped shroom name pushes every card in the row taller for
              nothing — the full name is on the title attribute and in the editor. */}
          <h3
            title={shroom.title}
            className="truncate text-[15px] font-semibold leading-snug tracking-tight text-neutral-900 dark:text-neutral-100"
          >
            {shroom.title}
          </h3>

          <p className="mt-1 line-clamp-3 text-[12.5px] leading-relaxed text-neutral-500 dark:text-neutral-400 wrap-anywhere">
            {facts.summary}
          </p>

          {facts.chainsTo && (
            <div className="mt-2 flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-neutral-400 dark:text-neutral-500">
              <svg className="h-3 w-3 flex-shrink-0" viewBox="0 0 12 12" fill="none" aria-hidden>
                <path
                  d="M1 1v5.5a2 2 0 0 0 2 2h7M8 6l3 2.5L8 11"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="truncate">
                Then{' '}
                <span className="text-neutral-600 dark:text-neutral-300">{facts.chainsTo}</span>
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-dashed border-neutral-200 pt-2.5 dark:border-neutral-700">
        <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-neutral-400 dark:text-neutral-500">
          {facts.totalRuns > 0 ? `${facts.totalRuns} runs` : 'Never run'}
          {facts.lastRun && (
            <>
              <span className="mx-1.5 text-neutral-300 dark:text-neutral-600">·</span>
              {facts.lastRun}
            </>
          )}
        </span>

        <div className="flex flex-shrink-0 items-center gap-1.5">
          {onRun && (
            <button
              onClick={(e) => { e.stopPropagation(); onRun(); }}
              disabled={isRunning}
              className="rounded border border-neutral-300 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-700 transition-colors hover:border-violet-500 hover:bg-violet-50 hover:text-violet-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 disabled:opacity-40 dark:border-neutral-600 dark:text-neutral-200 dark:hover:border-violet-500 dark:hover:bg-violet-500/15 dark:hover:text-violet-300"
            >
              {isRunning ? 'Running' : runLabel}
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="rounded px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 dark:text-neutral-500 dark:hover:bg-white/5 dark:hover:text-neutral-200"
          >
            Edit
          </button>
          {onRemove && (
            <button
              onClick={(e) => { e.stopPropagation(); onRemove(); }}
              aria-label="Remove from thread"
              title="Remove from thread"
              className="rounded p-1 text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 dark:text-neutral-500 dark:hover:bg-red-500/10 dark:hover:text-red-400"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 14 14" fill="none" aria-hidden>
                <path
                  d="M3 3l8 8M11 3l-8 8"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
