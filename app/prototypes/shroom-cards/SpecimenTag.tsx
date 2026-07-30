'use client';

import { ACTION_LABEL, STATE_COLOR, type ConceptProps } from './types';

/**
 * Specimen study — Tag
 *
 * The label as a physical object: a tag tied to the thing it describes, with a punched
 * eyelet and a clipped corner where the string would go.
 *
 * The classification sits in the eyelet strip rather than as a line of text, which buys
 * back a whole row and gives the card an obvious anchor point for the state colour. The
 * clipped corner is the one piece of pure craft here — everything else stays plain.
 */
export function SpecimenTag({ shroom, index, isRunning, onRun, onEdit }: ConceptProps) {
  const accent = isRunning ? '#8b5cf6' : STATE_COLOR[shroom.state];

  return (
    <div
      className="group relative flex flex-col bg-[#141417] transition-colors hover:bg-[#17171b]"
      style={{
        // Clipped top-right corner — where the string passes through
        clipPath: 'polygon(0 0, calc(100% - 18px) 0, 100% 18px, 100% 100%, 0 100%)',
        borderRadius: 6,
      }}
    >
      {/* Eyelet strip */}
      <div className="flex items-center gap-2.5 border-b border-dashed border-neutral-800 px-4 py-2.5">
        <span
          aria-hidden
          className="h-2.5 w-2.5 flex-shrink-0 rounded-full border-2"
          style={{ borderColor: accent }}
        />
        <span className="font-mono text-[9.5px] uppercase tracking-[0.16em]" style={{ color: accent }}>
          {ACTION_LABEL[shroom.action]}
          {shroom.trigger ? ` / ${shroom.trigger}` : ''}
        </span>
        <span className="ml-auto pr-4 font-mono text-[9.5px] tracking-[0.14em] text-neutral-700">
          {String(index + 1).padStart(3, '0')}
        </span>
      </div>

      <div className="flex flex-1 flex-col px-4 py-3.5">
        <h3 title={shroom.title} className="truncate text-[16px] font-semibold leading-snug tracking-tight text-neutral-100">
          {shroom.title}
        </h3>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-neutral-400 wrap-anywhere">
          {shroom.summary}
        </p>

        <div className="mt-auto flex items-center justify-between gap-3 pt-3.5">
          <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-neutral-600">
            Last <span className="ml-1 text-neutral-400">{shroom.lastRun ?? 'Never'}</span>
          </span>

          <div className="flex flex-shrink-0 items-center gap-1.5">
            <button
              onClick={onRun}
              disabled={isRunning}
              className="rounded-full border border-neutral-700 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-200 transition-colors hover:border-violet-600 hover:bg-violet-500/10 hover:text-violet-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 disabled:opacity-40"
            >
              {isRunning ? 'Running' : 'Run'}
            </button>
            <button
              onClick={onEdit}
              className="rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-500 transition-colors hover:bg-white/5 hover:text-neutral-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500"
            >
              Edit
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
