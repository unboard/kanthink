'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import { ShroomCard } from '@/components/shrooms/ShroomCard';
import { useShroomRun, explainCardConflict } from './ShroomRunContext';

interface ThreadShroomCardProps {
  /** The shroom sitting in this thread. */
  shroomId: string;
  /** The card whose thread this is — the run is scoped back to it. */
  cardId: string;
  /** When the run happened, or when the shroom was dropped in. */
  createdAt: string;
  /** False when the shroom was summoned with /shrooms and hasn't been run yet. */
  hasRun?: boolean;
  /** Remove this entry from the thread. */
  onDelete?: () => void;
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at ${d.toLocaleTimeString(
    'en-US',
    { hour: 'numeric', minute: '2-digit' }
  )}`;
}

/**
 * A shroom inside a card thread.
 *
 * This is the same `ShroomCard` the panel and the mobile sheet render — deliberately,
 * because a shroom that looked different here would read as a different kind of object.
 * All this adds is the thread's own framing: what the entry is (summoned, or a record of
 * a run), a remove action, and an answer when Run doesn't apply to this card.
 */
export function ThreadShroomCard({
  shroomId,
  cardId,
  createdAt,
  hasRun = true,
  onDelete,
}: ThreadShroomCardProps) {
  const router = useRouter();
  const instructionCards = useStore((s) => s.instructionCards);
  const cards = useStore((s) => s.cards);
  const channels = useStore((s) => s.channels);
  const { runShroom, runningIds } = useShroomRun();
  const [conflict, setConflict] = useState<string | null>(null);

  const shroom = instructionCards[shroomId];
  const card = cards[cardId];
  const channel = card ? channels[card.channelId] : undefined;

  // The shroom was deleted after it landed here. The entry still happened, so say so
  // rather than dropping it.
  if (!shroom) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-200 px-4 py-3 dark:border-neutral-700">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            A shroom was here on {formatWhen(createdAt)}. It has since been deleted.
          </p>
          {onDelete && (
            <button
              onClick={onDelete}
              className="flex-shrink-0 text-xs text-neutral-400 hover:text-red-500"
            >
              Remove
            </button>
          )}
        </div>
      </div>
    );
  }

  // Pressing Run on a shroom that can't act on a single card explains itself rather than
  // running and quietly doing nothing.
  const handleRun = () => {
    const problem = explainCardConflict(shroom);
    if (problem) {
      setConflict(problem);
      return;
    }
    setConflict(null);
    runShroom(shroom, { cardIds: [cardId] });
  };

  // The specimen number is the shroom's place in its channel, so the same shroom carries
  // the same number here as it does in the panel.
  const index = Math.max(0, (channel?.instructionCardIds ?? []).indexOf(shroom.id));

  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[9.5px] uppercase tracking-[0.16em] text-neutral-400 dark:text-neutral-500">
        <span className="text-violet-600 dark:text-violet-400">
          {hasRun ? 'Shroom run' : 'Shroom'}
        </span>
        <span>{formatWhen(createdAt)}</span>
      </div>

      <ShroomCard
        shroom={shroom}
        channel={channel}
        allShrooms={instructionCards}
        index={index}
        isRunning={runningIds.includes(shroom.id)}
        onRun={handleRun}
        runLabel="Run on card"
        onEdit={() =>
          // A global shroom carries no channel of its own, so open it from the board
          // this card lives on.
          router.push(`/channel/${shroom.channelId || card?.channelId}?shrooms=open&edit=${shroom.id}`)
        }
        onRemove={onDelete}
      />

      {conflict && (
        <p className="mt-2 rounded-lg bg-neutral-100 px-3 py-2 text-[13px] leading-relaxed text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 wrap-anywhere">
          {conflict}
        </p>
      )}
    </div>
  );
}
