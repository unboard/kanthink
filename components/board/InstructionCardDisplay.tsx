'use client';

import { useCallback } from 'react';
import type { InstructionCard, Column } from '@/lib/types';
import { useStore } from '@/lib/store';

interface InstructionCardDisplayProps {
  card: InstructionCard;
  columns: Column[];
  onClick: () => void;
  onRun: () => void;
  isRunning?: boolean;
  fullWidth?: boolean;
}

export function InstructionCardDisplay({ card, columns, onClick, onRun, isRunning: isRunningProp, fullWidth }: InstructionCardDisplayProps) {
  // Check store for running state (for automatic runs)
  const selector = useCallback(
    (s: ReturnType<typeof useStore.getState>) => s.aiOperation?.runningInstructionIds?.includes(card.id) ?? false,
    [card.id]
  );
  const isRunningInStore = useStore(selector);
  const isRunning = isRunningProp || isRunningInStore;
  // Get destination column name(s) - where cards will be added
  const getDestinationLabel = (): string => {
    const target = card.target;
    if (target.type === 'board') {
      return 'All columns';
    }
    if (target.type === 'column') {
      const col = columns.find((c) => c.id === target.columnId);
      return col?.name || 'Unknown';
    }
    if (target.type === 'columns') {
      const names = target.columnIds
        .map((id) => columns.find((c) => c.id === id)?.name)
        .filter(Boolean);
      if (names.length === 0) return 'Unknown';
      if (names.length === 1) return names[0]!;
      return `${names.length} columns`;
    }
    return 'Unknown';
  };

  const isAutomatic = card.runMode === 'automatic';

  // Lightning bolt icon for automatic mode
  const LightningIcon = () => (
    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
    </svg>
  );

  // Play icon for manual mode
  const PlayIcon = () => (
    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
      <path d="M6.5 5.5v9l7-4.5-7-4.5z" />
    </svg>
  );

  // Settings icon
  const SettingsIcon = () => (
    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );

  if (isRunning) {
    return (
      <div className={`gradient-border-animated rounded-lg ${fullWidth ? 'w-full' : 'flex-shrink-0 min-w-[160px] max-w-[220px]'}`}>
        <div className="flex h-[49px] items-center gap-2 rounded-lg px-3 bg-neutral-100 dark:bg-neutral-800/50">
          {/* Left side buttons */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {/* Play/Lightning icon */}
            <div className={`p-1 rounded ${isAutomatic ? 'text-amber-500' : 'text-neutral-400'}`}>
              {isAutomatic ? <LightningIcon /> : <PlayIcon />}
            </div>
            {/* Settings icon */}
            <div className="p-1 rounded text-neutral-400">
              <SettingsIcon />
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0 text-left">
            <div className="text-sm font-medium text-neutral-700 dark:text-neutral-200 truncate">
              {card.title}
            </div>
            <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
              {getDestinationLabel()}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`group relative rounded-lg bg-neutral-100 dark:bg-neutral-800/50 hover:bg-neutral-200/80 dark:hover:bg-neutral-700/50 transition-colors duration-75 ${fullWidth ? 'w-full' : 'flex-shrink-0 min-w-[160px] max-w-[220px]'}`}
    >
      <div className="flex h-[49px] items-center gap-2 px-3">
        {/* Left side buttons - always visible */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {/* Play/Lightning button */}
          <button
            onClick={onRun}
            className={`p-1.5 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors ${
              isAutomatic
                ? 'text-amber-500 hover:text-amber-400'
                : 'text-neutral-400 hover:text-violet-500'
            }`}
            title={isAutomatic ? 'Automatic trigger' : `Run: ${card.title}`}
          >
            {isAutomatic ? <LightningIcon /> : <PlayIcon />}
          </button>
          {/* Settings button */}
          <button
            onClick={onClick}
            className="p-1.5 rounded text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
            title="Settings"
          >
            <SettingsIcon />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 text-left">
          <div className="text-sm font-medium text-neutral-700 dark:text-neutral-200 truncate">
            {card.title}
          </div>
          <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
            {getDestinationLabel()}
          </div>
        </div>
      </div>
    </div>
  );
}
