'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useStore } from '@/lib/store';
import type { Card as CardType, Column, ID } from '@/lib/types';

// Mock channel ID for prototype - using first available channel
function useMockChannel() {
  const channels = useStore((s) => s.channels);
  const channelIds = Object.keys(channels);
  return channelIds.length > 0 ? channels[channelIds[0]] : null;
}

interface MobileCardProps {
  card: CardType;
  onLongPressStart: (cardId: ID, e: React.TouchEvent) => void;
  onLongPressEnd: () => void;
  isDragging: boolean;
  dragOffset: number;
}

function MobileCard({ card, onLongPressStart, onLongPressEnd, isDragging, dragOffset }: MobileCardProps) {
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const [isPressed, setIsPressed] = useState(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    setIsPressed(true);
    longPressTimer.current = setTimeout(() => {
      onLongPressStart(card.id, e);
    }, 300);
  };

  const handleTouchEnd = () => {
    setIsPressed(false);
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    onLongPressEnd();
  };

  const handleTouchMove = () => {
    // Cancel long press if user moves before timer fires
    if (longPressTimer.current && !isDragging) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
      setIsPressed(false);
    }
  };

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onTouchMove={handleTouchMove}
      className={`
        rounded-xl bg-white dark:bg-neutral-800 p-4 shadow-sm
        transition-all duration-150
        ${isDragging ? 'scale-105 shadow-xl z-50 opacity-90' : ''}
        ${isPressed && !isDragging ? 'scale-[0.98] opacity-80' : ''}
      `}
      style={{
        transform: isDragging ? `translateX(${dragOffset}px) scale(1.05)` : undefined,
      }}
    >
      <h3 className="font-medium text-neutral-900 dark:text-white text-base mb-1">
        {card.title}
      </h3>
      {card.summary && (
        <p className="text-sm text-neutral-500 dark:text-neutral-400 line-clamp-2">
          {card.summary}
        </p>
      )}
      {(card.taskIds?.length ?? 0) > 0 && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-neutral-400">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          {card.taskIds?.length} tasks
        </div>
      )}
    </div>
  );
}

interface ColumnViewProps {
  column: Column;
  cards: Record<string, CardType>;
  onDragCard: (cardId: ID, direction: 'left' | 'right') => void;
  onAddCard: () => void;
}

