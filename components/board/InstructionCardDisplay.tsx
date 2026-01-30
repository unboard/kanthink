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

  // Edit (pencil) icon
  const EditIcon = () => (
    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
    </svg>
  );

  if (isRunning) {
    return (
      <div className={`gradient-border-animated rounded-lg ${fullWidth ? 'w-full' : 'flex-shrink-0 min-w-[160px] max-w-[220px]'}`}>
        <div className="flex h-[49px] items-center gap-2 rounded-lg px-3 bg-neutral-100 dark:bg-neutral-800/50">
          {/* Play/Lightning icon on left */}
          <div className={`p-1 rounded flex-shrink-0 ${isAutomatic ? 'text-amber-500' : 'text-neutral-400'}`}>
            {isAutomatic ? <LightningIcon /> : <PlayIcon />}
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

          {/* Edit icon on right */}
          <div className="p-1 rounded text-neutral-400 flex-shrink-0">
            <EditIcon />
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
        {/* Play/Lightning button on left */}
        <button
          onClick={onRun}
          className={`p-1.5 rounded flex-shrink-0 hover:bg-black/10 dark:hover:bg-white/10 transition-colors ${
            isAutomatic
              ? 'text-amber-500 hover:text-amber-400'
              : 'text-neutral-400 hover:text-violet-500'
          }`}
          title={isAutomatic ? 'Automatic trigger' : `Run: ${card.title}`}
        >
          {isAutomatic ? <LightningIcon /> : <PlayIcon />}
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0 text-left">
          <div className="text-sm font-medium text-neutral-700 dark:text-neutral-200 truncate">
            {card.title}
          </div>
          <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
            {getDestinationLabel()}
          </div>
        </div>

        {/* Edit button on right */}
        <button
          onClick={onClick}
          className="p-1.5 rounded flex-shrink-0 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
          title="Edit"
        >
          <EditIcon />
        </button>
      </div>
    </div>
  );
}
