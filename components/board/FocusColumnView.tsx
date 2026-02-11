'use client';

import { useState } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Column as ColumnType, ID, Card as CardType } from '@/lib/types';
import { useStore } from '@/lib/store';
import { Card } from './Card';
import { BacksideCard } from './BacksideCard';
import { SkeletonCard } from './SkeletonCard';
import { CardDetailDrawer } from './CardDetailDrawer';

interface FocusColumnViewProps {
  column: ColumnType;
  channelId: ID;
}

function SortableGridCard({ card }: { card: CardType }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: card.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={isDragging ? 'opacity-50' : ''}
    >
      <Card card={card} />
    </div>
  );
}

export function FocusColumnView({ column, channelId }: FocusColumnViewProps) {
  const cards = useStore((s) => s.cards);
  const moveCard = useStore((s) => s.moveCard);
  const createCard = useStore((s) => s.createCard);
  const skeletonCount = useStore((s) => s.generatingSkeletons[column.id] ?? 0);

  const [activeId, setActiveId] = useState<ID | null>(null);
  const [newCardId, setNewCardId] = useState<ID | null>(null);
  const [isCardDrawerOpen, setIsCardDrawerOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const columnCards = column.cardIds.map((id) => cards[id]).filter(Boolean);
  const backsideCards = (column.backsideCardIds ?? []).map((id) => cards[id]).filter(Boolean);
  const activeCard = activeId ? cards[activeId] : null;

  // ┌─────────────────────────────────────────────────────────────────────────┐
  // │ CRITICAL: Mobile Drag-and-Drop Configuration                           │
  // │ DO NOT use PointerSensor - see Board.tsx for full explanation.          │
  // └─────────────────────────────────────────────────────────────────────────┘
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as ID);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over || active.id === over.id) return;

    const activeIndex = column.cardIds.indexOf(active.id as ID);
    const overIndex = column.cardIds.indexOf(over.id as ID);

    if (activeIndex >= 0 && overIndex >= 0) {
      moveCard(active.id as ID, column.id, overIndex);
    }
  };

  const handleAddCard = () => {
    const card = createCard(channelId, column.id, { title: 'Untitled' });
    setNewCardId(card.id);
    setIsCardDrawerOpen(true);
  };

  const handleCardDrawerClose = () => {
    setIsCardDrawerOpen(false);
    setNewCardId(null);
  };

  const newCard = newCardId ? cards[newCardId] : null;

  return (
    <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-3 sm:py-4">
      {/* Top bar with add card + archive toggle */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={handleAddCard}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white dark:bg-neutral-800 text-sm text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700 shadow-sm transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add card
        </button>
        {backsideCards.length > 0 && (
          <button
            onClick={() => setShowArchived(!showArchived)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
              showArchived
                ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                : 'bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700 shadow-sm'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
            </svg>
            Archived ({backsideCards.length})
          </button>
        )}
      </div>

      {showArchived ? (
        /* Archived cards list */
        <div className="max-w-xl mx-auto space-y-3">
          {backsideCards.map((card) => (
            <BacksideCard key={card.id} card={card} />
          ))}
        </div>
      ) : (
        /* Active cards grid with DnD */
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={column.cardIds}
            strategy={verticalListSortingStrategy}
          >
            <div className="max-w-xl mx-auto space-y-3">
              {columnCards.map((card) => (
                <SortableGridCard key={card.id} card={card} />
              ))}
              {/* Skeleton cards while AI is generating */}
              {skeletonCount > 0 &&
                Array.from({ length: skeletonCount }).map((_, i) => (
                  <SkeletonCard key={`skeleton-${i}`} className="h-20" />
                ))}
            </div>
          </SortableContext>
          <DragOverlay>
            {activeCard && (
              <div className="w-72 cursor-grabbing rounded-md bg-white p-3 shadow-lg dark:bg-neutral-900">
                <h4 className="text-sm font-medium text-neutral-900 dark:text-white">
                  {activeCard.title}
                </h4>
                {(activeCard.summary || (activeCard.messages ?? []).length > 0) && (
                  <p className="mt-1 text-xs text-neutral-500 line-clamp-2">
                    {activeCard.summary || (activeCard.messages ?? [])[0]?.content?.slice(0, 100)}
                  </p>
                )}
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}

      {/* Empty state */}
      {columnCards.length === 0 && skeletonCount === 0 && !showArchived && (
        <div className="flex flex-col items-center justify-center py-16 text-neutral-400">
          <svg className="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          <p className="text-sm">No cards in this column</p>
          <button
            onClick={handleAddCard}
            className="mt-3 text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 underline"
          >
            Add the first card
          </button>
        </div>
      )}

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
