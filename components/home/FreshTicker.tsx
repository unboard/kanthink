'use client';

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import { usePeekTrigger, type PeekTarget } from '@/components/home/PeekPreview';

type FreshItemType = 'channel' | 'card' | 'task';

interface FreshItem {
  id: string;
  type: FreshItemType;
  title: string;
  context?: string;
  createdAt: string;
  href: string;
}

const TYPE_DOT: Record<FreshItemType, string> = {
  channel: 'bg-violet-400',
  card: 'bg-cyan-400',
  task: 'bg-emerald-400',
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * The loop covers one copy of the strip in `duration`, so its speed is
 * copyWidth/duration px per second. To tick in from the right edge at that same
 * speed, the intro must cover one viewport width in viewport/speed seconds.
 * Returns null until measured so the marquee never runs at the wrong speed.
 */
function useTickerIntro(
  viewportRef: React.RefObject<HTMLDivElement | null>,
  stripRef: React.RefObject<HTMLDivElement | null>,
  scrolls: boolean,
  duration: number,
) {
  const [intro, setIntro] = useState<{ start: number; seconds: number } | null>(null);

  useLayoutEffect(() => {
    if (!scrolls) {
      setIntro(null);
      return;
    }

    const measure = () => {
      const viewport = viewportRef.current?.clientWidth ?? 0;
      const copy = (stripRef.current?.scrollWidth ?? 0) / 2;
      if (!viewport || !copy) return;
      setIntro({ start: viewport, seconds: (duration * viewport) / copy });
    };

    measure();
    const observer = new ResizeObserver(measure);
    if (viewportRef.current) observer.observe(viewportRef.current);
    return () => observer.disconnect();
  }, [viewportRef, stripRef, scrolls, duration]);

  return intro;
}

/** Breaking-news style marquee of the most recently added items in the workspace */
export function FreshTicker({ onPeek }: { onPeek?: (target: PeekTarget | null) => void }) {
  const router = useRouter();
  const peek = usePeekTrigger(onPeek);
  const viewportRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const channels = useStore((s) => s.channels);
  const cards = useStore((s) => s.cards);
  const tasks = useStore((s) => s.tasks);

  const items = useMemo<FreshItem[]>(() => {
    const list: FreshItem[] = [];

    for (const ch of Object.values(channels)) {
      if (ch.isGlobalHelp) continue;
      list.push({
        id: ch.id,
        type: 'channel',
        title: ch.name,
        createdAt: ch.createdAt,
        href: `/channel/${ch.id}`,
      });
    }

    for (const c of Object.values(cards)) {
      const ch = channels[c.channelId];
      if (!ch || ch.isGlobalHelp) continue;
      list.push({
        id: c.id,
        type: 'card',
        title: c.title,
        context: ch.name,
        createdAt: c.createdAt,
        href: `/channel/${c.channelId}/card/${c.id}`,
      });
    }

    for (const t of Object.values(tasks)) {
      if (t.isArchived) continue;
      const ch = channels[t.channelId];
      if (!ch || ch.isGlobalHelp) continue;
      list.push({
        id: t.id,
        type: 'task',
        title: t.title,
        context: ch.name,
        createdAt: t.createdAt,
        href: t.cardId ? `/channel/${t.channelId}/card/${t.cardId}` : `/channel/${t.channelId}`,
      });
    }

    return list
      .filter((i) => i.title && i.createdAt)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 14);
  }, [channels, cards, tasks]);

  // Only loop the marquee when there's enough content for a seamless scroll
  const scrolls = items.length >= 5;
  const rendered = scrolls ? [...items, ...items] : items;
  const duration = items.length * 5;
  const intro = useTickerIntro(viewportRef, stripRef, scrolls, duration);

  if (items.length === 0) return null;

  return (
    <div className="mb-3 flex items-center gap-2">
      <div className="flex flex-shrink-0 items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-1">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-violet-400" />
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-widest text-violet-300">Fresh</span>
      </div>
      <div
        ref={viewportRef}
        className="ticker-viewport relative flex-1 overflow-hidden"
        style={{
          maskImage: 'linear-gradient(to right, transparent, black 20px, black calc(100% - 20px), transparent)',
          WebkitMaskImage: 'linear-gradient(to right, transparent, black 20px, black calc(100% - 20px), transparent)',
        }}
      >
        <div
          ref={stripRef}
          className={`flex w-max ${scrolls && intro ? 'animate-ticker' : ''}`}
          style={
            scrolls && intro
              ? ({
                  '--ticker-duration': `${duration}s`,
                  '--ticker-start': `${intro.start}px`,
                  '--ticker-intro': `${intro.seconds}s`,
                } as React.CSSProperties)
              : undefined
          }
        >
          {rendered.map((item, i) => (
            <button
              key={`${item.id}-${i}`}
              onClick={() => {
                peek.leave();
                router.push(item.href);
              }}
              onMouseEnter={(e) => peek.enter(item.type, item.id, e)}
              onMouseLeave={peek.leave}
              className="flex flex-shrink-0 items-center gap-1.5 px-3 py-1 text-xs transition-colors"
            >
              <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${TYPE_DOT[item.type]}`} />
              <span className="max-w-[220px] truncate text-neutral-300 hover:text-white">{item.title}</span>
              {item.context && <span className="max-w-[120px] truncate text-neutral-600">{item.context}</span>}
              <span className="flex-shrink-0 text-neutral-600">{timeAgo(item.createdAt)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
