'use client';

import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';

/**
 * A cross-channel summary of what the shrooms have left for you.
 *
 * Pending review is otherwise a per-column badge you'd only find by opening each board —
 * which defeats the point when the reason you're on the home screen is that boards have
 * got noisy. This is the queue you can actually work from.
 */
export function KanDesk() {
  const router = useRouter();
  const channels = useStore((s) => s.channels);
  const cards = useStore((s) => s.cards);

  // Columns holding shroom output awaiting a decision
  const pending = Object.values(channels).flatMap((channel) =>
    channel.columns
      .filter((col) => (col.reviewCardIds?.length ?? 0) > 0)
      .map((col) => ({
        channelId: channel.id,
        channelName: channel.name,
        columnId: col.id,
        columnName: col.name,
        count: col.reviewCardIds!.length,
      }))
  );

  // Reports a shroom wrote recently, newest first
  const reports = Object.values(cards)
    .filter((c) => c.cardType === 'report')
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
    .slice(0, 3);

  const totalPending = pending.reduce((sum, p) => sum + p.count, 0);

  if (totalPending === 0 && reports.length === 0) return null;

  return (
    <div className="mb-3 rounded-xl border border-neutral-700/60 bg-neutral-900/60 px-4 py-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm leading-none">🍄</span>
        <h2 className="text-xs font-medium text-neutral-400">
          {totalPending > 0
            ? `${totalPending} card${totalPending === 1 ? '' : 's'} waiting on you`
            : 'Latest from your shrooms'}
        </h2>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {pending.map((p) => (
          <button
            key={p.columnId}
            onClick={() => router.push(`/channel/${p.channelId}?column=${p.columnId}`)}
            className="flex items-center gap-1.5 rounded-lg bg-violet-500/15 px-2.5 py-1.5 text-xs text-violet-200 hover:bg-violet-500/25 transition-colors"
          >
            <span className="font-medium">{p.count}</span>
            <span className="text-violet-300/80">
              in {p.channelName} · {p.columnName}
            </span>
          </button>
        ))}

        {reports.map((r) => (
          <button
            key={r.id}
            onClick={() => router.push(`/channel/${r.channelId}/card/${r.id}`)}
            className="flex items-center gap-1.5 rounded-lg bg-teal-500/15 px-2.5 py-1.5 text-xs text-teal-200 hover:bg-teal-500/25 transition-colors max-w-full"
          >
            <span className="text-[10px] uppercase tracking-wide text-teal-400/80">Report</span>
            <span className="truncate">{r.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
