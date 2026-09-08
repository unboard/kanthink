'use client';

import { useEffect, useRef, useState } from 'react';
import type { Channel, ID, InstructionCard } from '@/lib/types';
import { ShroomAvatar } from '@/components/shrooms/ShroomAvatar';
import { buildShroomTrail, describeTrail } from '@/lib/shrooms/trail';
import { describeShroom } from '@/lib/shrooms/describe';

interface ShroomRowProps {
  channel: Channel;
  shrooms: InstructionCard[];
  allShrooms: Record<string, InstructionCard>;
  runningIds: string[];
  onRun: (shroom: InstructionCard) => void;
  onEdit: (shroomId: ID) => void;
  /** Open the full shroom panel — view, create, edit. */
  onOpenAll: () => void;
  /** Which shroom the pointer is over, lifted so the board can light its columns. */
  onHover: (shroomId: ID | null) => void;
  hoveredId: ID | null;
}

/**
 * The shrooms of a channel, on one line above the board.
 *
 * A bar like this existed once and was removed for taking too much height. The
 * reason it grew was that it wrapped — more shrooms meant more rows, and a bar that
 * becomes a panel deserves deleting. This one scrolls sideways and is a fixed 44px
 * with two shrooms or twenty.
 *
 * "All" sits outside the scroll. The way to see everything must not itself be
 * something you have to scroll to find.
 */
