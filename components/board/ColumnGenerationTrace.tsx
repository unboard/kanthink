'use client';

import { useStore } from '@/lib/store';
import { KanTrace, type KanStep } from '@/components/kan/KanTrace';

/**
 * Sits above a column's skeleton cards while a shroom generates into it: which
 * shroom is running, for how long, and how many cards are on the way.
 */
export function ColumnGenerationTrace({ count }: { count: number }) {
  const op = useStore((s) => s.aiOperation);
  if (count <= 0) return null;
  const title = op.isActive ? op.context?.instructionTitle : undefined;
  const startedAt = op.isActive && op.startedAt ? Date.parse(op.startedAt) : undefined;
  const steps: KanStep[] = [
    { label: title ? `Running ${title}` : 'Running the shroom', status: 'running', startedAt },
    { label: `Adding ${count} card${count === 1 ? '' : 's'} here`, status: 'pending' },
  ];
  return <KanTrace steps={steps} startedAt={startedAt} className="px-1 pt-1 pb-0.5 [&_.trace-line]:text-xs" />;
}
