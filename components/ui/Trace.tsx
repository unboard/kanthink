'use client';

import { createContext, useContext, useId, useState, type ComponentProps, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';

/**
 * A list of steps — what Kan read, ran, decided, is doing now, and will do next.
 *
 * A port of shadcn's Trace (ui.shadcn.com/docs/components/base/trace) with the same
 * parts and props, minus the dependencies: this repo has no shadcn, cn or Base UI,
 * so the collapsible is a few lines of state and the colors are the neutral pairs
 * the rest of the app uses. Compose it exactly the way the shadcn docs show.
 *
 *   status: none = done · 'running' = shimmering, present tense · 'error' · 'pending'
 */

const join = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export function Trace({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="trace" className={join('flex w-full min-w-0 flex-col gap-1.5', className)} {...props} />;
}

export type TraceStatus = 'running' | 'error' | 'pending';

export function TraceLine({ className, status, ...props }: ComponentProps<'span'> & { status?: TraceStatus }) {
  return (
    <span
      data-slot="trace-line"
      data-status={status}
      className={join(
        'trace-line flex w-fit max-w-full min-w-0 items-center gap-2 text-sm transition-colors',
        status === 'error'
          ? 'text-red-600 dark:text-red-400'
          : 'text-neutral-500 dark:text-neutral-400',
        status === 'pending' && 'opacity-60',
        className
      )}
      {...props}
    />
  );
}

export function TraceIcon({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
      data-slot="trace-icon"
      aria-hidden="true"
      className={join('trace-icon flex size-4 shrink-0 items-center justify-center [&_svg]:pointer-events-none [&_svg]:size-4', className)}
      {...props}
    />
  );
}

export function TraceTitle({ className, ...props }: ComponentProps<'span'>) {
  return <span data-slot="trace-title" className={join('trace-title min-w-0 truncate', className)} {...props} />;
}

export function TraceDescription({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
      data-slot="trace-description"
      className={join('shrink-0 tabular-nums text-neutral-400 dark:text-neutral-500', className)}
      {...props}
    />
  );
}

// --- Collapsible -------------------------------------------------------------

interface CollapsibleState { open: boolean; setOpen: (open: boolean) => void; contentId: string }
const CollapsibleContext = createContext<CollapsibleState | null>(null);

type TraceCollapsibleProps = Omit<ComponentProps<'div'>, 'onChange'> & {
  defaultOpen?: boolean;
} & (
  | { open?: undefined; onOpenChange?: (open: boolean) => void }
  | { open: boolean; onOpenChange: (open: boolean) => void }
);

export function TraceCollapsible({ className, open, defaultOpen = false, onOpenChange, ...props }: TraceCollapsibleProps) {
  const [uncontrolled, setUncontrolled] = useState(defaultOpen);
  const contentId = useId();
  const isOpen = open ?? uncontrolled;
  const setOpen = (next: boolean) => {
    if (open === undefined) setUncontrolled(next);
    onOpenChange?.(next);
  };
  return (
    <CollapsibleContext.Provider value={{ open: isOpen, setOpen, contentId }}>
      <div data-slot="trace-collapsible" data-open={isOpen || undefined} className={join('flex w-full min-w-0 flex-col', className)} {...props} />
    </CollapsibleContext.Provider>
  );
}

export function TraceCollapsibleTrigger({ className, children, ...props }: ComponentProps<'button'>) {
  const ctx = useContext(CollapsibleContext);
  return (
    <button
      type="button"
      data-slot="trace-collapsible-trigger"
      aria-expanded={ctx?.open ?? false}
      aria-controls={ctx?.contentId}
      onClick={() => ctx?.setOpen(!ctx.open)}
      className={join(
        'group/trace flex w-fit max-w-full min-w-0 cursor-pointer items-center gap-1 rounded-md text-left outline-none',
        'text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-100',
        'focus-visible:ring-2 focus-visible:ring-violet-400/50 [&_.trace-line]:hover:text-neutral-800 dark:[&_.trace-line]:hover:text-neutral-100',
        className
      )}
      {...props}
    >
      {children}
      <TraceIcon className="-ml-0.5 transition-transform group-aria-expanded/trace:rotate-90">
        <ChevronRight />
      </TraceIcon>
    </button>
  );
}

export function TraceCollapsibleContent({
  className,
  children,
  keepMounted = false,
  ...props
}: ComponentProps<'div'> & { keepMounted?: boolean; children?: ReactNode }) {
  const ctx = useContext(CollapsibleContext);
  const open = ctx?.open ?? false;
  return (
    <div
      id={ctx?.contentId}
      data-slot="trace-collapsible-content"
      className={join('grid min-w-0 transition-[grid-template-rows] duration-200', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}
      {...props}
    >
      <div className="min-h-0 overflow-hidden">
        {(open || keepMounted) && (
          <div
            className={join(
              'mt-1.5 mb-1 ml-[7px] min-w-0 border-l border-neutral-200 dark:border-neutral-700 pr-1 pl-4 text-sm leading-relaxed break-words text-neutral-500 dark:text-neutral-400',
              className
            )}
          >
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
