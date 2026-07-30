'use client';

import { ACTION_LABEL, STATE_COLOR, type ConceptProps } from './types';

/**
 * Specimen study — Field Notes
 *
 * A specimen sheet with the collector's annotation still on it. The annotation is the one
 * thing a shroom has that ordinary automation doesn't: it remembers what you rejected and
 * changes what it produces next time.
 *
 * That memory lives in the drawer today, which means the most interesting thing about a
 * shroom is also the least visible. Here it's on the front of the card, in a hand-added
 * register — indented, italic, marked with a pen tick — so it reads as something written
 * onto the specimen rather than another field of the record.
 */
export function SpecimenFieldNotes({ shroom, index, isRunning, onRun, onEdit }: ConceptProps) {
  const accent = isRunning ? '#8b5cf6' : STATE_COLOR[shroom.state];

  return (
    <div className="group flex flex-col rounded-lg border border-neutral-800 bg-[#141417] transition-colors hover:border-neutral-700 hover:bg-[#17171b]">
      <div className="flex-1 px-4 pb-3.5 pt-3.5">
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
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-neutral-400 wrap-anywhere">
          {shroom.summary}
        </p>

        {/* The annotation — what it has taken from your rejections */}
        {shroom.learned && (
          <div className="mt-3 flex gap-2 rounded-r border-l-2 border-violet-500/40 bg-violet-500/[0.06] py-2 pl-2.5 pr-3">
            <svg
              className="mt-[3px] h-3 w-3 flex-shrink-0 text-violet-400/70"
              viewBox="0 0 12 12"
              fill="none"
              aria-hidden
            >
              <path d="M1 6.5 4 9.5 11 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <p className="text-[12px] italic leading-relaxed text-violet-200/70 wrap-anywhere">
              <span className="font-mono text-[9px] not-italic uppercase tracking-[0.14em] text-violet-400/60">
                Learned{' '}
              </span>
              {shroom.learned}
            </p>
          </div>
        )}
      </div>

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-dashed border-neutral-800 px-4 py-2.5">
        <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-neutral-600">
          {shroom.totalRuns} runs
          <span className="mx-1.5 text-neutral-800">·</span>
          {shroom.lastRun ?? 'Never'}
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
