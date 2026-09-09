'use client';

import type { InstructionCard } from '@/lib/types';
import { ShroomAvatar } from './ShroomAvatar';
import { PALETTE, resolveAvatar } from '@/lib/shrooms/avatar';

interface ShroomTileProps {
  shroom: InstructionCard;
  isRunning?: boolean;
  isActive?: boolean;
  onClick: () => void;
  onHoverStart?: () => void;
  onHoverEnd?: () => void;
  title?: string;
  /** Fill its container instead of the fixed row width. Used by the grid in the panel. */
  fill?: boolean;
}

/**
 * A shroom as a tall card on the board's own surface.
 *
 * The card takes the columns' background rather than the shroom's colour: a row of
 * saturated cards above the board shouted over the columns underneath, which are the
 * thing you actually came to look at. The mushroom is the only coloured object on
 * the tile, which is enough to tell them apart and quiet enough to sit above a board.
 *
 * Avatar and name, nothing else. What a shroom does and when it runs are answered
 * by hovering it — the columns light up on the board below — or by the sheet a tap
 * opens on a phone, so putting them on the face as well would only make the card
 * taller for information you already have.
 */
export function ShroomTile({
  shroom,
  isRunning,
  isActive,
  onClick,
  onHoverStart,
  onHoverEnd,
  title,
  fill = false,
}: ShroomTileProps) {
  const avatar = resolveAvatar(shroom.id, shroom.avatar);
  const palette = PALETTE.find((p) => p.key === avatar.color) ?? PALETTE[0];

  return (
    <button
      onClick={onClick}
      onMouseEnter={onHoverStart}
      onMouseLeave={onHoverEnd}
      onFocus={onHoverStart}
      onBlur={onHoverEnd}
      title={title}
      className={`group relative flex aspect-[9/16] flex-col items-center justify-between overflow-hidden rounded-2xl bg-neutral-100 px-1.5 pb-2 pt-2 transition-transform dark:bg-neutral-800/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400 ${
        fill ? 'w-full' : 'w-[76px] flex-shrink-0'
      } ${isActive ? 'scale-[1.03]' : 'hover:-translate-y-0.5'}`}
    >
      {/* The colour lives in the shroom, not behind it. A row of saturated cards sat
          above the board shouting over the columns, which are the thing you came to
          look at — so the tile takes the column's own surface and lets the mushroom
          be the only coloured object on it. */}
      {isActive && (
        <span
          className="pointer-events-none absolute inset-0 rounded-2xl border-2"
          style={{ borderColor: palette.cap }}
        />
      )}

      <span className={`flex flex-1 items-center ${isRunning ? 'animate-pulse' : ''}`}>
        <ShroomAvatar id={shroom.id} avatar={shroom.avatar} size={fill ? 64 : 52} />
      </span>

      <span className="line-clamp-2 w-full text-center text-[10px] font-semibold leading-tight text-neutral-700 dark:text-neutral-300">
        {shroom.title}
      </span>

      {isRunning && (
        <span className="absolute inset-x-2 top-1.5 h-[3px] overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
          <span
            className="absolute inset-y-0 w-1/3 animate-[shroomrun_1.4s_ease-in-out_infinite] rounded-full"
            style={{ backgroundColor: palette.cap }}
          />
        </span>
      )}
      <style>{`@keyframes shroomrun{0%{transform:translateX(-110%)}100%{transform:translateX(330%)}}`}</style>
    </button>
  );
}
