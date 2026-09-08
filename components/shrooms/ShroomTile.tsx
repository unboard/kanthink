'use client';

import type { Channel, InstructionCard } from '@/lib/types';
import { ShroomAvatar } from './ShroomAvatar';
import { PALETTE, resolveAvatar } from '@/lib/shrooms/avatar';
import { buildShroomTrail, describeTrail } from '@/lib/shrooms/trail';
import { describeShroom } from '@/lib/shrooms/describe';

interface ShroomTileProps {
  shroom: InstructionCard;
  channel: Channel | undefined;
  allShrooms: Record<string, InstructionCard>;
  isRunning?: boolean;
  /** Shown when the gallery spans boards, so a tile says where it lives. */
  channelName?: string;
  onOpen: () => void;
  onRun?: () => void;
}

/**
 * A shroom as a tall card, in its own colour.
 *
 * The row on a board deliberately whispers: 44px of ambient presence, where eight
 * fully-saturated chips would shout over the cards that are the actual point. This
 * is the opposite surface — somewhere you browse rather than glance, and where a
 * shroom gets to be a thing with a face rather than a line in a list.
 *
 * 9:16 because that ratio reads as an object rather than a row, which is the same
 * reason a playing card is not a bookmark.
 */
export function ShroomTile({
  shroom,
  channel,
  allShrooms,
  isRunning,
  channelName,
  onOpen,
  onRun,
}: ShroomTileProps) {
  const avatar = resolveAvatar(shroom.id, shroom.avatar);
  const palette = PALETTE.find((p) => p.key === avatar.color) ?? PALETTE[0];
  const facts = describeShroom(shroom, channel, allShrooms);
  const trail = buildShroomTrail(shroom, channel);

  return (
    <div
      className="group relative flex aspect-[9/16] flex-col overflow-hidden rounded-2xl transition-transform hover:-translate-y-0.5"
      style={{
        // The cap's own colour, as the card. This is the whole point — a shroom you
        // recognise across the page rather than by reading its name.
        background: `linear-gradient(160deg, ${palette.cap} 0%, ${palette.deep} 100%)`,
      }}
    >
      {/* A wash so text stays legible on the lighter palettes without flattening the
          colour into a muddy grey. */}
      <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-black/5 to-transparent" />

      <button
        onClick={onOpen}
        className="relative flex flex-1 flex-col p-3 text-left focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white/70"
      >
        <span className="flex items-start justify-between">
          <span className="drop-shadow-sm">
            <ShroomAvatar id={shroom.id} avatar={shroom.avatar} size={44} />
          </span>
          {facts.state !== 'manual' && (
            <span className="mt-1 flex items-center gap-1 rounded-full bg-black/25 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-white/90 backdrop-blur-sm">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  isRunning ? 'animate-pulse bg-white' : 'bg-emerald-300'
                }`}
              />
              {facts.state === 'watching' ? 'watching' : 'scheduled'}
            </span>
          )}
        </span>

        <span className="mt-auto block">
          {channelName && (
            <span className="mb-1 block truncate text-[10px] uppercase tracking-wider text-white/50">
              {channelName}
            </span>
          )}
          <span className="block text-[15px] font-semibold leading-tight text-white drop-shadow-sm">
            {shroom.title}
          </span>
          <span className="mt-1 line-clamp-3 block text-[11.5px] leading-snug text-white/75">
            {describeTrail(trail)}
          </span>
          <span className="mt-2 block truncate text-[10px] uppercase tracking-wider text-white/55">
            {facts.trigger ?? 'when you ask'}
          </span>
        </span>
      </button>

      {onRun && (
        <div className="relative px-3 pb-3">
          <button
            onClick={onRun}
            disabled={isRunning}
            className="w-full rounded-lg bg-white/15 py-1.5 text-[11.5px] font-medium text-white backdrop-blur-sm transition-all hover:bg-white/25 disabled:opacity-70 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
          >
            {isRunning ? 'Running…' : 'Run'}
          </button>
        </div>
      )}
    </div>
  );
}
