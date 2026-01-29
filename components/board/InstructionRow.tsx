'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import type { Channel, ID, InstructionCard as InstructionCardType } from '@/lib/types';
import { useStore } from '@/lib/store';
import { requireSignInForAI } from '@/lib/settingsStore';
import { SortableInstructionCard } from './SortableInstructionCard';
import { InstructionDetailDrawer } from './InstructionDetailDrawer';

interface InstructionRowProps {
  channel: Channel;
  onRunInstruction: (instructionCard: InstructionCardType) => Promise<void>;
}

export function InstructionRow({ channel, onRunInstruction }: InstructionRowProps) {
  const instructionCards = useStore((s) => s.instructionCards);
  const createInstructionCard = useStore((s) => s.createInstructionCard);
  const reorderInstructionCards = useStore((s) => s.reorderInstructionCards);

  const [selectedCardId, setSelectedCardId] = useState<ID | null>(null);
  const [runningInstructionId, setRunningInstructionId] = useState<ID | null>(null);

  const channelInstructionCards = (channel.instructionCardIds ?? [])
    .map((id) => instructionCards[id])
    .filter(Boolean);

  // Scroll state for carousel navigation
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const { scrollLeft, scrollWidth, clientWidth } = container;
    setCanScrollLeft(scrollLeft > 0);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1);
  }, []);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    updateScrollState();
    container.addEventListener('scroll', updateScrollState);

    // Also update on resize
    const resizeObserver = new ResizeObserver(updateScrollState);
    resizeObserver.observe(container);

    return () => {
      container.removeEventListener('scroll', updateScrollState);
      resizeObserver.disconnect();
    };
  }, [updateScrollState, channelInstructionCards.length]);

  const scroll = (direction: 'left' | 'right') => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const scrollAmount = 200; // pixels to scroll
    container.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
  };

  const selectedCard = selectedCardId ? instructionCards[selectedCardId] : null;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleAddInstruction = () => {
    const newCard = createInstructionCard(channel.id, {
      title: 'New Action',
      instructions: '',
      action: 'generate',
      target: { type: 'column', columnId: channel.columns[0]?.id || '' },
      runMode: 'manual',
      cardCount: 5,
    });
    setSelectedCardId(newCard.id);
  };

  const handleCardClick = (cardId: ID) => {
    setSelectedCardId(cardId);
  };

  const handleCloseDrawer = () => {
    setSelectedCardId(null);
  };

  const handleRunInstruction = async (card: InstructionCardType) => {
    // Check if user is signed in before running AI action
    if (!requireSignInForAI()) {
      return;
    }

    setRunningInstructionId(card.id);
    setSelectedCardId(null); // Close drawer when running
    try {
      await onRunInstruction(card);
    } finally {
      setRunningInstructionId(null);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    const instructionCardIds = channel.instructionCardIds ?? [];
    const oldIndex = instructionCardIds.indexOf(activeId);
    const newIndex = instructionCardIds.indexOf(overId);

    if (oldIndex !== -1 && newIndex !== -1) {
      reorderInstructionCards(channel.id, oldIndex, newIndex);
    }
  };

  return (
    <>
      <div className="px-4 sm:px-6 py-3">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={channel.instructionCardIds ?? []}
            strategy={horizontalListSortingStrategy}
          >
            <div className="relative flex items-center">
              {/* Left scroll arrow */}
              {canScrollLeft && (
                <button
                  onClick={() => scroll('left')}
                  className="absolute left-0 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-neutral-800/90 text-neutral-300 shadow-lg backdrop-blur-sm transition-all hover:bg-neutral-700 hover:text-white"
                  aria-label="Scroll left"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
              )}

              {/* Scrollable container with hidden scrollbar */}
              <div
                ref={scrollContainerRef}
                className="flex items-center gap-3 overflow-x-auto scroll-smooth scrollbar-none"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
              >
                {channelInstructionCards.map((card) => (
                  <SortableInstructionCard
                    key={card.id}
                    card={card}
                    columns={channel.columns}
                    onClick={() => handleCardClick(card.id)}
                    onRun={() => handleRunInstruction(card)}
                    isRunning={runningInstructionId === card.id}
                  />
                ))}

                {/* Add instruction button */}
                <button
                  onClick={handleAddInstruction}
                  className="flex h-[49px] min-w-[120px] flex-shrink-0 items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-neutral-300 px-3 text-sm text-neutral-500 transition-colors hover:border-neutral-400 hover:text-neutral-600 dark:border-neutral-700 dark:hover:border-neutral-600 dark:hover:text-neutral-400"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add action
                </button>
              </div>

              {/* Right scroll arrow */}
              {canScrollRight && (
                <button
                  onClick={() => scroll('right')}
                  className="absolute right-0 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-neutral-800/90 text-neutral-300 shadow-lg backdrop-blur-sm transition-all hover:bg-neutral-700 hover:text-white"
                  aria-label="Scroll right"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              )}
            </div>
          </SortableContext>
        </DndContext>
      </div>

      <InstructionDetailDrawer
        instructionCard={selectedCard}
        channel={channel}
        isOpen={selectedCardId !== null}
        onClose={handleCloseDrawer}
        onRun={handleRunInstruction}
      />
    </>
  );
}
