'use client';

import { ACTION_LABEL, STATE_COLOR, type ConceptProps } from './types';

const RUN_COLOR: Record<'ran' | 'skipped' | 'failed', string> = {
  ran: '#34d399',
  skipped: '#fbbf24',
  failed: '#f87171',
};

const RUN_LABEL: Record<'ran' | 'skipped' | 'failed', string> = {
  ran: 'Ran',
  skipped: 'Skipped',
  failed: 'Failed',
};

/**
 * Specimen study — Gills
 *
 * The gills under a cap are where a mushroom's spores are actually made — the working
 * part, not the decorative one. Here they're the run history: one gill per run, tallest
 * and brightest at the right, fading back into older runs.
 *
 * The anatomy carries real information rather than being drawn on. A shroom that's been
 * quietly skipping shows amber gills, which is exactly the failure you can't see anywhere
 * else on a board.
 */
export function SpecimenGills({ shroom, index, isRunning, onRun, onEdit }: ConceptProps) {
  const accent = isRunning ? '#8b5cf6' : STATE_COLOR[shroom.state];
  const gills = shroom.history.slice(-14);

  return (
    <div className="group flex flex-col overflow-hidden rounded-lg border border-neutral-800 bg-[#141417] transition-colors hover:border-neutral-700 hover:bg-[#17171b]">
      <div className="flex-1 px-4 pb-3 pt-3.5">
        <div className="mb-1.5 flex items-baseline gap-2 font-mono text-[9.5px] uppercase tracking-[0.16em]">
          <span className="text-neutral-700">{String(index + 1).padStart(3, '0')}</span>
          <span style={{ color: accent }}>
            {ACTION_LABEL[shroom.action]}
            {shroom.trigger ? ` / ${shroom.trigger}` : ''}
          </span>
          <span className="ml-auto text-neutral-700">{shroom.lastRun ?? 'Never'}</span>
        </div>

        <h3 title={shroom.title} className="truncate text-[16px] font-semibold leading-snug tracking-tight text-neutral-100">
          {shroom.title}
        </h3>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-neutral-400 wrap-anywhere">
          {shroom.summary}
        </p>
      </div>

      {/* Gill bed — one blade per run, newest at the right */}
      <div
        className="flex items-end gap-[2px] px-4 pb-0.5"
        role="img"
        aria-label={`Last ${gills.length} runs: ${gills.map((g) => RUN_LABEL[g]).join(', ')}`}
      >
        {gills.map((g, i) => (
          <span
            key={i}
            title={RUN_LABEL[g]}
            className="flex-1 rounded-t-[1px] transition-all duration-200 group-hover:opacity-100"
            style={{
              height: g === 'ran' ? 14 : g === 'skipped' ? 8 : 5,
              backgroundColor: RUN_COLOR[g],
              opacity: 0.2 + (i / Math.max(gills.length - 1, 1)) * 0.6,
            }}
          />
        ))}
      </div>

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-neutral-800/70 px-4 py-2.5">
        <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-neutral-600">
          {shroom.totalRuns} runs
        </span>
        <div className="flex flex-shrink-0 items-center gap-1.5">
          <button
            onClick={onRun}
            disabled={isRunning}
            className="rounded border border-neutral-700 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-200 transition-colors hover:border-violet-600 hover:bg-violet-500/10 hover:text-violet-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 disabled:opacity-40"
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
