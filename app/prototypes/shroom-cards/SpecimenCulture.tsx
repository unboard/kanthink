'use client';

import { ACTION_LABEL, STATE_COLOR, seededRandom, type ConceptProps } from './types';

/**
 * Specimen study — Culture
 *
 * The visible mushroom is the small part; the organism is the mycelium underneath. A
 * shroom that has run two hundred times has more behind it than one you made yesterday,
 * and nothing on the card ever said so.
 *
 * So the background is a culture spreading from the corner, its density set by lifetime
 * runs. It's ambient — you'd never read it deliberately — but a well-established shroom
 * looks different from a new one at a glance, which is the point.
 */
function Mycelium({ id, color, runs }: { id: string; color: string; runs: number }) {
  const rand = seededRandom(id);
  // Growth caps out around 200 runs so a long-lived shroom stays legible
  const density = Math.min(runs / 200, 1);
  const strands = Math.round(6 + density * 26);

  const paths = Array.from({ length: strands }, () => {
    const angle = -0.15 + rand() * 1.3; // fan out from the bottom-left origin
    const len = 40 + rand() * (90 + density * 90);
    const x2 = Math.cos(angle) * len;
    const y2 = -Math.sin(angle) * len;
    const cx = x2 * (0.35 + rand() * 0.3) + (rand() - 0.5) * 26;
    const cy = y2 * (0.35 + rand() * 0.3) + (rand() - 0.5) * 26;
    return `M0,140 Q${cx},${140 + cy} ${x2},${140 + y2}`;
  });

  return (
    <svg
      viewBox="0 0 240 140"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden
    >
      {paths.map((d, i) => (
        <path
          key={i}
          d={d}
          fill="none"
          stroke={color}
          strokeWidth={0.5}
          opacity={0.05 + rand() * 0.16}
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}

export function SpecimenCulture({ shroom, index, isRunning, onRun, onEdit }: ConceptProps) {
  const accent = isRunning ? '#8b5cf6' : STATE_COLOR[shroom.state];

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-lg border border-neutral-800 bg-[#141417] transition-colors hover:border-neutral-700">
      <Mycelium id={shroom.id} color={accent} runs={shroom.totalRuns} />

      <div className="relative flex flex-1 flex-col px-4 pb-3 pt-3.5">
        <div className="mb-1.5 flex items-baseline gap-2 font-mono text-[9.5px] uppercase tracking-[0.16em]">
          <span className="text-neutral-700">{String(index + 1).padStart(3, '0')}</span>
          <span style={{ color: accent }}>
            {ACTION_LABEL[shroom.action]}
            {shroom.trigger ? ` / ${shroom.trigger}` : ''}
          </span>
        </div>

        <h3 title={shroom.title} className="truncate text-[16px] font-semibold leading-snug tracking-tight text-neutral-100">
          {shroom.title}
        </h3>
        <p className="mt-1.5 max-w-[46ch] text-[12.5px] leading-relaxed text-neutral-400 wrap-anywhere">
          {shroom.summary}
        </p>

        <div className="mt-auto flex items-center justify-between gap-3 pt-4">
          <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-neutral-500">
            <span className="text-neutral-300">{shroom.totalRuns}</span> runs
            <span className="mx-1.5 text-neutral-700">·</span>
            {shroom.lastRun ?? 'Never'}
          </span>
          <div className="flex flex-shrink-0 items-center gap-1.5">
            <button
              onClick={onRun}
              disabled={isRunning}
              className="rounded border border-neutral-700 bg-[#141417]/80 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-200 backdrop-blur-sm transition-colors hover:border-violet-600 hover:bg-violet-500/10 hover:text-violet-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 disabled:opacity-40"
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
    </div>
  );
}
