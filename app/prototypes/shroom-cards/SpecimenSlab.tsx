'use client';

import { ACTION_LABEL, STATE_COLOR, type ConceptProps } from './types';

/**
 * Specimen study — Slab
 *
 * The frame removed entirely. Rules do the framing, so nothing is boxed and the card
 * takes its shape from the type instead of a border.
 *
 * Boxiness is usually what makes a card feel heavy, and a specimen label was never really
 * a box — it's a printed strip. This is the lightest the direction goes while keeping the
 * catalogue number, the classification, and the key of facts.
 */
export function SpecimenSlab({ shroom, index, isRunning, onRun, onEdit }: ConceptProps) {
  const accent = isRunning ? '#8b5cf6' : STATE_COLOR[shroom.state];

  return (
    <div className="group flex flex-col px-1 py-1">
      <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.16em]">
        <span className="text-neutral-600">No. {String(index + 1).padStart(3, '0')}</span>
        <span aria-hidden className="h-px flex-1 bg-neutral-800" />
        <span style={{ color: accent }}>
          {ACTION_LABEL[shroom.action]}
          {shroom.trigger ? ` / ${shroom.trigger}` : ''}
        </span>
      </div>

      <h3 title={shroom.title} className="mt-3 truncate text-[19px] font-semibold leading-tight tracking-tight text-neutral-100">
        {shroom.title}
      </h3>
      <p className="mt-1.5 pb-4 text-[13px] leading-relaxed text-neutral-400 wrap-anywhere">
        {shroom.summary}
      </p>

      <div className="mt-auto border-t border-neutral-800 pt-2.5">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[10px] uppercase tracking-[0.12em]">
          <span className="text-neutral-600">
            Runs <span className="ml-1.5 text-neutral-400">{shroom.trigger ?? 'On request'}</span>
          </span>
          <span className="text-neutral-600">
            Last <span className="ml-1.5 text-neutral-400">{shroom.lastRun ?? 'Never'}</span>
          </span>

          <span className="ml-auto flex items-center gap-3">
            <button
              onClick={onRun}
              disabled={isRunning}
              className="uppercase tracking-[0.14em] text-neutral-300 underline decoration-neutral-700 underline-offset-4 transition-colors hover:text-violet-300 hover:decoration-violet-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 disabled:opacity-40"
            >
              {isRunning ? 'Running' : 'Run'}
            </button>
            <button
              onClick={onEdit}
              className="uppercase tracking-[0.14em] text-neutral-500 underline decoration-neutral-800 underline-offset-4 transition-colors hover:text-neutral-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500"
            >
              Edit
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