export function ShroomRow({
  channel,
  shrooms,
  allShrooms,
  runningIds,
  onRun,
  onEdit,
  onOpenAll,
  onHover,
  hoveredId,
}: ShroomRowProps) {
  // On a phone there is no hover, so tapping opens a sheet carrying the same trail
  // as text — and Run lives inside it, which also stops a thumb firing an expensive
  // shroom by accident. Desktop can be looser precisely because hover already said.
  const [sheetId, setSheetId] = useState<ID | null>(null);
  const [coarse, setCoarse] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(hover: none)');
    const sync = () => setCoarse(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  // Leaving the row must clear the board highlight, or the columns stay lit.
  useEffect(() => () => onHover(null), [onHover]);

  if (shrooms.length === 0) return null;

  const sheetShroom = sheetId ? shrooms.find((s) => s.id === sheetId) ?? null : null;

  return (
    <div className="flex-shrink-0 px-3 pb-1.5">
      <div
        className="flex items-stretch gap-1.5 rounded-xl border border-neutral-200 bg-white/60 p-1.5 dark:border-white/[0.06] dark:bg-white/[0.015]"
        onMouseLeave={() => onHover(null)}
      >
        <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto scrollbar-none">
          {shrooms.map((shroom) => {
            const running = runningIds.includes(shroom.id);
            const hovered = hoveredId === shroom.id;
            return (
              <button
                key={shroom.id}
                onMouseEnter={() => !coarse && onHover(shroom.id)}
                onFocus={() => !coarse && onHover(shroom.id)}
                onClick={() => {
                  if (coarse) {
                    setSheetId((cur) => (cur === shroom.id ? null : shroom.id));
                    return;
                  }
                  if (!running) onRun(shroom);
                }}
                disabled={running}
                title={describeTrail(buildShroomTrail(shroom, channel))}
                className={`flex h-[34px] flex-shrink-0 items-center gap-1.5 rounded-lg border px-2 text-[12px] transition-colors ${
                  hovered || sheetId === shroom.id
                    ? 'border-violet-500/60 bg-violet-500/[0.14] text-neutral-900 dark:text-neutral-50'
                    : running
                      ? 'border-violet-500/50 bg-violet-500/[0.1] text-neutral-800 dark:text-neutral-100'
                      : 'border-neutral-200 bg-white text-neutral-700 hover:border-violet-300 dark:border-white/[0.07] dark:bg-white/[0.02] dark:text-neutral-300 dark:hover:border-violet-500/40'
                }`}
              >
                <span className={running ? 'animate-pulse' : ''}>
                  <ShroomAvatar id={shroom.id} avatar={shroom.avatar} size={16} />
                </span>
                <span className="whitespace-nowrap">{shroom.title}</span>
                {running && (
                  <span className="h-1.5 w-1.5 flex-shrink-0 animate-ping rounded-full bg-violet-500" />
                )}
              </button>
            );
          })}
        </div>

        {/* Pinned: never scrolls out, never wraps. */}
        <div className="flex-shrink-0 border-l border-neutral-200 pl-1.5 dark:border-white/[0.07]">
          <button
            onClick={onOpenAll}
            title="All shrooms"
            className="flex h-[34px] items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-2 text-[12px] text-neutral-600 transition-colors hover:border-violet-300 hover:text-neutral-900 dark:border-white/[0.09] dark:bg-white/[0.03] dark:text-neutral-300 dark:hover:border-violet-500/40 dark:hover:text-neutral-50"
          >
            <span className="text-[13px] leading-none">🍄</span>
            <span className="whitespace-nowrap">All</span>
          </button>
        </div>
      </div>

      {sheetShroom && (
        <ShroomSheet
          shroom={sheetShroom}
          channel={channel}
          allShrooms={allShrooms}
          running={runningIds.includes(sheetShroom.id)}
          onRun={() => {
            onRun(sheetShroom);
            setSheetId(null);
          }}
          onEdit={() => {
            onEdit(sheetShroom.id);
            setSheetId(null);
          }}
          onClose={() => setSheetId(null)}
        />
      )}
    </div>
  );
}

/**
 * What a phone gets instead of a hover: the trail spelled out, with Run inside it.
 */
function ShroomSheet({
  shroom,
  channel,
  allShrooms,
  running,
  onRun,
  onEdit,
  onClose,
}: {
  shroom: InstructionCard;
  channel: Channel;
  allShrooms: Record<string, InstructionCard>;
  running: boolean;
  onRun: () => void;
  onEdit: () => void;
  onClose: () => void;
}) {
  const trail = buildShroomTrail(shroom, channel);
  const facts = describeShroom(shroom, channel, allShrooms);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: Event) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('touchstart', onDown);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('mousedown', onDown);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="mt-1.5 rounded-xl border border-violet-500/40 bg-violet-50 p-2.5 dark:bg-violet-500/[0.07]"
    >
      <div className="mb-2 flex items-center gap-2">
        <ShroomAvatar id={shroom.id} avatar={shroom.avatar} size={22} />
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-neutral-900 dark:text-neutral-100">
          {shroom.title}
        </span>
        <button
          onClick={onClose}
          aria-label="Close"
          className="px-1 text-[18px] leading-none text-neutral-400"
        >
          ×
        </button>
      </div>

      <ol className="mb-2 space-y-1">
        {trail.stops.map((stop, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className="mt-[2px] flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-violet-500 font-mono text-[9px] font-bold text-white">
              {i + 1}
            </span>
            <span className="text-[11.5px] leading-snug text-neutral-700 dark:text-neutral-300">
              {stop.verb}
              {stop.columnName && (
                <span className="text-neutral-500"> · {stop.columnName}</span>
              )}
              {stop.offBoard === 'review' && (
                <span className="block text-amber-600 dark:text-amber-300/80">
                  waits for your approval
                </span>
              )}
              {stop.offBoard === 'report' && (
                <span className="block text-neutral-500">not on the board</span>
              )}
            </span>
          </li>
        ))}
      </ol>

      {trail.conditional && (
        <p className="mb-2 text-[10.5px] text-neutral-500">
          Decides per card, so it may not touch every one.
        </p>
      )}
      <p className="mb-2 text-[10.5px] text-neutral-500">
        {facts.trigger ? `Runs ${facts.trigger.toLowerCase()}` : 'Runs when you ask'}
        {facts.lastRun ? ` · last run ${facts.lastRun.toLowerCase()}` : ''}
      </p>

      <div className="flex gap-1.5">
        <button
          onClick={onRun}
          disabled={running}
          className="flex-1 rounded-lg bg-violet-600 py-2 text-[12px] font-medium text-white disabled:opacity-60"
        >
          {running ? 'Running…' : 'Run now'}
        </button>
        <button
          onClick={onEdit}
          className="rounded-lg border border-neutral-300 px-3 text-[12px] text-neutral-700 dark:border-white/[0.1] dark:text-neutral-300"
        >
          Edit
        </button>
      </div>
    </div>
  );
}
