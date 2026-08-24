'use client';

import type { InstructionAction } from '@/lib/types';

/**
 * The numbered sequence a multi-step shroom runs.
 *
 * A shroom can do more than one thing — modify a card and then move it is the
 * common pair — and the engine reads that off `steps`. The chat preview drew
 * this list when proposing one, but the detail drawer only ever showed the
 * single `action` field, so afterwards a modify-and-move shroom looked like it
 * only moved. One component now, so the two can't tell different stories.
 *
 * Columns are named here but bound by id everywhere it matters, so these labels
 * follow a rename rather than going stale.
 */

export interface ShroomStepView {
  action: InstructionAction;
  /** Resolved at render time from the column id, so it's always current. */
  columnName: string;
  description: string;
}

export const SHROOM_ACTION_INFO: Record<
  InstructionAction,
  { label: string; icon: React.ReactNode; color: string }
> = {
  generate: {
    label: 'Generate',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
      </svg>
    ),
    color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  },
  modify: {
    label: 'Modify',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
      </svg>
    ),
    color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  },
  move: {
    label: 'Move',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
      </svg>
    ),
    color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  },
  report: {
    label: 'Report',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
  },
  build: {
    label: 'Build',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
      </svg>
    ),
    color: 'violet',
  },
};

/** Compact one-line-per-step list. `stacked` gives each step its own row for narrow drawers. */
export function ShroomStepList({
  steps,
  stacked = false,
}: {
  steps: ShroomStepView[];
  stacked?: boolean;
}) {
  return (
    <ol className="space-y-1.5">
      {steps.map((step, i) => {
        const info = SHROOM_ACTION_INFO[step.action];
        return (
          <li key={i} className={stacked ? 'flex items-start gap-2' : 'flex items-center gap-2'}>
            <span className="w-5 h-5 flex-shrink-0 rounded-full bg-neutral-200 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-400 text-[10px] font-bold flex items-center justify-center">
              {i + 1}
            </span>

            <div className={stacked ? 'min-w-0 flex-1' : 'flex min-w-0 flex-1 items-center gap-2'}>
              <span className="flex items-center gap-2">
                <span
                  className={`inline-flex flex-shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium ${info.color}`}
                >
                  <span className="[&>svg]:h-3 [&>svg]:w-3">{info.icon}</span>
                  {info.label}
                </span>
                <svg className="w-3 h-3 flex-shrink-0 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <span className="flex-shrink-0 text-xs text-neutral-600 dark:text-neutral-400">
                  {step.columnName}
                </span>
              </span>

              {step.description && (
                <span
                  className={`text-xs text-neutral-500 dark:text-neutral-500 ${
                    stacked ? 'mt-0.5 block' : 'truncate'
                  }`}
                >
                  {stacked ? step.description : `— ${step.description}`}
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
