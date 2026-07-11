'use client';

import { useMemo } from 'react';
import { useStore } from '@/lib/store';
import { usePeekTrigger, type PeekTarget } from '@/components/home/PeekPreview';

export type SproutType = 'channel' | 'card' | 'task';

export interface SproutResult {
  id: string;
  type: SproutType;
  title: string;
  context?: string;
  href: string;
  score: number;
  updatedAt: string;
}

const CAP_COLOR: Record<SproutType, string> = {
  channel: 'bg-violet-400',
  card: 'bg-cyan-400',
  task: 'bg-emerald-400',
};

function scoreMatch(text: string | undefined, q: string): number {
  if (!text) return 0;
  const t = text.toLowerCase();
  if (t.startsWith(q)) return 3;
  if (t.includes(` ${q}`)) return 2;
  if (t.includes(q)) return 1;
  return 0;
}

/**
 * Live workspace search that sprouts matching channels, cards, and tasks
 * above the chat composer as the user types. Selection is handed to the
 * parent so results can open in place (drawer/preview) without navigating.
 */
export function SproutSearch({
  query,
  onSelect,
  onPeek,
}: {
  query: string;
  onSelect: (result: SproutResult) => void;
  onPeek?: (target: PeekTarget | null) => void;
}) {
  const peek = usePeekTrigger(onPeek);
  const channels = useStore((s) => s.channels);
  const cards = useStore((s) => s.cards);
  const tasks = useStore((s) => s.tasks);

  const q = query.trim().toLowerCase();

  const results = useMemo<SproutResult[]>(() => {
    if (q.length < 2) return [];
    const list: SproutResult[] = [];

    for (const ch of Object.values(channels)) {
      if (ch.isGlobalHelp) continue;
      const score = scoreMatch(ch.name, q) * 2 + (scoreMatch(ch.description, q) > 0 ? 0.5 : 0);
      if (score > 0) {
        list.push({
          id: ch.id,
          type: 'channel',
          title: ch.name,
          context: 'channel',
          href: `/channel/${ch.id}`,
          score,
          updatedAt: ch.updatedAt,
        });
      }
    }

    for (const c of Object.values(cards)) {
      const ch = channels[c.channelId];
      if (!ch || ch.isGlobalHelp) continue;
      const score = scoreMatch(c.title, q) + (scoreMatch(c.summary, q) > 0 ? 0.5 : 0);
      if (score > 0) {
        list.push({
          id: c.id,
          type: 'card',
          title: c.title,
          context: ch.name,
          href: `/channel/${c.channelId}/card/${c.id}`,
          score,
          updatedAt: c.updatedAt,
        });
      }
    }

    for (const t of Object.values(tasks)) {
      if (t.isArchived) continue;
      const ch = channels[t.channelId];
      if (!ch || ch.isGlobalHelp) continue;
      const score = scoreMatch(t.title, q);
      if (score > 0) {
        list.push({
          id: t.id,
          type: 'task',
          title: t.title,
          context: ch.name,
          href: t.cardId ? `/channel/${t.channelId}/card/${t.cardId}` : `/channel/${t.channelId}`,
          score,
          updatedAt: t.updatedAt,
        });
      }
    }

    return list
      .sort((a, b) => b.score - a.score || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 7);
  }, [q, channels, cards, tasks]);

  if (results.length === 0) return null;

  return (
    <div className="absolute bottom-full left-0 right-0 z-30 mb-3 flex flex-wrap justify-center gap-2 px-2">
      {results.map((r, i) => (
        <button
          key={r.id}
          onClick={() => {
            peek.leave();
            onSelect(r);
          }}
          onMouseEnter={(e) => peek.enter(r.type, r.id, e)}
          onMouseLeave={peek.leave}
          className="animate-sprout flex items-center gap-2 rounded-full border border-neutral-700 bg-neutral-900/95 py-1.5 pl-2.5 pr-3.5 shadow-lg shadow-black/50 backdrop-blur transition-colors hover:border-violet-500/60 hover:bg-neutral-800"
          style={{ animationDelay: `${i * 45}ms` }}
        >
          {/* Tiny mushroom: cap + stem, color-coded by type */}
          <span className="flex flex-col items-center" aria-hidden>
            <span className={`h-[5px] w-2.5 rounded-t-full ${CAP_COLOR[r.type]}`} />
            <span className="h-[3px] w-[3px] rounded-b-[2px] bg-neutral-400" />
          </span>
          <span className="max-w-[200px] truncate text-xs text-neutral-200">{r.title}</span>
          {r.context && <span className="max-w-[100px] truncate text-[10px] text-neutral-500">{r.context}</span>}
        </button>
      ))}
    </div>
  );
}
