'use client';

import type { InstructionCard } from '@/lib/types';
import { ShroomAvatar } from './ShroomAvatar';
import { PALETTE, resolveAvatar, textOn } from '@/lib/shrooms/avatar';

interface ShroomButtonProps {
  shroom: InstructionCard;
  isRunning?: boolean;
  isActive?: boolean;
  onClick: () => void;
  onHoverStart?: () => void;
  onHoverEnd?: () => void;
  title?: string;
  /** Fill the container instead of sizing to its label. Used by the list in the panel. */
  fill?: boolean;
}

/**
 * A shroom as a button: its face on the left, its name on the right.
 *
 * The tall card this replaced put the name under the picture, which meant a row of
 * shrooms was mostly empty colour and cost the board more than a hundred pixels of
 * height. Side by side, the same two things fit in a control you can put anywhere.
 *
 * The colour stays — it is how you pick one out without reading — but it is now the
 * size of a button rather than the size of a poster.
 */
export function ShroomButton({
  shroom,
  isRunning,
  isActive,
  onClick,
  onHoverStart,
  onHoverEnd,
  title,
  fill = false,
}: ShroomButtonProps) {
  const avatar = resolveAvatar(shroom.id, shroom.avatar);
  const palette = PALETTE.find((p) => p.key === avatar.color) ?? PALETTE[0];
  // Worked out from the colour rather than listed, so a palette entry added later
  // cannot quietly produce a button nobody can read.
  const ink = textOn(palette.bg);

  return (
    <button
      onClick={onClick}
      onMouseEnter={onHoverStart}
      onMouseLeave={onHoverEnd}
      onFocus={onHoverStart}
      onBlur={onHoverEnd}
      title={title}
      className={`relative flex h-[38px] items-center gap-1.5 overflow-hidden rounded-xl pl-1.5 pr-3 transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400 ${
        fill ? 'w-full' : 'flex-shrink-0'
      } ${isActive ? 'scale-[1.03]' : 'hover:-translate-y-px'}`}
      style={{ backgroundColor: palette.bg }}
    >
      <ShroomAvatar id={shroom.id} avatar={shroom.avatar} size={28} />

      <span
        className={`truncate text-[12px] font-semibold ${fill ? 'flex-1 text-left' : 'max-w-[150px]'}`}
        style={{ color: ink }}
      >
        {shroom.title}
      </span>

      {isRunning && (
        <span className="absolute inset-x-0 bottom-0 h-[3px] overflow-hidden bg-black/20">
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
