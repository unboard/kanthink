'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import { Drawer } from '@/components/ui';
import { getTagStyles } from '@/components/board/TagPicker';

interface ChannelPreviewDrawerProps {
  channelId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenCard: (cardId: string) => void;
}

const PREVIEW_CARDS_PER_COLUMN = 5;

/**
 * Read-only peek at a channel from the home screen: columns, cards, and
 * counts, with a jump-in button. Cards open in the card drawer on top.
 */
export function ChannelPreviewDrawer({ channelId, isOpen, onClose, onOpenCard }: ChannelPreviewDrawerProps) {
  const router = useRouter();
  const channel = useStore((s) => (channelId ? s.channels[channelId] : undefined));
  const cards = useStore((s) => s.cards);

  const columns = useMemo(() => {
    if (!channel) return [];
    return channel.columns.map((col) => {
      const colCards = col.cardIds.map((id) => cards[id]).filter(Boolean);
      return {
        id: col.id,
        name: col.name,
        cardCount: colCards.length,
        taskCount: col.taskIds?.length ?? 0,
        cards: colCards.slice(0, PREVIEW_CARDS_PER_COLUMN),
      };
    });
  }, [channel, cards]);

  if (!channel) return null;

  const totalCards = columns.reduce((n, c) => n + c.cardCount, 0);
  const totalTasks = columns.reduce((n, c) => n + c.taskCount, 0);

  return (
    <Drawer isOpen={isOpen} onClose={onClose} width="lg">
      <div className="flex min-h-full flex-col bg-neutral-950">
        {/* Cover */}
        {channel.coverImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={channel.coverImageUrl} alt="" className="h-36 w-full flex-shrink-0 object-cover" />
        )}

        {/* Header */}
        <div className="border-b border-neutral-800 px-6 pb-4 pt-6">
          <div className="mb-1 flex items-center gap-2 pr-10">
            <span className="flex flex-col items-center" aria-hidden>
              <span className="h-[6px] w-3 rounded-t-full bg-violet-400" />
              <span className="h-[3px] w-1 rounded-b-sm bg-neutral-400" />
            </span>
            <h2 className="truncate text-lg font-semibold text-white">{channel.name}</h2>
          </div>
          {channel.description && (
            <p className="text-sm text-neutral-400">{channel.description}</p>
          )}
          <p className="mt-2 text-xs text-neutral-500">
            {columns.length} {columns.length === 1 ? 'column' : 'columns'} · {totalCards} {totalCards === 1 ? 'card' : 'cards'}
            {totalTasks > 0 && <> · {totalTasks} {totalTasks === 1 ? 'task' : 'tasks'}</>}
          </p>
        </div>

        {/* Columns */}
        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {columns.map((col) => (
            <div key={col.id}>
              <div className="mb-2 flex items-baseline gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">{col.name}</h3>
                <span className="text-xs text-neutral-600">{col.cardCount}</span>
              </div>
              {col.cards.length === 0 ? (
                <p className="text-xs text-neutral-600">No cards</p>
              ) : (
                <div className="space-y-1.5">
                  {col.cards.map((card) => (
                    <button
                      key={card.id}
                      onClick={() => onOpenCard(card.id)}
                      className="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-left transition-colors hover:border-violet-500/50"
                    >
                      <p className="truncate text-sm text-neutral-200">{card.title}</p>
                      {card.summary && (
                        <p className="mt-0.5 line-clamp-1 text-xs text-neutral-500">{card.summary}</p>
                      )}
                      {card.tags && card.tags.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {card.tags.slice(0, 4).map((tag) => {
                            const def = channel.tagDefinitions?.find((d) => d.name === tag);
                            const styles = getTagStyles(def?.color ?? 'gray');
                            return (
                              <span key={tag} className={`rounded px-1.5 py-0.5 text-[10px] ${styles.className ?? ''}`} style={styles.style}>
                                {tag}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </button>
                  ))}
                  {col.cardCount > col.cards.length && (
                    <p className="px-1 text-xs text-neutral-600">+{col.cardCount - col.cards.length} more</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 border-t border-neutral-800 bg-neutral-950 px-6 py-4">
          <button
            onClick={() => router.push(`/channel/${channel.id}`)}
            className="w-full rounded-xl bg-violet-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-violet-500"
          >
            Open channel
          </button>
        </div>
      </div>
    </Drawer>
  );
}
