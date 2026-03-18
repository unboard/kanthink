'use client';

import { useStore } from '@/lib/store';
import type { Card as CardType, ShroomTypeData, InstructionCard } from '@/lib/types';

interface ShroomWidgetProps {
  card: CardType;
}

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  generate: { label: 'Generate', color: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20' },
  modify: { label: 'Modify', color: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20' },
  move: { label: 'Move', color: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20' },
};

export function ShroomWidget({ card }: ShroomWidgetProps) {
  const typeData = card.typeData as unknown as ShroomTypeData | undefined;
  const instructionCards = useStore((s) => s.instructionCards);

  if (!typeData?.instructionCardId) {
    return (
      <div className="mt-2 px-3 py-4 rounded-lg bg-neutral-50 dark:bg-neutral-800/50 border border-dashed border-neutral-300 dark:border-neutral-600 text-center">
        <p className="text-xs text-neutral-400">No shroom linked</p>
      </div>
    );
  }

  const shroom: InstructionCard | undefined = instructionCards[typeData.instructionCardId];

  if (!shroom) {
    return (
      <div className="mt-2 px-3 py-4 rounded-lg bg-neutral-50 dark:bg-neutral-800/50 border border-dashed border-neutral-300 dark:border-neutral-600 text-center">
        <p className="text-xs text-neutral-400">Shroom not found</p>
      </div>
    );
  }

  const actionInfo = ACTION_LABELS[shroom.action] || ACTION_LABELS.generate;

  return (
    <div className="mt-2 rounded-lg bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 overflow-hidden">
      {/* Header with cover image or gradient */}
      {shroom.coverImageUrl ? (
        <div className="h-16 bg-cover bg-center" style={{ backgroundImage: `url(${shroom.coverImageUrl})` }} />
      ) : (
        <div className="h-10 bg-gradient-to-r from-violet-100 to-fuchsia-100 dark:from-violet-900/30 dark:to-fuchsia-900/30" />
      )}

      <div className="px-3 py-2.5 space-y-2">
        {/* Title + action badge */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-sm">🍄</span>
            <span className="text-sm font-semibold text-neutral-800 dark:text-neutral-100 truncate">
              {shroom.title}
            </span>
          </div>
          <span className={`flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium ${actionInfo.color}`}>
            {actionInfo.label}
          </span>
        </div>

        {/* Instructions preview */}
        {shroom.instructions && (
          <p className="text-xs text-neutral-500 dark:text-neutral-400 line-clamp-2 leading-relaxed">
            {shroom.instructions}
          </p>
        )}

        {/* Meta row */}
        <div className="flex items-center gap-3 text-[10px] text-neutral-400 dark:text-neutral-500">
          {shroom.action === 'generate' && shroom.cardCount && (
            <span>{shroom.cardCount} cards</span>
          )}
          <span className="capitalize">{shroom.runMode}</span>
          {shroom.isEnabled === false && shroom.runMode === 'automatic' && (
            <span className="text-red-400">Paused</span>
          )}
        </div>
      </div>
    </div>
  );
}
