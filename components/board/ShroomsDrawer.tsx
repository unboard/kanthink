'use client';

import { useState } from 'react';
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
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import type { Channel, ID, InstructionCard as InstructionCardType } from '@/lib/types';
import { useStore } from '@/lib/store';
import { requireSignInForAI, useSettingsStore } from '@/lib/settingsStore';
import { Drawer } from '@/components/ui';
import { SortableInstructionCard } from './SortableInstructionCard';
import { InstructionDetailDrawer } from './InstructionDetailDrawer';

interface ShroomsDrawerProps {
  channel: Channel;
  isOpen: boolean;
  onClose: () => void;
  onRunInstruction: (card: InstructionCardType) => Promise<void>;
}

export function ShroomsDrawer({
  channel,
  isOpen,
  onClose,
  onRunInstruction,
}: ShroomsDrawerProps) {
  const instructionCards = useStore((s) => s.instructionCards);
  const createInstructionCard = useStore((s) => s.createInstructionCard);
  const reorderInstructionCards = useStore((s) => s.reorderInstructionCards);

  const [selectedCardId, setSelectedCardId] = useState<ID | null>(null);
  const [runningInstructionId, setRunningInstructionId] = useState<ID | null>(null);

  const shroomsExplainerDismissed = useSettingsStore((s) => s.shroomsExplainerDismissed);
  const setShroomsExplainerDismissed = useSettingsStore((s) => s.setShroomsExplainerDismissed);

  const channelInstructionCards = (channel.instructionCardIds ?? [])
    .map((id) => instructionCards[id])
    .filter(Boolean);

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

  const handleCloseDetailDrawer = () => {
    setSelectedCardId(null);
  };

  const handleRunInstruction = async (card: InstructionCardType) => {
    if (!requireSignInForAI()) {
      return;
    }

    setRunningInstructionId(card.id);
    setSelectedCardId(null);
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
      <Drawer isOpen={isOpen} onClose={onClose} width="md" floating hideCloseButton>
        <div className="flex flex-col h-[100dvh] sm:h-full sm:max-h-[calc(100vh-2rem)]">
          {/* Header */}
          <div className="flex-shrink-0 sticky top-0 z-10 bg-white dark:bg-neutral-900 flex items-center gap-3 px-4 py-3">
            <img
              src="https://res.cloudinary.com/dcht3dytz/image/upload/v1769532115/kanthink-icon_pbne7q.svg"
              alt=""
              className="w-8 h-8 flex-shrink-0"
            />
            <div className="flex-1 min-w-0">
              <h2 className="font-medium text-neutral-900 dark:text-white">
                Shrooms
              </h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
                AI-powered actions for your board
              </p>
            </div>
            <button
              onClick={onClose}
              className="flex-shrink-0 w-8 h-8 flex items-center justify-center text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Scrollable content area */}
          <div className="flex-1 overflow-y-auto p-4">
            {/* Explainer card */}
            {!shroomsExplainerDismissed && (
              <div className="mb-4 p-4 rounded-xl bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-950/30 dark:to-purple-950/30 relative">
                <button
                  onClick={() => setShroomsExplainerDismissed(true)}
                  className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center text-violet-400 hover:text-violet-600 dark:text-violet-500 dark:hover:text-violet-300 rounded-full hover:bg-violet-100 dark:hover:bg-violet-900/30"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
                <div className="flex items-start gap-3 pr-6">
                  <div className="w-8 h-8 rounded-full bg-violet-100 dark:bg-violet-900/50 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-violet-600 dark:text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-violet-900 dark:text-violet-100">
                      What are shrooms?
                    </h3>
                    <p className="mt-1 text-xs text-violet-700/80 dark:text-violet-300/70 leading-relaxed">
                      Shrooms are AI-powered automations that can generate new cards, enrich existing ones with data, or move cards between columns based on rules you define.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {channelInstructionCards.length === 0 ? (
              /* Empty state */
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-16 h-16 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center mb-4">
                  <svg className="w-8 h-8 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  No shrooms yet
                </p>
                <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400 max-w-[200px]">
                  Create your first shroom to start automating your board
                </p>
              </div>
            ) : (
              /* Instruction cards list */
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={channel.instructionCardIds ?? []}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-2">
                    {channelInstructionCards.map((card) => (
                      <SortableInstructionCard
                        key={card.id}
                        card={card}
                        columns={channel.columns}
                        onClick={() => handleCardClick(card.id)}
                        onRun={() => handleRunInstruction(card)}
                        isRunning={runningInstructionId === card.id}
                        fullWidth
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>

          {/* Fixed footer with add button */}
          <div className="p-4">
            <button
              onClick={handleAddInstruction}
              className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-neutral-300 dark:border-neutral-700 px-4 py-3 text-sm font-medium text-neutral-600 dark:text-neutral-400 transition-colors hover:border-neutral-400 hover:text-neutral-700 dark:hover:border-neutral-600 dark:hover:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add shroom
            </button>
          </div>
        </div>
      </Drawer>

      {/* Nested detail drawer for editing individual cards */}
      <InstructionDetailDrawer
        instructionCard={selectedCard}
        channel={channel}
        isOpen={selectedCardId !== null}
        onClose={handleCloseDetailDrawer}
        onRun={handleRunInstruction}
      />
    </>
  );
}
