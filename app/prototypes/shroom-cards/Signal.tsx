'use client';

import { STATE_COLOR, STATE_LABEL, type ConceptProps } from './types';

const BAR_COLOR: Record<'ran' | 'skipped' | 'failed', string> = {
  ran: '#34d399',
  skipped: '#fbbf24',
  failed: '#f87171',
};

const BAR_TITLE: Record<'ran' | 'skipped' | 'failed', string> = {
  ran: 'Ran',
  skipped: 'Skipped',
  failed: 'Failed',
};

/**
 * Concept 4 — Signal
 *
 * Built for the board that has twelve shrooms rather than two: a dense row you can stack
 * without the page turning into a wall of panels.
 *
 * The signature is the pulse — a strip of the last runs, green ran, amber skipped, red
 * failed. A shroom that's quietly declining to run is the failure mode you can't see
 * anywhere else, and here it's the most eye-catching thing on the card.
 */
export function Signal({ shroom, isRunning, onRun, onEdit }: ConceptProps) {
  const accent = isRunning ? '#8b5cf6' : STATE_COLOR[shroom.state];

  return (
    <div className="group rounded-lg bg-[#141417] px-4 py-3 transition-colors hover:bg-[#1a1a1f]">
      <div className="flex items-start gap-3">
        <span className="relative mt-[7px] flex h-2 w-2 flex-shrink-0">
          {isRunning && (
            <span
              className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 motion-reduce:animate-none"
              style={{ backgroundColor: accent }}
            />
          )}
          <span className="relative inline-flex h-2 w-2 rounded-full" style={{ backgroundColor: accent }} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <h3 className="truncate text-[14px] font-medium text-neutral-100">{shroom.title}</h3>
            <span className="flex-shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-neutral-600">
              {STATE_LABEL[shroom.state]}
            </span>
          </div>
          <p className="mt-0.5 line-clamp-1 text-[12.5px] text-neutral-500 wrap-anywhere">
            {shroom.summary}
          </p>
        </div>

        {/* Pulse — the shroom's last runs, newest at the right */}
        <div className="hidden flex-shrink-0 items-end gap-[3px] sm:flex" aria-hidden>
          {shroom.history.map((h, i) => (
            <span
              key={i}
              title={BAR_TITLE[h]}
              className="w-[3px] rounded-full"
              style={{
                height: h === 'ran' ? 16 : h === 'skipped' ? 9 : 6,
                backgroundColor: BAR_COLOR[h],
                opacity: 0.35 + (i / Math.max(shroom.history.length - 1, 1)) * 0.65,
              }}
            />
          ))}
        </div>

        <span className="hidden w-16 flex-shrink-0 text-right font-mono text-[11px] text-neutral-600 md:block">
          {shroom.lastRun ?? '—'}
        </span>

        {/* Controls hold their space so the row never reflows on hover */}
        <div className="flex flex-shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <button
            onClick={onRun}
            disabled={isRunning}
            className="rounded-md bg-white/5 px-2.5 py-1 text-[11.5px] font-medium text-neutral-200 transition-colors hover:bg-violet-600 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 disabled:opacity-40"
          >
            {isRunning ? '…' : 'Run'}
          </button>
          <button
            onClick={onEdit}
            className="rounded-md px-2 py-1 text-[11.5px] font-medium text-neutral-500 transition-colors hover:bg-white/5 hover:text-neutral-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500"
          >
            Edit
          </button>
        </div>
      </div>
    </div>
  );
}
