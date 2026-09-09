'use client';

import type { InstructionCard } from '@/lib/types';
import { ShroomAvatar } from './ShroomAvatar';
import { PALETTE, resolveAvatar, textOn } from '@/lib/shrooms/avatar';

interface ShroomTileProps {
  shroom: InstructionCard;
  isRunning?: boolean;
  isActive?: boolean;
  onClick: () => void;
  onHoverStart?: () => void;
  onHoverEnd?: () => void;
  title?: string;
}

/**
 * A shroom as a tall card in its own colour.
 *
 * Flat: one solid colour, no gradient and no shadow. The shroom sits on it the way
 * a sticker sits on paper, which is the same reason the drawing is flat.
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
}: ShroomTileProps) {
  const avatar = resolveAvatar(shroom.id, shroom.avatar);
  const palette = PALETTE.find((p) => p.key === avatar.color) ?? PALETTE[0];
  // Worked out from the card colour rather than listed, so a new palette entry
  // cannot quietly produce a card with unreadable type.
  const ink = textOn(palette.bg);

  return (
    <button
      onClick={onClick}
      onMouseEnter={onHoverStart}
      onMouseLeave={onHoverEnd}
      onFocus={onHoverStart}
      onBlur={onHoverEnd}
      title={title}
      className={`group relative flex aspect-[9/16] w-[76px] flex-shrink-0 flex-col items-center justify-between overflow-hidden rounded-2xl px-1.5 pb-2 pt-2 transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400 ${
        isActive ? 'scale-[1.03]' : 'hover:-translate-y-0.5'
      }`}
      style={{ backgroundColor: palette.bg }}
    >
      {/* The only chrome: a ring while the pointer is on it, so the lit columns on
          the board below can be read as belonging to this shroom. */}
      {isActive && (
        <span
          className="pointer-events-none absolute inset-0 rounded-2xl border-2"
          style={{ borderColor: ink, opacity: 0.5 }}
        />
      )}

      <span className={`flex flex-1 items-center ${isRunning ? 'animate-pulse' : ''}`}>
        <ShroomAvatar id={shroom.id} avatar={shroom.avatar} size={52} />
      </span>

      <span
        className="line-clamp-2 w-full text-center text-[10px] font-semibold leading-tight"
        style={{ color: ink }}
      >
        {shroom.title}
      </span>

      {isRunning && (
        <span
          className="absolute inset-x-2 top-1.5 h-[3px] overflow-hidden rounded-full"
          style={{ backgroundColor: ink, opacity: 0.25 }}
        >
          <span
            className="absolute inset-y-0 w-1/3 animate-[shroomrun_1.4s_ease-in-out_infinite] rounded-full"
            style={{ backgroundColor: ink }}
          />
        </span>
      )}
      <style>{`@keyframes shroomrun{0%{transform:translateX(-110%)}100%{transform:translateX(330%)}}`}</style>
    </button>
  );
}
