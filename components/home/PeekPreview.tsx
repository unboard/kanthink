'use client';

import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useStore } from '@/lib/store';
import type { Card, Channel, Task } from '@/lib/types';

export type PeekType = 'card' | 'channel' | 'task';

export interface PeekTarget {
  type: PeekType;
  id: string;
  rect: { top: number; bottom: number; left: number; width: number };
}

const PEEK_SHOW_DELAY_MS = 350;

/**
 * Hover trigger with a show delay. Attach `enter`/`leave` to any element
 * that should open a peek preview on mouse-over.
 */
export function usePeekTrigger(onPeek?: (target: PeekTarget | null) => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const enter = useCallback(
    (type: PeekType, id: string, e: React.MouseEvent<HTMLElement>) => {
      if (!onPeek) return;
      const r = e.currentTarget.getBoundingClientRect();
      const rect = { top: r.top, bottom: r.bottom, left: r.left, width: r.width };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => onPeek({ type, id, rect }), PEEK_SHOW_DELAY_MS);
    },
    [onPeek]
  );

  const leave = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    onPeek?.(null);
  }, [onPeek]);

  return { enter, leave };
}

/**
 * Content that overflows its viewport drifts slowly toward the far end and
 * back, at reading pace, with a hold at each end.
 */
function AutoScroll({
  axis,
  className,
  innerClassName,
  children,
}: {
  axis: 'x' | 'y';
  className?: string;
  innerClassName?: string;
  children: React.ReactNode;
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;
    const dist =
      axis === 'y' ? inner.scrollHeight - outer.clientHeight : inner.scrollWidth - outer.clientWidth;
    if (dist > 8) {
      inner.style.setProperty('--peek-x', axis === 'x' ? `-${dist}px` : '0px');
      inner.style.setProperty('--peek-y', axis === 'y' ? `-${dist}px` : '0px');
      inner.style.setProperty('--peek-duration', `${Math.max(8, Math.round(dist / 20))}s`);
      inner.classList.add('animate-peek-scroll');
    } else {
      inner.classList.remove('animate-peek-scroll');
    }
  }, [axis, children]);

  return (
    <div ref={outerRef} className={`overflow-hidden ${className ?? ''}`}>
      <div ref={innerRef} className={innerClassName}>
        {children}
      </div>
    </div>
  );
}

