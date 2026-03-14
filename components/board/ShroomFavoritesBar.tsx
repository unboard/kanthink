'use client';

import { useStore } from '@/lib/store';
import type { InstructionCard, ID } from '@/lib/types';
import type { ReactNode } from 'react';

interface ShroomFavoritesBarProps {
  channelId: ID;
  onRunShroom: (shroom: InstructionCard) => void;
}

const ACTION_ICONS: Record<string, ReactNode> = {
  generate: (
    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  ),
  modify: (
    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  ),
  move: (
    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
    </svg>
  ),
};

export function ShroomFavoritesBar({ channelId, onRunShroom }: ShroomFavoritesBarProps) {
  const instructionCards = useStore((s) => s.instructionCards);
  const favoriteIds = useStore((s) => s.favoriteInstructionCardIds);

  // Get channel shrooms + favorited shrooms that apply to this channel
  const channelShrooms = Object.values(instructionCards).filter(
    (ic) => ic.channelId === channelId
  );
  const favoritedShrooms = favoriteIds
    .map((id) => instructionCards[id])
    .filter(Boolean)
    .filter((ic) => ic.channelId === channelId || !ic.channelId || ic.isGlobalResource);

  // Combine: channel shrooms first, then favorites not already shown
  const channelIds = new Set(channelShrooms.map((s) => s.id));
  const extraFavorites = favoritedShrooms.filter((s) => !channelIds.has(s.id));
  const allShrooms = [...channelShrooms, ...extraFavorites];

  if (allShrooms.length === 0) return null;

  return (
    <div className="flex items-center gap-2 px-4 sm:px-6 py-1.5 overflow-x-auto scrollbar-none border-b border-neutral-200/50 dark:border-neutral-700/30">
      <span className="text-[10px] font-medium text-neutral-400 dark:text-neutral-500 uppercase tracking-wider flex-shrink-0">
        Shrooms
      </span>
      {allShrooms.map((shroom) => (
        <button
          key={shroom.id}
          onClick={() => onRunShroom(shroom)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 hover:bg-violet-100 hover:text-violet-700 dark:hover:bg-violet-900/30 dark:hover:text-violet-300 transition-colors flex-shrink-0 border border-neutral-200/50 dark:border-neutral-700/50"
          title={shroom.instructions?.slice(0, 100)}
        >
          {ACTION_ICONS[shroom.action] || ACTION_ICONS.generate}
          <span className="truncate max-w-[120px]">{shroom.title}</span>
        </button>
      ))}
    </div>
  );
}
