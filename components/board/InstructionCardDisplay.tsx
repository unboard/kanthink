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

// Format relative time from ISO timestamp
function formatRelativeTime(isoTimestamp: string | undefined): string | null {
  if (!isoTimestamp) return null;

  const now = Date.now();
  const then = new Date(isoTimestamp).getTime();
  const diffMs = now - then;

  if (diffMs < 60_000) return 'Just now';

  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  const diffWeeks = Math.floor(diffDays / 7);
  return `${diffWeeks}w ago`;
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
  const lastRun = formatRelativeTime(card.lastExecutedAt);

  // Action type config - subtle styling
  const actionConfig = {
    generate: {
      label: 'Generate',
      dotClass: 'bg-emerald-500',
    },
    modify: {
      label: 'Modify',
      dotClass: 'bg-amber-500',
    },
    move: {
      label: 'Move',
      dotClass: 'bg-blue-500',
    },
  };

  const action = actionConfig[card.action];

  // Edit (pencil) icon
  const EditIcon = () => (
    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
    </svg>
  );

  // Arrow icon for destination
  const ArrowIcon = () => (
    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
    </svg>
  );

  // Lightning icon for auto mode
  const LightningIcon = () => (
    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
    </svg>
  );

  // Spinner for running state
  const Spinner = () => (
    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );

  // Play icon for run button
  const PlayIcon = () => (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
      <path d="M6.5 5.5v9l7-4.5-7-4.5z" />
    </svg>
  );

  return (
    <div
      className={`group relative rounded-xl border transition-all duration-150 ${
        isRunning
          ? 'border-violet-500/40'
          : 'border-neutral-700/50 hover:border-violet-500/40'
      } bg-gradient-to-b from-neutral-800/80 to-neutral-900/90 ${
        fullWidth ? 'w-full' : 'flex-shrink-0 min-w-[220px] max-w-[280px]'
      }`}
    >
      <div className="p-3">
        {/* Top row: Action type + Auto indicator + Kanthink badge + Edit button */}
        <div className="flex items-center gap-2 mb-2">
          {/* Action type - subtle dot + text */}
          <div className="flex items-center gap-1.5 text-xs text-neutral-500">
            <span className={`w-1.5 h-1.5 rounded-full ${action.dotClass}`} />
            <span>{action.label}</span>
          </div>

          {/* Auto mode indicator */}
          {isAutomatic && (
            <div className="flex items-center gap-1 text-xs text-amber-500/70">
              <LightningIcon />
              <span>Auto</span>
            </div>
          )}

          {/* Kanthink resource badge */}
          {card.isGlobalResource && (
            <span className="px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-300 text-[10px] font-medium">
              by Kanthink
            </span>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Run button */}
          <button
            onClick={(e) => { e.stopPropagation(); onRun(); }}
            disabled={isRunning}
            className={`p-1.5 rounded-lg transition-colors ${
              isRunning
                ? 'text-violet-400 cursor-not-allowed'
                : 'text-neutral-500 hover:text-green-400 hover:bg-white/5'
            }`}
            title={isRunning ? 'Running...' : 'Run'}
          >
            {isRunning ? <Spinner /> : <PlayIcon />}
          </button>

          {/* Edit button */}
          <button
            onClick={onClick}
            className="p-1.5 rounded-lg text-neutral-500 hover:text-neutral-300 hover:bg-white/5 transition-colors"
            title="Edit"
          >
            <EditIcon />
          </button>
        </div>

        {/* Title */}
        <h3 className="font-semibold text-neutral-100 truncate mb-1">
          {card.title}
        </h3>

        {/* Instructions preview */}
        {card.instructions && (
          <p className="text-xs text-neutral-400 line-clamp-2 mb-3 leading-relaxed">
            {card.instructions}
          </p>
        )}

        {/* Metadata row */}
        <div className="flex items-center gap-2 text-xs text-neutral-500 mb-3 flex-wrap">
          {/* Destination */}
          <div className="flex items-center gap-1">
            <ArrowIcon />
            <span>{getDestinationLabel()}</span>
          </div>

          {/* Card count for generate actions */}
          {card.action === 'generate' && card.cardCount && (
            <>
              <span className="text-neutral-600">•</span>
              <span>{card.cardCount} cards</span>
            </>
          )}

          {/* Last run time */}
          {lastRun && (
            <>
              <span className="text-neutral-600">•</span>
              <span>{lastRun}</span>
            </>
          )}
        </div>

      </div>
    </div>
  );
}
