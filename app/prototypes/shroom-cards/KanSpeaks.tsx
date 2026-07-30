'use client';

import { STATE_COLOR, STATE_LABEL, type ConceptProps } from './types';

/**
 * Concept 2 — Kan Speaks
 *
 * The description is written in Kan's own voice: "I read every new bookmark in Inbox and
 * write a deep analysis onto the card." A shroom is a standing agent, and first person is
 * the most honest way to say what a standing agent does — it turns a config summary into
 * something that reads like a job someone holds.
 *
 * Button labels stay literal (Run, Edit). The character is in the description, not in the
 * controls, so nobody has to decode a cute verb to use the thing.
 */
export function KanSpeaks({ shroom, isRunning, onRun, onEdit }: ConceptProps) {
  const accent = STATE_COLOR[shroom.state];

  return (
    <div className="flex flex-col rounded-2xl bg-[#141417] p-4 transition-colors hover:bg-[#17171b]">
      <div className="flex flex-1 gap-3">
        <div className="relative flex-shrink-0">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-500/15">
            <span className="text-base leading-none">🍄</span>
          </div>
          <span
            className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-[#141417]"
            style={{ backgroundColor: isRunning ? '#8b5cf6' : accent }}
          />
        </div>

        <div className="min-w-0 flex-1">
          <h3 title={shroom.title} className="mb-2 truncate text-[15px] font-medium leading-snug text-neutral-100">
            {shroom.title}
          </h3>

          {/* Speech bubble — the notch ties the words to the mascot rather than the card */}
          <div className="relative rounded-xl rounded-tl-sm bg-[#1e1e23] px-3.5 py-3">
            <span
              aria-hidden
              className="absolute -left-1 top-2 h-2 w-2 rotate-45 bg-[#1e1e23]"
            />
            {isRunning ? (
              <span className="flex items-center gap-1.5 py-0.5" aria-label="Kan is working">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="h-1.5 w-1.5 animate-bounce rounded-full bg-violet-400 motion-reduce:animate-none"
                    style={{ animationDelay: `${i * 140}ms` }}
                  />
                ))}
              </span>
            ) : (
              <p className="text-[13px] leading-relaxed text-neutral-300 wrap-anywhere">
                {shroom.firstPerson}
              </p>
            )}
          </div>

          <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-2 pt-3">
            <button
              onClick={onRun}
              disabled={isRunning}
              className="rounded-full bg-violet-600 px-3.5 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-violet-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400 disabled:opacity-50"
            >
              {isRunning ? 'Running…' : 'Run now'}
            </button>
            <button
              onClick={onEdit}
              className="text-[12px] font-medium text-neutral-400 transition-colors hover:text-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500"
            >
              Edit
            </button>
            <span className="ml-auto text-[11px] text-neutral-600">
              {STATE_LABEL[shroom.state]}
              {shroom.trigger ? ` · ${shroom.trigger}` : ''}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
