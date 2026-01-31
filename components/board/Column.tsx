'use client';

import { useState, useRef, useEffect } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { Column as ColumnType, ID, Card as CardType } from '@/lib/types';
import { useStore } from '@/lib/store';
import { useSettingsStore } from '@/lib/settingsStore';
import { Card } from './Card';
import { BacksideCard } from './BacksideCard';
import { ColumnMenu } from './ColumnMenu';
import { ColumnDetailDrawer } from './ColumnDetailDrawer';
import { SkeletonCard } from './SkeletonCard';
import { CardDetailDrawer } from './CardDetailDrawer';

interface ColumnProps {
  column: ColumnType;
  channelId: ID;
  columnCount: number;
  dragHandleProps?: Record<string, unknown>;
}

export function Column({ column, channelId, columnCount, dragHandleProps }: ColumnProps) {
  const cards = useStore((s) => s.cards);
  const updateColumn = useStore((s) => s.updateColumn);
  const createCard = useStore((s) => s.createCard);
  const skeletonCount = useStore((s) => s.generatingSkeletons[column.id] ?? 0);
  const theme = useSettingsStore((s) => s.theme);
  const isTerminal = theme === 'terminal';

  const columnCards = column.cardIds.map((id) => cards[id]).filter(Boolean);
  const backsideCards = (column.backsideCardIds ?? []).map((id) => cards[id]).filter(Boolean);
  const backsideCount = backsideCards.length;

  const [isRenaming, setIsRenaming] = useState(false);
  const [isFlipped, setIsFlipped] = useState(false);
  const [renameValue, setRenameValue] = useState(column.name);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [newCard, setNewCard] = useState<CardType | null>(null);
  const [isCardDrawerOpen, setIsCardDrawerOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: `column-${column.id}`,
    data: {
      type: 'column-droppable',
      columnId: column.id,
    },
  });

  useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isRenaming]);

  // Auto-flip back to front when all archived cards are removed
  useEffect(() => {
    if (isFlipped && backsideCount === 0) {
      setIsFlipped(false);
    }
  }, [isFlipped, backsideCount]);

  const handleRenameSubmit = () => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== column.name) {
      updateColumn(channelId, column.id, { name: trimmed });
    } else {
      setRenameValue(column.name);
    }
    setIsRenaming(false);
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleRenameSubmit();
    } else if (e.key === 'Escape') {
      setRenameValue(column.name);
      setIsRenaming(false);
    }
  };

  const handleFlipColumn = () => {
    setIsFlipped(!isFlipped);
  };

  const handleAddCard = () => {
    const card = createCard(channelId, column.id, { title: 'Untitled' });
    setNewCard(card);
    setIsCardDrawerOpen(true);
  };

  const handleCardDrawerClose = () => {
    setIsCardDrawerOpen(false);
    setNewCard(null);
  };

  // Header JSX for front side
  const frontHeader = (
    <div className={`flex flex-col ${isTerminal ? 'border-b border-neutral-800' : ''}`}>
      {/* Terminal traffic lights */}
      {isTerminal && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-neutral-800">
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" />
            <div className="w-2.5 h-2.5 rounded-full bg-green-500/80" />
          </div>
          <span className="text-[10px] text-neutral-600 font-mono truncate">{column.name.toLowerCase().replace(/\s+/g, '-')}</span>
        </div>
      )}

      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <button
            {...dragHandleProps}
            className="cursor-grab touch-none text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 flex-shrink-0"
            title="Drag to reorder"
          >
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M7 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
            </svg>
          </button>
        {isRenaming ? (
          <input
            ref={inputRef}
            type="text"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={handleRenameSubmit}
            onKeyDown={handleRenameKeyDown}
            className="flex-1 rounded border border-neutral-300 bg-white px-1.5 py-0.5 text-sm font-medium focus:border-neutral-400 focus:outline-none dark:border-neutral-600 dark:bg-neutral-800"
          />
        ) : (
          <h3
            onClick={() => setIsRenaming(true)}
            className="flex-1 truncate text-sm font-medium cursor-pointer text-neutral-700 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-white"
            title="Click to rename"
          >
            {column.name}
          </h3>
        )}
      </div>
      <div className="flex items-center gap-1">
        <span className="text-xs text-neutral-400">{isFlipped ? backsideCount : columnCards.length}</span>
        <ColumnMenu
          channelId={channelId}
          columnId={column.id}
          columnCount={columnCount}
          cardCount={columnCards.length}
          onRename={() => setIsRenaming(true)}
          onOpenSettings={() => setIsDetailOpen(true)}
          hasInstructions={!!column.instructions}
        />
      </div>
      </div>
    </div>
  );

  return (
    <div
      className={`
        column-container
        relative w-[280px] sm:w-72 flex-shrink-0 h-full
        flex flex-col rounded-lg transition-colors
        ${isFlipped
          ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800'
          : isTerminal
            ? 'bg-neutral-950 border border-neutral-800'
            : 'bg-neutral-100 dark:bg-neutral-800/50'
        }
      `}
    >
      {/* Header - always show normal header for drag/menu access */}
      {frontHeader}

      {/* Content area */}
      <div
        ref={!isFlipped ? setDroppableRef : undefined}
        className={`flex-1 space-y-2 overflow-y-auto px-2 pb-8 min-h-[100px] rounded-b-lg transition-colors ${
          !isFlipped && isOver ? 'bg-neutral-200/50 dark:bg-neutral-700/50' : ''
        }`}
      >
        {isFlipped ? (
          // Back side - show archived cards
          backsideCards.length > 0 ? (
            backsideCards.map((card) => (
              <BacksideCard key={card.id} card={card} />
            ))
          ) : (
            <div className="flex items-center justify-center h-24 text-sm text-neutral-400">
              No archived cards
            </div>
          )
        ) : (
          // Front side - show normal cards
          <>
            {/* Add card button at top */}
            <button
              onClick={handleAddCard}
              className={`
                w-full flex items-center justify-center py-2.5 rounded-md transition-colors
                ${isTerminal
                  ? 'bg-neutral-900 text-neutral-500 hover:text-neutral-400'
                  : 'bg-white dark:bg-neutral-900 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300'
                }
              `}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </button>
            <SortableContext items={column.cardIds} strategy={verticalListSortingStrategy}>
              {columnCards.map((card) => (
                <Card key={card.id} card={card} />
              ))}
            </SortableContext>
            {/* Skeleton cards while AI is generating */}
            {skeletonCount > 0 && (
              Array.from({ length: skeletonCount }).map((_, i) => (
                <SkeletonCard key={`skeleton-${i}`} className="h-20" />
              ))
            )}
          </>
        )}
      </div>

      {/* Flip button - bottom right corner */}
      {backsideCount > 0 && (
        <button
          onClick={handleFlipColumn}
          className={`
            absolute bottom-2 right-2 z-10
            p-2 rounded-full transition-all duration-200
            ${isFlipped
              ? 'bg-neutral-600 text-white hover:bg-neutral-700'
              : 'bg-amber-500 text-white hover:bg-amber-600'
            }
          `}
          title={isFlipped ? 'Flip to front' : `${backsideCount} archived - click to view`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      )}

      {/* Column Detail Drawer */}
      <ColumnDetailDrawer
        column={column}
        channelId={channelId}
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
      />

      {/* Card Detail Drawer for new cards */}
      <CardDetailDrawer
        card={newCard}
        isOpen={isCardDrawerOpen}
        onClose={handleCardDrawerClose}
        autoFocusTitle
      />
    </div>
  );
}
