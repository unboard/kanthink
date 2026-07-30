'use client';

import { STATE_COLOR, STATE_LABEL, type ConceptProps } from './types';

/**
 * Concept 1 — Standing Order
 *
 * The card is a sentence, not a control panel. No icons anywhere: at rest it's a title,
 * a description, and one quiet status line, which is all you need when you're scanning
 * eight of them. Run and Edit are words that gain contrast on hover rather than buttons
 * competing with the title for attention.
 *
 * The signature is the left rail — a 2px edge whose colour *is* the state. You read a
 * column of these and see which shrooms are awake without reading a word.
 */
export function StandingOrder({ shroom, isRunning, onRun, onEdit }: ConceptProps) {
  const accent = isRunning ? '#8b5cf6' : STATE_COLOR[shroom.state];

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-xl bg-[#141417] transition-colors hover:bg-[#17171b]">
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[2px] transition-colors"
        style={{ backgroundColor: accent }}
      />

      <div className="flex flex-1 flex-col py-4 pl-5 pr-4">
        <div className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-500">
          <span className="relative flex h-1.5 w-1.5">
            {isRunning && (
              <span
                className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 motion-reduce:animate-none"
                style={{ backgroundColor: accent }}
              />
            )}
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ backgroundColor: accent }} />
          </span>
          <span style={{ color: isRunning ? accent : undefined }}>
            {isRunning ? 'Running' : STATE_LABEL[shroom.state]}
          </span>
          {shroom.trigger && (
            <>
              <span className="text-neutral-700">/</span>
              <span>{shroom.trigger}</span>
            </>
          )}
        </div>

        <h3 title={shroom.title} className="mb-1.5 truncate text-[15px] font-medium leading-snug text-neutral-100">
          {shroom.title}
        </h3>
        <p className="max-w-[52ch] text-[13px] leading-relaxed text-neutral-400 wrap-anywhere">
          {shroom.summary}
        </p>

        <div className="mt-auto flex items-center justify-between pt-4">
          <span className="font-mono text-[11px] text-neutral-600">
            {shroom.lastRun ? `Ran ${shroom.lastRun}` : 'Never run'}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={onRun}
              disabled={isRunning}
              className="rounded-md px-2.5 py-1 text-[12px] font-medium text-neutral-500 transition-colors hover:bg-white/5 hover:text-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 disabled:opacity-40"
            >
              {isRunning ? 'Running' : 'Run'}
            </button>
            <button
              onClick={onEdit}
              className="rounded-md px-2.5 py-1 text-[12px] font-medium text-neutral-500 transition-colors hover:bg-white/5 hover:text-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500"
            >
              Edit
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
