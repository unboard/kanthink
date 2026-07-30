'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { InstructionCard } from '@/lib/types';
import { useShroomRun, shroomsForCard } from './ShroomRunContext';
import { MobileMenuDrawer, useIsMobile } from './MobileMenuDrawer';

interface ShroomPickerProps {
  isOpen: boolean;
  onClose: () => void;
  /** Cards the run should be scoped to. Empty means the shroom's usual target. */
  cardIds?: string[];
  /** Only offer shrooms that can act on a single card. */
  cardScoped?: boolean;
  /** Shown above the list so it's clear what the run will apply to. */
  subtitle?: string;
}

const ACTION_LABELS: Record<string, string> = {
  generate: 'Generates cards',
  modify: 'Updates cards',
  move: 'Moves cards',
  report: 'Reports back',
};

/**
 * Pick a shroom to run against whatever the caller has in hand — a card, a selection,
 * or a column.
 *
 * Renders through a portal in both layouts: a bottom sheet on mobile, a centered panel
 * on desktop. Call sites just toggle `isOpen`. Anchored dropdowns were the wrong shape
 * here — the triggers live inside drawers, dnd-kit `transform`ed cards, and a fixed
 * toolbar, all of which create stacking contexts that trapped the menu underneath.
 */
export function ShroomPicker({ isOpen, onClose, cardIds, cardScoped, subtitle }: ShroomPickerProps) {
  const { runShroom, shrooms, runningIds } = useShroomRun();
  const isMobile = useIsMobile();
  const panelRef = useRef<HTMLDivElement>(null);

  const available = cardScoped ? shroomsForCard(shrooms) : shrooms;

  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  const handleRun = (shroom: InstructionCard) => {
    runShroom(shroom, cardIds?.length ? { cardIds } : undefined);
    onClose();
  };

  const emptyMessage = cardScoped
    ? 'No shrooms in this channel can act on a single card yet. Shrooms that update or move cards will show up here.'
    : 'No shrooms in this channel yet.';

  const list = (
    <>
      {available.length === 0 ? (
        <p className="px-3 py-4 text-xs text-neutral-500 dark:text-neutral-400">{emptyMessage}</p>
      ) : (
        available.map((shroom) => {
          const isRunning = runningIds.includes(shroom.id);
          return (
            <button
              key={shroom.id}
              onClick={() => handleRun(shroom)}
              disabled={isRunning}
              className="w-full flex items-start gap-3 px-3 py-3 text-left rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-700/50 transition-colors disabled:opacity-50"
            >
              <span className="mt-0.5 text-base leading-none flex-shrink-0">🍄</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-neutral-800 dark:text-neutral-200 truncate">
                  {shroom.title}
                </span>
                <span className="block text-xs text-neutral-500 dark:text-neutral-400">
                  {isRunning ? 'Running…' : ACTION_LABELS[shroom.action] ?? shroom.action}
                </span>
              </span>
            </button>
          );
        })
      )}
    </>
  );

  if (!isOpen) return null;

  if (isMobile) {
    return (
      <MobileMenuDrawer
        isOpen={isOpen}
        onClose={onClose}
        title={subtitle ?? 'Run a shroom'}
        minHeight="40vh"
      >
        {list}
      </MobileMenuDrawer>
    );
  }

  if (typeof document === 'undefined') return null;

  // Desktop: portal to body for the same reason the mobile sheet does — the triggers
  // sit inside stacking contexts that would otherwise clip an anchored menu.
  return createPortal(
    <div
      className="fixed inset-0 z-[100] hidden md:flex items-center justify-center bg-black/30"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
        className="w-80 max-h-[70vh] overflow-y-auto rounded-xl bg-white dark:bg-neutral-800 shadow-2xl border border-neutral-200 dark:border-neutral-700 p-2"
      >
        <div className="px-3 pt-2 pb-1">
          <h3 className="text-sm font-medium text-neutral-900 dark:text-white">Run a shroom</h3>
          {subtitle && (
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 wrap-anywhere">{subtitle}</p>
          )}
        </div>
        {list}
      </div>
    </div>,
    document.body
  );
}