function ColumnView({ column, cards, onDragCard, onAddCard }: ColumnViewProps) {
  const [draggingCard, setDraggingCard] = useState<ID | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [dragStartX, setDragStartX] = useState(0);
  const threshold = 100; // pixels to trigger column change

  const columnCards = column.cardIds.map((id) => cards[id]).filter(Boolean);

  const handleLongPressStart = (cardId: ID, e: React.TouchEvent) => {
    setDraggingCard(cardId);
    setDragStartX(e.touches[0].clientX);
    setDragOffset(0);
    // Haptic feedback if available
    if (navigator.vibrate) {
      navigator.vibrate(50);
    }
  };

  const handleLongPressEnd = () => {
    if (draggingCard && Math.abs(dragOffset) > threshold) {
      const direction = dragOffset > 0 ? 'right' : 'left';
      onDragCard(draggingCard, direction);
    }
    setDraggingCard(null);
    setDragOffset(0);
  };

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (draggingCard) {
      const currentX = e.touches[0].clientX;
      const offset = currentX - dragStartX;
      setDragOffset(offset);
    }
  }, [draggingCard, dragStartX]);

  useEffect(() => {
    if (draggingCard) {
      window.addEventListener('touchmove', handleTouchMove, { passive: true });
      return () => window.removeEventListener('touchmove', handleTouchMove);
    }
  }, [draggingCard, handleTouchMove]);

  return (
    <div className="flex-1 overflow-y-auto px-4 pb-24">
      {/* Add card button */}
      <button
        onClick={onAddCard}
        className="w-full mb-3 py-3 rounded-xl border-2 border-dashed border-neutral-300 dark:border-neutral-700 text-neutral-400 hover:border-neutral-400 dark:hover:border-neutral-600 hover:text-neutral-500 transition-colors flex items-center justify-center gap-2"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Add card
      </button>

      {/* Cards */}
      <div className="space-y-3">
        {columnCards.map((card) => (
          <MobileCard
            key={card.id}
            card={card}
            onLongPressStart={handleLongPressStart}
            onLongPressEnd={handleLongPressEnd}
            isDragging={draggingCard === card.id}
            dragOffset={draggingCard === card.id ? dragOffset : 0}
          />
        ))}

        {columnCards.length === 0 && (
          <div className="text-center py-12 text-neutral-400">
            <p className="text-sm">No cards in this column</p>
            <p className="text-xs mt-1">Tap + to add one</p>
          </div>
        )}
      </div>

      {/* Drag indicators */}
      {draggingCard && (
        <>
          <div
            className={`fixed left-0 top-0 bottom-20 w-16 flex items-center justify-center transition-opacity ${
              dragOffset < -threshold / 2 ? 'opacity-100' : 'opacity-30'
            }`}
          >
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
              dragOffset < -threshold ? 'bg-blue-500 text-white' : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-500'
            }`}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </div>
          </div>
          <div
            className={`fixed right-0 top-0 bottom-20 w-16 flex items-center justify-center transition-opacity ${
              dragOffset > threshold / 2 ? 'opacity-100' : 'opacity-30'
            }`}
          >
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
              dragOffset > threshold ? 'bg-blue-500 text-white' : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-500'
            }`}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

interface BottomNavProps {
  columns: Column[];
  selectedIndex: number;
  onSelectColumn: (index: number) => void;
  onAddColumn: () => void;
  cards: Record<string, CardType>;
}

function BottomNav({ columns, selectedIndex, onSelectColumn, onAddColumn, cards }: BottomNavProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to selected column
  useEffect(() => {
    if (scrollRef.current) {
      const selectedButton = scrollRef.current.children[selectedIndex] as HTMLElement;
      if (selectedButton) {
        selectedButton.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-neutral-100 dark:bg-neutral-900 border-t border-neutral-200 dark:border-neutral-800 safe-area-bottom">
      <div className="flex items-center">
        <div
          ref={scrollRef}
          className="flex-1 flex overflow-x-auto scrollbar-hide gap-1 px-2 py-2"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {columns.map((column, index) => {
            const cardCount = column.cardIds.length;
            const isSelected = index === selectedIndex;

            return (
              <button
                key={column.id}
                onClick={() => onSelectColumn(index)}
                className={`
                  flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-all
                  ${isSelected
                    ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white shadow-sm'
                    : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300'
                  }
                `}
              >
                <span className="truncate max-w-[100px] block">{column.name}</span>
                <span className={`text-xs mt-0.5 block ${isSelected ? 'text-neutral-500 dark:text-neutral-400' : 'text-neutral-400 dark:text-neutral-500'}`}>
                  {cardCount} {cardCount === 1 ? 'card' : 'cards'}
                </span>
              </button>
            );
          })}
        </div>

        {/* Add column button */}
        <button
          onClick={onAddColumn}
          className="flex-shrink-0 w-12 h-full flex items-center justify-center text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 border-l border-neutral-200 dark:border-neutral-800"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default function MobileBoardPrototype() {
  const channel = useMockChannel();
  const cards = useStore((s) => s.cards);
  const moveCard = useStore((s) => s.moveCard);
  const createCard = useStore((s) => s.createCard);
  const createColumn = useStore((s) => s.createColumn);

  const [selectedColumnIndex, setSelectedColumnIndex] = useState(0);
  const [isAddingColumn, setIsAddingColumn] = useState(false);
  const [newColumnName, setNewColumnName] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  if (!channel) {
    return (
      <div className="flex h-screen items-center justify-center bg-neutral-50 dark:bg-neutral-950">
        <p className="text-neutral-500">No channel available. Create one first.</p>
      </div>
    );
  }

  const columns = channel.columns;
  const currentColumn = columns[selectedColumnIndex];

  const handleDragCard = (cardId: ID, direction: 'left' | 'right') => {
    const newIndex = direction === 'left'
      ? Math.max(0, selectedColumnIndex - 1)
      : Math.min(columns.length - 1, selectedColumnIndex + 1);

    if (newIndex !== selectedColumnIndex) {
      const targetColumn = columns[newIndex];
      moveCard(cardId, targetColumn.id, 0);
      // Haptic feedback
      if (navigator.vibrate) {
        navigator.vibrate([50, 30, 50]);
      }
    }
  };

  const handleAddCard = () => {
    if (currentColumn) {
      createCard(channel.id, currentColumn.id, { title: 'New Card' });
    }
  };

  const handleAddColumn = () => {
    setIsAddingColumn(true);
  };

  const handleCreateColumn = () => {
    if (newColumnName.trim()) {
      createColumn(channel.id, newColumnName.trim());
      setNewColumnName('');
      setIsAddingColumn(false);
      // Select the new column
      setSelectedColumnIndex(columns.length);
    }
  };

  // Swipe navigation between columns
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;
    const deltaX = touchEndX - touchStartX.current;
    const deltaY = touchEndY - touchStartY.current;

    // Only trigger if horizontal swipe is dominant
    if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
      if (deltaX > 0 && selectedColumnIndex > 0) {
        setSelectedColumnIndex(selectedColumnIndex - 1);
      } else if (deltaX < 0 && selectedColumnIndex < columns.length - 1) {
        setSelectedColumnIndex(selectedColumnIndex + 1);
      }
    }
  };

  return (
    <div className="flex flex-col h-screen bg-neutral-50 dark:bg-neutral-950">
      {/* Header */}
      <header className="flex-shrink-0 px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-neutral-900 dark:text-white">
              {channel.name}
            </h1>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              {currentColumn?.name} · {currentColumn?.cardIds.length || 0} cards
            </p>
          </div>
          <button className="p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
            </svg>
          </button>
        </div>
      </header>

      {/* Column content */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden pt-4"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {currentColumn && (
          <ColumnView
            column={currentColumn}
            cards={cards}
            onDragCard={handleDragCard}
            onAddCard={handleAddCard}
          />
        )}
      </div>

      {/* Bottom nav */}
      <BottomNav
        columns={columns}
        selectedIndex={selectedColumnIndex}
        onSelectColumn={setSelectedColumnIndex}
        onAddColumn={handleAddColumn}
        cards={cards}
      />

      {/* Add column modal */}
      {isAddingColumn && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={() => setIsAddingColumn(false)}>
          <div
            className="w-full bg-white dark:bg-neutral-900 rounded-t-2xl p-4 safe-area-bottom"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-white mb-4">
              New Column
            </h3>
            <input
              type="text"
              value={newColumnName}
              onChange={(e) => setNewColumnName(e.target.value)}
              placeholder="Column name..."
              className="w-full px-4 py-3 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateColumn();
                if (e.key === 'Escape') setIsAddingColumn(false);
              }}
            />
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setIsAddingColumn(false)}
                className="flex-1 py-3 rounded-xl text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateColumn}
                disabled={!newColumnName.trim()}
                className="flex-1 py-3 rounded-xl bg-blue-500 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Instructions overlay - shown once */}
      <div className="fixed bottom-24 left-4 right-4 pointer-events-none">
        <div className="bg-neutral-900/90 text-white text-xs rounded-lg px-3 py-2 text-center opacity-0 animate-fade-out">
          <p>Swipe left/right to change columns</p>
          <p className="mt-1">Long-press + drag cards to move them</p>
        </div>
      </div>
    </div>
  );
}
