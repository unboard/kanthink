'use client';

import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import { describeShroom } from '@/lib/shrooms/describe';
import { useShroomRun } from './ShroomRunContext';

const ACTION_LABEL: Record<string, string> = {
  generate: 'Generate',
  modify: 'Modify',
  move: 'Move',
  report: 'Report',
};

interface ThreadShroomCardProps {
  /** The shroom that was run. */
  shroomId: string;
  /** The card whose thread this sits in — the run is scoped back to it. */
  cardId: string;
  /** When the run happened. */
  createdAt: string;
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
 * The shroom card, inside a card thread.
 *
 * Running a shroom on a card used to be silent — the cards changed and nothing said
 * why. This drops the shroom itself into the thread at the point it ran, so the run is
 * part of the card's history and the same shroom is one tap away from running again,
 * opening for a look, or being cleared out.
 *
 * Deliberately not the panel's `ShroomCard`: that one is a browsing tile with a spore
 * print and a specimen number. Here the shroom is a thing that happened, so it reads as
 * a receipt.
 */
export function ThreadShroomCard({ shroomId, cardId, createdAt, onDelete }: ThreadShroomCardProps) {
  const router = useRouter();
  const instructionCards = useStore((s) => s.instructionCards);
  const cards = useStore((s) => s.cards);
  const channels = useStore((s) => s.channels);
  const { runShroom, runningIds } = useShroomRun();

  const shroom = instructionCards[shroomId];
  const card = cards[cardId];
  const channel = card ? channels[card.channelId] : undefined;

  // The shroom was deleted after it ran. The run still happened, so say so rather than
  // dropping the entry.
  if (!shroom) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-200 px-4 py-3 dark:border-neutral-700">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            A shroom ran here on {formatWhen(createdAt)}. It has since been deleted.
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

  const facts = describeShroom(shroom, channel, instructionCards);
  const isRunning = runningIds.includes(shroom.id);

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/60 px-4 py-3 dark:border-violet-900/60 dark:bg-violet-950/20">
      <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[9.5px] uppercase tracking-[0.16em]">
        <span className="text-violet-600 dark:text-violet-400">Shroom run</span>
        <span className="text-neutral-400 dark:text-neutral-500">
          {ACTION_LABEL[shroom.action] ?? shroom.action}
        </span>
        <span className="text-neutral-400 dark:text-neutral-500">{formatWhen(createdAt)}</span>
      </div>

      <h4 className="text-sm font-semibold leading-snug text-neutral-900 dark:text-neutral-100 wrap-anywhere">
        {shroom.title}
      </h4>
      <p className="mt-1 line-clamp-4 text-[13px] leading-relaxed text-neutral-600 dark:text-neutral-400 wrap-anywhere">
        {facts.summary}
      </p>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-dashed border-violet-200 pt-2.5 dark:border-violet-900/60">
        <button
          onClick={() => runShroom(shroom, { cardIds: [cardId] })}
          disabled={isRunning}
          className="rounded border border-violet-300 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-violet-700 transition-colors hover:bg-violet-100 disabled:opacity-40 dark:border-violet-800 dark:text-violet-300 dark:hover:bg-violet-500/15"
        >
          {isRunning ? 'Running' : 'Run again'}
        </button>
        <button
          onClick={() =>
            // A global shroom carries no channel of its own, so open it from the board
            // it just ran on.
            router.push(
              `/channel/${shroom.channelId || card?.channelId}?shrooms=open&edit=${shroom.id}`
            )
          }
          className="rounded px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-white/5 dark:hover:text-neutral-200"
        >
          Open
        </button>
        {onDelete && (
          <button
            onClick={onDelete}
            className="ml-auto rounded px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-neutral-500 dark:hover:bg-red-500/10 dark:hover:text-red-400"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
