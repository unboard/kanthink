'use client';

import { useEffect, useRef, useState } from 'react';
import type { Channel, ID, InstructionCard } from '@/lib/types';
import { ShroomAvatar } from '@/components/shrooms/ShroomAvatar';
import { buildShroomTrail, describeTrail } from '@/lib/shrooms/trail';
import { describeShroom } from '@/lib/shrooms/describe';
import { ShroomTile } from '@/components/shrooms/ShroomTile';

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
 * The shrooms of a channel, above the board, as cards in their own colours.
 *
 * A bar like this existed once and was removed for taking too much height — but the
 * reason it grew was that it *wrapped*, so more shrooms meant more rows. This one
 * scrolls sideways: one row of tiles, the same height with two shrooms or twenty.
 *
 * The tiles carry only a face and a name. Everything else about a shroom is answered
 * by hovering one — the columns it touches light up on the board below — or by the
 * sheet on a phone, which is what tapping opens instead of running.
 *
 * The last slot is a plus, which opens all of them.
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
        <div className="flex min-w-0 flex-1 items-stretch gap-1.5 overflow-x-auto scrollbar-none">
          {shrooms.map((shroom) => (
            <ShroomTile
              key={shroom.id}
              shroom={shroom}
              isRunning={runningIds.includes(shroom.id)}
              isActive={hoveredId === shroom.id || sheetId === shroom.id}
              title={describeTrail(buildShroomTrail(shroom, channel))}
              onHoverStart={() => !coarse && onHover(shroom.id)}
              onHoverEnd={() => !coarse && onHover(null)}
              onClick={() => {
                if (coarse) {
                  setSheetId((cur) => (cur === shroom.id ? null : shroom.id));
                  return;
                }
                if (!runningIds.includes(shroom.id)) onRun(shroom);
              }}
            />
          ))}

          {/* Last in the scroll rather than pinned beside it. Pinning made it a piece
              of furniture the row had to work around; at the end it reads as the next
              slot — which is what it is. */}
          <button
            onClick={onOpenAll}
            title="All shrooms"
            aria-label="All shrooms"
            className="flex aspect-[9/16] w-[76px] flex-shrink-0 items-center justify-center rounded-2xl border-2 border-dashed border-neutral-300 text-neutral-400 transition-colors hover:border-violet-400 hover:text-violet-500 dark:border-white/[0.14] dark:text-neutral-500 dark:hover:border-violet-500/50 dark:hover:text-violet-300"
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
            </svg>
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
