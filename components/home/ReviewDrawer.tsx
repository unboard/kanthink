'use client';

import { useMemo, useState } from 'react';
import { useStore } from '@/lib/store';
import { Drawer } from '@/components/ui/Drawer';
import { REJECTION_REASONS } from '@/lib/constants';
import type { RejectionReason } from '@/lib/types';

/**
 * Everything shrooms have left for a decision, in one place.
 *
 * Pending cards used to be decided column by column on each board. Here they're
 * all together: approve or reject the lot at the top, then each card under its
 * channel, with its column, quick ✓ / ✕ on the row, and the full card a click away
 * in the normal card drawer. The same drawer serves the Studio's sparks, where
 * approving puts up a test page.
 */

export interface ReviewScope {
  /** Which columns this drawer covers. */
  include: (channelId: string, columnId: string) => boolean;
  title: string;
  subtitle: string;
  approveLabel: string;
  empty: string;
}

interface PendingItem {
  cardId: string;
  title: string;
  preview: string;
  columnId: string;
  columnName: string;
}

interface Group {
  channelId: string;
  channelName: string;
  items: PendingItem[];
  columns: string[];
}

function previewOf(card: { summary?: string; messages?: { content?: string }[] }) {
  if (card.summary) return card.summary;
  const first = (card.messages ?? []).find((m) => m.content?.trim())?.content ?? '';
  return first.split('\n').map((l) => l.replace(/^[#*\->\s]+/, '').trim()).find((l) => l.length > 20 && !/^size\s*:/i.test(l)) ?? '';
}

/** Pending cards in scope, grouped by channel. Shared with the orbs for their counts. */
export function usePendingGroups(scope: Pick<ReviewScope, 'include'>): Group[] {
  const channels = useStore((s) => s.channels);
  const cards = useStore((s) => s.cards);
  return useMemo(() => {
    const groups: Group[] = [];
    for (const channel of Object.values(channels)) {
      const items: PendingItem[] = [];
      const cols: string[] = [];
      for (const col of channel.columns) {
        if (!(col.reviewCardIds?.length) || !scope.include(channel.id, col.id)) continue;
        cols.push(col.id);
        for (const id of col.reviewCardIds) {
          const card = cards[id];
          if (card) items.push({ cardId: id, title: card.title, preview: previewOf(card), columnId: col.id, columnName: col.name });
        }
      }
      if (items.length) groups.push({ channelId: channel.id, channelName: channel.name, items, columns: cols });
    }
    return groups.sort((a, b) => b.items.length - a.items.length);
  }, [channels, cards, scope]);
}

function RejectReasons({ onPick, onCancel }: { onPick: (reason?: RejectionReason) => void; onCancel: () => void }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] text-neutral-500">Why? It teaches the shroom.</span>
      {REJECTION_REASONS.map((r) => (
        <button key={r.key} onClick={() => onPick(r.key)} className="rounded-full border border-neutral-700 px-2 py-0.5 text-[11px] text-neutral-300 hover:border-violet-500 hover:text-violet-200">
          {r.label}
        </button>
      ))}
      <button onClick={() => onPick(undefined)} className="text-[11px] text-neutral-500 hover:text-neutral-300">Skip</button>
      <button onClick={onCancel} className="text-[11px] text-neutral-500 hover:text-neutral-300">Cancel</button>
    </div>
  );
}

export function ReviewDrawer({ isOpen, onClose, scope, onOpenCard, footer }: { isOpen: boolean; onClose: () => void; scope: ReviewScope; onOpenCard: (cardId: string) => void; footer?: React.ReactNode }) {
  const groups = usePendingGroups(scope);
  const approveReviewCard = useStore((s) => s.approveReviewCard);
  const rejectReviewCard = useStore((s) => s.rejectReviewCard);
  const approveAllReviewCards = useStore((s) => s.approveAllReviewCards);
  const rejectAllReviewCards = useStore((s) => s.rejectAllReviewCards);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [rejectingAll, setRejectingAll] = useState(false);
  const total = groups.reduce((n, g) => n + g.items.length, 0);

  const approveAll = () => {
    for (const g of groups) for (const col of g.columns) approveAllReviewCards(g.channelId, col);
  };
  const rejectAll = (reason?: RejectionReason) => {
    for (const g of groups) for (const col of g.columns) rejectAllReviewCards(g.channelId, col, reason);
    setRejectingAll(false);
  };

  return (
    <Drawer isOpen={isOpen} onClose={onClose} width="md" floating hideCloseButton>
      <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
        <div className="flex items-start justify-between gap-3 border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
          <div>
            <h2 className="text-[15px] font-semibold text-neutral-900 dark:text-white">{scope.title}</h2>
            <p className="text-xs text-neutral-500">{total ? `${total} waiting · ${scope.subtitle}` : scope.subtitle}</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200" aria-label="Close">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {total > 0 && (
          <div className="border-b border-neutral-200 px-5 py-3 dark:border-neutral-800">
            {rejectingAll ? (
              <RejectReasons onPick={rejectAll} onCancel={() => setRejectingAll(false)} />
            ) : (
              <div className="flex gap-2">
                <button onClick={approveAll} className="flex-1 rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-700">
                  {scope.approveLabel === 'Approve' ? `Approve all ${total}` : `${scope.approveLabel} — all ${total}`}
                </button>
                <button onClick={() => setRejectingAll(true)} className="flex-1 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700">
                  Reject all
                </button>
              </div>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-3 py-3">
          {total === 0 && <p className="py-12 text-center text-sm text-neutral-500">{scope.empty}</p>}
          {groups.map((g) => (
            <div key={g.channelId} className="mb-4">
              <div className="px-2 pb-1.5 pt-1 text-[11px] font-medium uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
                {g.channelName} <span className="normal-case tracking-normal text-neutral-600">· {g.items.length}</span>
              </div>
              <div className="space-y-1">
                {g.items.map((item) => (
                  <div key={item.cardId} className="group rounded-xl px-2.5 py-2 transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800/70">
                    <div className="flex items-start gap-3">
                      <button onClick={() => onOpenCard(item.cardId)} className="min-w-0 flex-1 text-left">
                        <span className="block truncate text-sm text-neutral-900 dark:text-white">{item.title}</span>
                        <span className="mt-0.5 block truncate text-[11px] text-neutral-500">
                          <span className="text-violet-400/80">{item.columnName}</span>
                          {item.preview ? ` · ${item.preview}` : ''}
                        </span>
                      </button>
                      <div className="flex flex-shrink-0 items-center gap-1 pt-0.5">
                        <button
                          onClick={() => approveReviewCard(item.cardId)}
                          title={scope.approveLabel}
                          aria-label={`${scope.approveLabel}: ${item.title}`}
                          className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-600/15 text-violet-300 transition-colors hover:bg-violet-600 hover:text-white"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                        </button>
                        <button
                          onClick={() => setRejecting(rejecting === item.cardId ? null : item.cardId)}
                          title="Reject"
                          aria-label={`Reject: ${item.title}`}
                          className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-200/60 text-neutral-500 transition-colors hover:bg-neutral-300 hover:text-neutral-800 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700 dark:hover:text-neutral-100"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    </div>
                    {rejecting === item.cardId && (
                      <RejectReasons
                        onPick={(reason) => { rejectReviewCard(item.cardId, reason); setRejecting(null); }}
                        onCancel={() => setRejecting(null)}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        {footer && <div className="border-t border-neutral-200 px-5 py-3 dark:border-neutral-800">{footer}</div>}
      </div>
    </Drawer>
  );
}
