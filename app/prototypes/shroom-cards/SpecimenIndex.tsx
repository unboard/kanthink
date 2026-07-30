'use client';

import { ACTION_LABEL, STATE_COLOR, type ConceptProps } from './types';

/**
 * Specimen study — Index Card
 *
 * The catalogue drawer rather than the specimen jar. Content sits on ruled baselines with
 * a margin rule down the left, the way a card in a physical index actually looks.
 *
 * The ruling isn't decoration — it's what makes a stack of these read as one catalogue,
 * and it gives the label/value key somewhere to sit that feels intentional rather than
 * like a leftover metadata row.
 */
export function SpecimenIndex({ shroom, index, isRunning, onRun, onEdit }: ConceptProps) {
  const accent = isRunning ? '#8b5cf6' : STATE_COLOR[shroom.state];

  return (
    <div
      className="group relative overflow-hidden rounded-sm bg-[#131316] transition-colors hover:bg-[#161619]"
      style={{
        // Ruled lines, pinned to the 22px rhythm the content below is set on
        backgroundImage: 'repeating-linear-gradient(to bottom, transparent 0 21px, #1f1f24 21px 22px)',
      }}
    >
      {/* Margin rule — the red line on a real index card, in Kan's violet */}
      <span aria-hidden className="absolute inset-y-0 left-9 w-px bg-violet-500/25" />

      <div className="relative py-3 pl-12 pr-4">
        <div className="flex h-[22px] items-center gap-2 font-mono text-[9.5px] uppercase tracking-[0.16em]">
          <span className="absolute left-0 w-9 text-center text-neutral-700">
            {String(index + 1).padStart(3, '0')}
          </span>
          <span style={{ color: accent }}>
            {ACTION_LABEL[shroom.action]}
            {shroom.trigger ? ` / ${shroom.trigger}` : ''}
          </span>
        </div>

        <h3 title={shroom.title} className="h-[22px] truncate text-[15px] font-semibold leading-[22px] tracking-tight text-neutral-100">
          {shroom.title}
        </h3>

        <p className="text-[12.5px] leading-[22px] text-neutral-400 wrap-anywhere">
          {shroom.summary}
        </p>

        <div className="flex h-[22px] items-center gap-4 font-mono text-[9.5px] uppercase tracking-[0.12em] text-neutral-600">
          <span>
            Last <span className="ml-1 text-neutral-400">{shroom.lastRun ?? 'Never'}</span>
          </span>
        </div>

        <div className="flex h-[22px] items-center gap-2">
          <button
            onClick={onRun}
            disabled={isRunning}
            className="font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-300 underline decoration-neutral-700 underline-offset-[5px] transition-colors hover:text-violet-300 hover:decoration-violet-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 disabled:opacity-40"
          >
            {isRunning ? 'Running' : 'Run'}
          </button>
          <span aria-hidden className="text-neutral-800">·</span>
          <button
            onClick={onEdit}
            className="font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-600 underline decoration-neutral-800 underline-offset-[5px] transition-colors hover:text-neutral-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500"
          >
            Edit
          </button>
        </div>
      </div>
    </div>
  );
}
