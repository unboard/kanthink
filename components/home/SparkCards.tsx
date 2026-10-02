'use client';

import { useStore } from '@/lib/store';
import { useStudioInfo } from '@/lib/hooks/useStudioInfo';
import { sparkSize } from '@/lib/studio/spark';

/**
 * Sparks waiting for your yes, as cards on Home.
 *
 * Each is an ordinary card in the Studio's Sparks column, waiting for review. Click
 * one and it opens in the card drawer: read the scout's write-up, talk it through in
 * the thread, then approve (its test page goes up) or reject with a reason (the
 * scout learns from it). Nothing shows when nothing is waiting.
 */
const SIZE_CLS = {
  Small: 'bg-sky-500/15 text-sky-300',
  Mid: 'bg-violet-500/15 text-violet-300',
  Big: 'bg-emerald-500/15 text-emerald-300',
} as const;

export function SparkCards({ onOpen }: { onOpen: (cardId: string) => void }) {
  const info = useStudioInfo();
  const channel = useStore((s) => (info ? s.channels[info.channelId] : undefined));
  const cards = useStore((s) => s.cards);
  if (!info || !channel) return null;
  const column = channel.columns.find((c) => c.id === info.sparksColumnId);
  const waiting = (column?.reviewCardIds ?? []).map((id) => cards[id]).filter(Boolean);
  if (waiting.length === 0) return null;

  return (
    <div className="mb-3">
      <div className="mb-2 flex items-center gap-2 px-1">
        <span className="text-sm leading-none">🍄</span>
        <h2 className="text-xs font-medium text-neutral-400">
          {waiting.length === 1 ? 'A spark from your Studio' : `${waiting.length} sparks from your Studio`}
        </h2>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {waiting.slice(0, 4).map((card) => {
          const first = (card.messages ?? []).find((m) => m.content?.trim())?.content ?? '';
          const size = sparkSize(first);
          const preview = card.summary || first.split('\n').map((l) => l.replace(/^[#*\->\s]+/, '').trim()).find((l) => l.length > 20 && !/^size\s*:/i.test(l)) || '';
          return (
            <button
              key={card.id}
              onClick={() => onOpen(card.id)}
              className="rounded-md bg-neutral-900 p-3 text-left shadow-sm transition-shadow hover:shadow-md hover:ring-1 hover:ring-violet-500/40"
            >
              <div className="mb-1.5 flex flex-wrap gap-1">
                <span className="inline-flex items-center rounded bg-amber-500/15 px-1.5 py-0.5 text-xs font-medium text-amber-300">Spark</span>
                {size && <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${SIZE_CLS[size]}`}>{size}</span>}
              </div>
              <h4 className="text-sm font-medium text-white">{card.title}</h4>
              {preview && <p className="mt-1 line-clamp-2 text-xs text-neutral-500">{preview}</p>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
