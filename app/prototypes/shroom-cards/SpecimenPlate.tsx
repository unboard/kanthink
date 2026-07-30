'use client';

import { ACTION_LABEL, STATE_COLOR, type ConceptProps } from './types';

/**
 * Specimen study — Plate
 *
 * The largest of the set, proportioned like a botanical plate. The classification runs
 * vertically down the left edge, which frees the whole width for the title and the
 * description and gives the card a tall, unhurried shape.
 *
 * Worth it when a shroom is something you read rather than scan — a handful of carefully
 * made automations rather than a dozen utilities.
 */
export function SpecimenPlate({ shroom, index, isRunning, onRun, onEdit }: ConceptProps) {
  const accent = isRunning ? '#8b5cf6' : STATE_COLOR[shroom.state];

  return (
    <div className="group flex overflow-hidden rounded-lg border border-neutral-800 bg-[#141417] transition-colors hover:border-neutral-700 hover:bg-[#17171b]">
      {/* Spine — classification set vertically, the plate's edge marking */}
      <div className="flex flex-shrink-0 flex-col items-center justify-between border-r border-neutral-800/80 bg-black/20 px-2.5 py-4">
        <span className="font-mono text-[9.5px] tracking-[0.16em] text-neutral-700">
          {String(index + 1).padStart(3, '0')}
        </span>
        <span
          className="font-mono text-[9.5px] uppercase tracking-[0.22em] whitespace-nowrap"
          style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', color: accent }}
        >
          {ACTION_LABEL[shroom.action]}
          {shroom.trigger ? ` · ${shroom.trigger}` : ''}
        </span>
        <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: accent }} />
      </div>

      <div className="min-w-0 flex-1 px-5 py-5">
        <h3 title={shroom.title} className="truncate text-[20px] font-semibold leading-tight tracking-tight text-neutral-100">
          {shroom.title}
        </h3>

        <p className="mt-2.5 text-[13.5px] leading-relaxed text-neutral-400 wrap-anywhere">
          {shroom.summary}
        </p>

        <div className="mt-5 flex items-end justify-between gap-4 border-t border-dashed border-neutral-800 pt-3">
          <dl className="space-y-1 font-mono text-[9.5px] uppercase tracking-[0.12em]">
            <div className="flex gap-2.5">
              <dt className="w-9 text-neutral-700">Runs</dt>
              <dd className="text-neutral-400">{shroom.trigger ?? 'On request'}</dd>
            </div>
            <div className="flex gap-2.5">
              <dt className="w-9 text-neutral-700">Last</dt>
              <dd className="text-neutral-400">{shroom.lastRun ?? 'Never'}</dd>
            </div>
          </dl>

          <div className="flex flex-shrink-0 items-center gap-1.5">
            <button
              onClick={onRun}
              disabled={isRunning}
              className="rounded border border-neutral-700 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-200 transition-colors hover:border-violet-600 hover:bg-violet-500/10 hover:text-violet-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 disabled:opacity-40"
            >
              {isRunning ? 'Running' : 'Run'}
            </button>
            <button
              onClick={onEdit}
              className="rounded px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-500 transition-colors hover:bg-white/5 hover:text-neutral-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500"
            >
              Edit
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
