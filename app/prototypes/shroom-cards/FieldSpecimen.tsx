'use client';

import { ACTION_LABEL, STATE_COLOR, type ConceptProps } from './types';

/**
 * Concept 3 — Field Specimen
 *
 * The risk of the set. A shroom is catalogued like something collected: specimen number,
 * classification line, hairline frame with corner ticks, and a small key of facts in
 * label/value pairs.
 *
 * The field-guide language earns its place because the product already calls these things
 * shrooms — the metaphor is the product's own, not decoration borrowed from elsewhere. The
 * numbering is real ordering (position on the board), not 01/02/03 sprinkled on for looks.
 */
export function FieldSpecimen({ shroom, index, isRunning, onRun, onEdit }: ConceptProps) {
  const accent = isRunning ? '#8b5cf6' : STATE_COLOR[shroom.state];
  const specimenNo = String(index + 1).padStart(3, '0');

  return (
    <div className="group relative flex flex-col rounded-lg bg-[#141417] p-1.5 transition-colors hover:bg-[#17171b]">
      {/* Collection frame — hairline box with ticked corners */}
      <div className="relative flex-1 border border-neutral-800 px-4 py-4">
        {(['-top-px -left-px border-l border-t', '-top-px -right-px border-r border-t',
           '-bottom-px -left-px border-l border-b', '-bottom-px -right-px border-r border-b'] as const).map((pos) => (
          <span key={pos} aria-hidden className={`absolute h-2 w-2 border-neutral-600 ${pos}`} />
        ))}

        <div className="mb-3 flex items-baseline justify-between font-mono text-[10px] uppercase tracking-[0.16em]">
          <span className="text-neutral-600">No. {specimenNo}</span>
          <span style={{ color: accent }}>
            {ACTION_LABEL[shroom.action]}
            {shroom.trigger ? ` · ${shroom.trigger}` : ''}
          </span>
        </div>

        <h3 title={shroom.title} className="truncate text-[17px] font-semibold leading-tight tracking-tight text-neutral-100">
          {shroom.title}
        </h3>

        <div className="my-3 border-t border-dashed border-neutral-800" />

        <p className="text-[13px] leading-relaxed text-neutral-400 wrap-anywhere">
          {shroom.summary}
        </p>

        <dl className="mt-4 space-y-1 font-mono text-[10.5px] uppercase tracking-[0.1em]">
          <div className="flex gap-3">
            <dt className="w-16 flex-shrink-0 text-neutral-600">Runs</dt>
            <dd className="text-neutral-400">{shroom.trigger ?? 'Only when asked'}</dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-16 flex-shrink-0 text-neutral-600">Last</dt>
            <dd className="text-neutral-400">{shroom.lastRun ?? 'Never'}</dd>
          </div>
        </dl>
      </div>

      <div className="mt-auto flex gap-1.5 px-1 pb-0.5 pt-2">
        <button
          onClick={onRun}
          disabled={isRunning}
          className="flex-1 rounded-md border border-neutral-800 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-neutral-300 transition-colors hover:border-violet-700 hover:bg-violet-500/10 hover:text-violet-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 disabled:opacity-40"
        >
          {isRunning ? 'Running' : 'Run'}
        </button>
        <button
          onClick={onEdit}
          className="rounded-md border border-neutral-800 px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-neutral-500 transition-colors hover:bg-white/5 hover:text-neutral-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500"
        >
          Edit
        </button>
      </div>
    </div>
  );
}
