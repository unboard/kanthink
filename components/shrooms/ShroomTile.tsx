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
}

/**
 * A shroom as a tall card in its own colour.
 *
 * Avatar and name, nothing else. What it does and when it runs are answered by
 * hovering — the columns light up — or by the sheet on a phone, so putting them on
 * the face as well would only make the card taller for no new information.
 *
 * The cap is the same colour as the card behind it, which is the point and also the
 * problem: it would disappear into its own background. A drop shadow is what keeps
 * the silhouette readable, and the silhouette is what you actually recognise a
 * shroom by at this size.
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

  return (
    <button
      onClick={onClick}
      onMouseEnter={onHoverStart}
      onMouseLeave={onHoverEnd}
      onFocus={onHoverStart}
      onBlur={onHoverEnd}
      title={title}
      className={`group relative flex aspect-[9/16] w-[72px] flex-shrink-0 flex-col items-center overflow-hidden rounded-xl px-1.5 pb-2 pt-2.5 transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70 ${
        isActive ? 'ring-2 ring-white/70' : 'hover:-translate-y-0.5'
      }`}
      style={{
        background: `linear-gradient(160deg, ${palette.cap} 0%, ${palette.deep} 100%)`,
      }}
    >
      {/* Keeps the name legible on the lighter palettes without muddying the colour. */}
      <span className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/45 to-transparent" />

      <span
        className={`relative flex flex-1 items-center ${isRunning ? 'animate-pulse' : ''}`}
        // The cap shares the card's colour, so without this it sinks into the
        // background and the shape — the thing you recognise it by — is lost.
        style={{ filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.5))' }}
      >
        <ShroomAvatar id={shroom.id} avatar={shroom.avatar} size={38} />
      </span>

      <span className="relative line-clamp-2 w-full text-center text-[10px] font-medium leading-tight text-white drop-shadow-sm">
        {shroom.title}
      </span>

      {isRunning && (
        <span className="absolute inset-x-1.5 top-1.5 h-[3px] overflow-hidden rounded-full bg-black/25">
          <span className="absolute inset-y-0 w-1/3 animate-[shroomrun_1.4s_ease-in-out_infinite] rounded-full bg-white/90" />
        </span>
      )}
      <style>{`@keyframes shroomrun{0%{transform:translateX(-110%)}100%{transform:translateX(330%)}}`}</style>
    </button>
  );
}