function PeekMarkdown({ content }: { content: string }) {
  return (
    <div className="prose prose-invert prose-sm max-w-none text-xs leading-relaxed prose-p:my-1 prose-ul:my-1 prose-li:my-0.5 prose-headings:my-1.5 prose-headings:text-sm">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}

function CardPeekBody({ card, channelName }: { card: Card; channelName?: string }) {
  return (
    <>
      <div className="border-b border-neutral-800 px-4 pb-2.5 pt-3">
        <p className="truncate text-sm font-medium text-white">{card.title}</p>
        {channelName && <p className="mt-0.5 text-[10px] text-neutral-500">{channelName}</p>}
      </div>
      <AutoScroll axis="y" className="flex-1 px-4 py-3">
        {card.messages.length === 0 ? (
          <p className="text-xs text-neutral-500">{card.summary || 'No thread yet'}</p>
        ) : (
          <div className="space-y-3">
            {card.messages.map((m) => (
              <div key={m.id}>
                <p className={`mb-0.5 text-[10px] font-semibold ${m.type === 'ai_response' ? 'text-violet-400' : 'text-neutral-500'}`}>
                  {m.type === 'ai_response' ? 'Kan' : m.authorName || 'Note'}
                </p>
                <PeekMarkdown content={m.content} />
              </div>
            ))}
          </div>
        )}
      </AutoScroll>
    </>
  );
}

function TaskPeekBody({ task, channelName }: { task: Task; channelName?: string }) {
  const statusColor =
    task.status === 'done' ? 'bg-green-400' :
    task.status === 'in_progress' ? 'bg-blue-400' :
    task.status === 'on_hold' ? 'bg-amber-400' : 'bg-neutral-500';

  return (
    <>
      <div className="border-b border-neutral-800 px-4 pb-2.5 pt-3">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 flex-shrink-0 rounded-full ${statusColor}`} />
          <p className="truncate text-sm font-medium text-white">{task.title}</p>
        </div>
        {channelName && <p className="mt-0.5 pl-4 text-[10px] text-neutral-500">{channelName}</p>}
      </div>
      <AutoScroll axis="y" className="flex-1 px-4 py-3">
        <div className="space-y-3">
          {task.description ? (
            <PeekMarkdown content={task.description} />
          ) : (
            !task.notes?.length && <p className="text-xs text-neutral-500">No details yet</p>
          )}
          {task.notes?.map((n) => (
            <div key={n.id}>
              <p className="mb-0.5 text-[10px] font-semibold text-neutral-500">{n.authorName || 'Note'}</p>
              <PeekMarkdown content={n.content} />
            </div>
          ))}
        </div>
      </AutoScroll>
    </>
  );
}

function ChannelPeekBody({ channel, cards }: { channel: Channel; cards: Record<string, Card> }) {
  const totalCards = channel.columns.reduce((n, c) => n + c.cardIds.length, 0);
  return (
    <>
      <div className="border-b border-neutral-800 px-4 pb-2.5 pt-3">
        <p className="truncate text-sm font-medium text-white">{channel.name}</p>
        <p className="mt-0.5 text-[10px] text-neutral-500">
          {channel.columns.length} columns · {totalCards} cards
        </p>
      </div>
      <AutoScroll axis="x" className="flex-1 px-4 py-3" innerClassName="flex w-max gap-3">
        {channel.columns.map((col) => {
          const colCards = col.cardIds.map((id) => cards[id]).filter(Boolean);
          return (
            <div key={col.id} className="w-40 flex-shrink-0">
              <p className="mb-1.5 truncate text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                {col.name} <span className="font-normal text-neutral-600">{colCards.length}</span>
              </p>
              <div className="space-y-1">
                {colCards.slice(0, 6).map((c) => (
                  <div key={c.id} className="rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1.5">
                    <p className="line-clamp-2 text-[11px] leading-snug text-neutral-300">{c.title}</p>
                  </div>
                ))}
                {colCards.length > 6 && (
                  <p className="px-1 text-[10px] text-neutral-600">+{colCards.length - 6} more</p>
                )}
                {colCards.length === 0 && <p className="px-1 text-[10px] text-neutral-600">Empty</p>}
              </div>
            </div>
          );
        })}
      </AutoScroll>
    </>
  );
}

/**
 * Floating read-only preview shown on hover over ticker items and search
 * results: card/task threads drift slowly upward at reading pace; channels
 * show a mini board drifting sideways.
 */
export function PeekPreview({ target }: { target: PeekTarget | null }) {
  const channels = useStore((s) => s.channels);
  const cards = useStore((s) => s.cards);
  const tasks = useStore((s) => s.tasks);

  if (!target) return null;

  const card = target.type === 'card' ? cards[target.id] : undefined;
  const task = target.type === 'task' ? tasks[target.id] : undefined;
  const channel = target.type === 'channel' ? channels[target.id] : undefined;
  if (!card && !task && !channel) return null;

  const width = Math.min(target.type === 'channel' ? 480 : 340, window.innerWidth - 16);
  const height = 250;
  let top = target.rect.top - height - 10;
  if (top < 8) top = target.rect.bottom + 10;
  const left = Math.max(
    8,
    Math.min(target.rect.left + target.rect.width / 2 - width / 2, window.innerWidth - width - 8)
  );

  return (
    <div
      className="animate-sprout pointer-events-none fixed z-[60] flex flex-col overflow-hidden rounded-xl border border-neutral-700 bg-neutral-900/95 shadow-2xl shadow-black/60 backdrop-blur"
      style={{ top, left, width, height }}
    >
      {card && <CardPeekBody card={card} channelName={channels[card.channelId]?.name} />}
      {task && <TaskPeekBody task={task} channelName={channels[task.channelId]?.name} />}
      {channel && <ChannelPeekBody channel={channel} cards={cards} />}
      {/* Bottom fade so drifting content reads as scrollable */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-neutral-900/95 to-transparent" />
    </div>
  );
}
