'use client';

import { ACTION_LABEL, STATE_COLOR, type ConceptProps } from './types';

/**
 * Specimen study — Compact
 *
 * Same information, roughly half the height. The classification and the timestamp share
 * the top line, the summary clamps to two, and the key of facts collapses into the
 * control row instead of standing as its own block.
 *
 * This is the version that survives a board with a dozen shrooms on it, where the full
 * label would turn the column into a wall.
 */
export function SpecimenCompact({ shroom, index, isRunning, onRun, onEdit }: ConceptProps) {
  const accent = isRunning ? '#8b5cf6' : STATE_COLOR[shroom.state];

  return (
    <div className="group flex flex-col rounded-md border border-neutral-800 bg-[#141417] px-3.5 py-3 transition-colors hover:border-neutral-700 hover:bg-[#17171b]">
      <div className="mb-1.5 flex items-baseline gap-2 font-mono text-[9.5px] uppercase tracking-[0.14em]">
        <span className="text-neutral-600">{String(index + 1).padStart(3, '0')}</span>
        <span style={{ color: accent }}>
          {ACTION_LABEL[shroom.action]}
          {shroom.trigger ? ` / ${shroom.trigger}` : ''}
        </span>
        <span className="ml-auto flex-shrink-0 text-neutral-700">{shroom.lastRun ?? 'Never'}</span>
      </div>

      <h3 title={shroom.title} className="truncate text-[14px] font-semibold leading-snug tracking-tight text-neutral-100">
        {shroom.title}
      </h3>
      <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-neutral-500 wrap-anywhere">
        {shroom.summary}
      </p>

      <div className="mt-auto flex items-center gap-1.5 pt-2.5">
        <button
          onClick={onRun}
          disabled={isRunning}
          className="rounded border border-neutral-800 px-2.5 py-[3px] font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-300 transition-colors hover:border-violet-700 hover:bg-violet-500/10 hover:text-violet-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 disabled:opacity-40"
        >
          {isRunning ? 'Running' : 'Run'}
        </button>
        <button
          onClick={onEdit}
          className="rounded px-2 py-[3px] font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-600 transition-colors hover:bg-white/5 hover:text-neutral-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500"
        >
          Edit
        </button>
      </div>
    </div>
  );
}
