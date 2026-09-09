'use client';

import { useEffect, useState } from 'react';
import type { Channel, ID, InstructionCard } from '@/lib/types';
import { buildShroomTrail, describeTrail } from '@/lib/shrooms/trail';
import { ShroomTile } from '@/components/shrooms/ShroomTile';
import { ShroomDetail } from '@/components/shrooms/ShroomDetail';

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
 * The tiles carry only a face and a name. Hovering one lights the columns it touches
 * on the board below; clicking one opens it, where the rest is spelled out and
 * running is a thing you choose. The last slot is a plus, which opens all of them.
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
  // Clicking opens the shroom rather than running it, on every device. Running
  // outright only ever worked on desktop, where hovering had already shown the
  // trail — and hover is not something a phone has.
  const [openId, setOpenId] = useState<ID | null>(null);

  // Leaving the row must clear the board highlight, or the columns stay lit.
  useEffect(() => () => onHover(null), [onHover]);

  if (shrooms.length === 0) return null;

  const openShroom = openId ? shrooms.find((s) => s.id === openId) ?? null : null;

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
              isActive={hoveredId === shroom.id || openId === shroom.id}
              title={describeTrail(buildShroomTrail(shroom, channel))}
              onHoverStart={() => onHover(shroom.id)}
              onHoverEnd={() => onHover(null)}
              onClick={() => setOpenId(shroom.id)}
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

      {openShroom && (
        <ShroomDetail
          shroom={openShroom}
          channel={channel}
          allShrooms={allShrooms}
          isRunning={runningIds.includes(openShroom.id)}
          onClose={() => setOpenId(null)}
          onRun={() => {
            onRun(openShroom);
            setOpenId(null);
          }}
          onEdit={() => {
            onEdit(openShroom.id);
            setOpenId(null);
          }}
        />
      )}
    </div>
  );
}
