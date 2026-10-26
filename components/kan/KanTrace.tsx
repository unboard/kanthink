'use client';

import { useEffect, useState } from 'react';
import { Check, Circle, Loader2, X } from 'lucide-react';
import { Trace, TraceDescription, TraceIcon, TraceLine, TraceTitle } from '@/components/ui/Trace';

/**
 * What Kan is doing, as a trace: finished steps, the one running now with how long
 * it has been at it, and anything still queued.
 *
 * Every step shown is a real one. Most AI calls here are a single request with no
 * progress events, so those show one honest running line ("Writing a reply · 6s")
 * rather than invented stages; where the server does report phases — app builds —
 * each one becomes its own line as it happens.
 */

export interface KanStep {
  label: string;
  /** Omitted = done. */
  status?: 'running' | 'error' | 'pending';
  /** Short secondary text, e.g. a count. A running step gets its elapsed time here. */
  detail?: string;
  /** When a running step started, for its timer. Falls back to the trace's startedAt. */
  startedAt?: number;
}

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

export function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
}

export function KanTrace({
  steps,
  startedAt,
  className,
}: {
  steps: KanStep[];
  startedAt?: number;
  className?: string;
}) {
  const running = steps.some((s) => s.status === 'running');
  const now = useNow(running);
  // Only show a timer once it says something; "0s" reads like a glitch.
  const elapsed = (from?: number) => {
    const ms = from ? now - from : 0;
    return ms >= 2000 ? formatElapsed(ms) : undefined;
  };
  return (
    <Trace role="status" aria-live="polite" className={className}>
      {steps.map((step, i) => {
        const detail = step.status === 'running' ? (step.detail ?? elapsed(step.startedAt ?? startedAt)) : step.detail;
        return (
          <TraceLine key={`${i}-${step.label}`} status={step.status}>
            <TraceIcon>
              {step.status === 'running' ? (
                <Loader2 className="animate-spin text-violet-500 dark:text-violet-400 motion-reduce:animate-none" />
              ) : step.status === 'error' ? (
                <X />
              ) : step.status === 'pending' ? (
                <Circle className="!size-2.5" />
              ) : (
                <Check className="text-neutral-400 dark:text-neutral-500" />
              )}
            </TraceIcon>
            <TraceTitle>{step.label}</TraceTitle>
            {detail && <TraceDescription>{detail}</TraceDescription>}
          </TraceLine>
        );
      })}
    </Trace>
  );
}

/** One running line with a timer — for calls that report nothing until they finish. */
export function KanWorking({ label = 'Thinking', startedAt, className }: { label?: string; startedAt?: number; className?: string }) {
  const [start] = useState(() => startedAt ?? Date.now());
  return <KanTrace steps={[{ label, status: 'running', startedAt: startedAt ?? start }]} className={className} />;
}
