'use client';

import { useState, useEffect } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
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
import { useStore, getFavoriteShrooms } from '@/lib/store';
import { requireSignInForAI, useSettingsStore } from '@/lib/settingsStore';
import { Drawer } from '@/components/ui';
import { SortableInstructionCard } from './SortableInstructionCard';
import { InstructionDetailDrawer } from './InstructionDetailDrawer';
import { InstructionDetailDrawerV2 } from './InstructionDetailDrawerV2';
import { ShroomChatDrawer } from './ShroomChatDrawer';

type ShroomTab = 'channel' | 'favorites' | 'community';

interface PendingShroomAction {
  type: 'edit' | 'run' | 'create';
  id?: string;
}

interface ShroomsDrawerProps {
  channel: Channel;
  isOpen: boolean;
  onClose: () => void;
  onRunInstruction: (card: InstructionCardType) => Promise<void>;
  pendingAction?: PendingShroomAction | null;
  onPendingActionHandled?: () => void;
}

export function ShroomsDrawer({
  channel,
  isOpen,
  onClose,
  onRunInstruction,
  pendingAction,
  onPendingActionHandled,
}: ShroomsDrawerProps) {
  const instructionCards = useStore((s) => s.instructionCards);
  const createInstructionCard = useStore((s) => s.createInstructionCard);
  const reorderInstructionCards = useStore((s) => s.reorderInstructionCards);
  const favoriteInstructionCardIds = useStore((s) => s.favoriteInstructionCardIds);
  const toggleInstructionCardFavorite = useStore((s) => s.toggleInstructionCardFavorite);

  const [activeTab, setActiveTab] = useState<ShroomTab>('channel');
  const [selectedCardId, setSelectedCardId] = useState<ID | null>(null);
  const [runningInstructionId, setRunningInstructionId] = useState<ID | null>(null);
  const [useV2Drawer, setUseV2Drawer] = useState(true);
  // Track if detail drawer was opened via pending action (for close-all behavior)
  const [openedViaPendingAction, setOpenedViaPendingAction] = useState(false);

  // Chat drawer state
  const [showChatDrawer, setShowChatDrawer] = useState(false);
  const [chatEditShroom, setChatEditShroom] = useState<InstructionCardType | null>(null);

  // Load drawer version preference from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('shroom-drawer-v2');
    if (stored === 'true') setUseV2Drawer(true);
  }, []);

  // Reset state when drawer closes
  useEffect(() => {
    if (!isOpen) {
      setOpenedViaPendingAction(false);
      setSelectedCardId(null);
      setShowChatDrawer(false);
      setChatEditShroom(null);
    }
  }, [isOpen]);

  // Handle pending actions from mobile nav
  useEffect(() => {
    if (!isOpen || !pendingAction) return;

    if (pendingAction.type === 'edit' && pendingAction.id) {
      setSelectedCardId(pendingAction.id);
      setOpenedViaPendingAction(true);
    } else if (pendingAction.type === 'run' && pendingAction.id) {
      const card = instructionCards[pendingAction.id];
      if (card) {
        handleRunInstruction(card);
      }
    } else if (pendingAction.type === 'create') {
      // Open chat drawer for creation
      setChatEditShroom(null);
      setShowChatDrawer(true);
      setOpenedViaPendingAction(true);
    }

    onPendingActionHandled?.();
  }, [isOpen, pendingAction]);

  const toggleDrawerVersion = () => {
    const newValue = !useV2Drawer;
    setUseV2Drawer(newValue);
    localStorage.setItem('shroom-drawer-v2', String(newValue));
  };

  const shroomsExplainerDismissed = useSettingsStore((s) => s.shroomsExplainerDismissed);
  const setShroomsExplainerDismissed = useSettingsStore((s) => s.setShroomsExplainerDismissed);

  const channelInstructionCards = (channel.instructionCardIds ?? [])
    .map((id) => instructionCards[id])
    .filter(Boolean);

  const favoriteShrooms = getFavoriteShrooms(useStore.getState());

  const selectedCard = selectedCardId ? instructionCards[selectedCardId] : null;

  // CRITICAL: Use MouseSensor + TouchSensor, NOT PointerSensor
  // PointerSensor breaks mobile scroll (see CLAUDE.md)
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleAddInstruction = () => {
    // Open chat drawer for conversational creation
    setChatEditShroom(null);
    setShowChatDrawer(true);
  };

  const handleManualFallback = () => {
    // Manual fallback: create with defaults and open form editor
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
    setOpenedViaPendingAction(false);
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

  // Called from InstructionDetailDrawerV2 "Chat with Kan" button
  const handleOpenChatForEdit = (shroom: InstructionCardType) => {
    setSelectedCardId(null); // Close detail drawer
    setChatEditShroom(shroom);
    setShowChatDrawer(true);
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

          {/* Tab bar */}
          <div className="flex-shrink-0 px-4 pt-2 pb-0">
            <div className="flex gap-1 p-1 rounded-lg bg-neutral-100 dark:bg-neutral-800/50">
              {(['channel', 'favorites', 'community'] as ShroomTab[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    activeTab === tab
                      ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm'
                      : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300'
                  }`}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  {tab === 'favorites' && favoriteShrooms.length > 0 && (
                    <span className="ml-1.5 text-[10px] text-neutral-400 dark:text-neutral-500">
                      {favoriteShrooms.length}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Scrollable content area */}
          <div className="flex-1 overflow-y-auto p-4">
            {/* Explainer card - only on channel tab */}
            {activeTab === 'channel' && !shroomsExplainerDismissed && (
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

            {activeTab === 'channel' && (
              <>
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
                      <div className="space-y-3">
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
              </>
            )}

            {activeTab === 'favorites' && (
              <>
                {favoriteShrooms.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="w-16 h-16 rounded-full bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center mb-4">
                      <svg className="w-8 h-8 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                      </svg>
                    </div>
                    <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                      No favorites yet
                    </p>
                    <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400 max-w-[220px]">
                      Star a shroom to find it quickly here
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {favoriteShrooms.map((card) => (
                      <div
                        key={card.id}
                        className="group relative rounded-xl border border-neutral-700/50 hover:border-violet-500/40 bg-gradient-to-b from-neutral-800/80 to-neutral-900/90 transition-all duration-150 w-full"
                      >
                        <div className="p-3">
                          <div className="flex items-center gap-2 mb-2">
                            <div className="flex items-center gap-1.5 text-xs text-neutral-500">
                              <span className={`w-1.5 h-1.5 rounded-full ${
                                card.action === 'generate' ? 'bg-emerald-500' :
                                card.action === 'modify' ? 'bg-amber-500' : 'bg-blue-500'
                              }`} />
                              <span>{card.action.charAt(0).toUpperCase() + card.action.slice(1)}</span>
                            </div>
                            <div className="flex-1" />
                            <button
                              onClick={() => handleRunInstruction(card)}
                              className="p-1.5 rounded-lg text-neutral-500 hover:text-green-400 hover:bg-white/5 transition-colors"
                              title="Run"
                            >
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M6.5 5.5v9l7-4.5-7-4.5z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => toggleInstructionCardFavorite(card.id)}
                              className="p-1.5 rounded-lg text-amber-400 hover:text-amber-300 transition-colors"
                              title="Unfavorite"
                            >
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleCardClick(card.id)}
                              className="p-1.5 rounded-lg text-neutral-500 hover:text-neutral-300 hover:bg-white/5 transition-colors"
                              title="Edit"
                            >
                              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                              </svg>
                            </button>
                          </div>
                          <h3 className="font-semibold text-neutral-100 truncate mb-1">{card.title}</h3>
                          {card.instructions && (
                            <p className="text-xs text-neutral-400 line-clamp-2 leading-relaxed">
                              {card.instructions}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {activeTab === 'community' && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-16 h-16 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center mb-4">
                  <svg className="w-8 h-8 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Coming soon
                </p>
                <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400 max-w-[220px]">
                  Discover and share shrooms with the community
                </p>
              </div>
            )}
          </div>

          {/* Fixed footer with add button - only on channel tab */}
          {activeTab === 'channel' && (
            <div className="p-4 space-y-3">
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
          )}
        </div>
      </Drawer>

      {/* Nested detail drawer for editing individual cards */}
      {useV2Drawer ? (
        <InstructionDetailDrawerV2
          instructionCard={selectedCard}
          channel={channel}
          isOpen={selectedCardId !== null}
          onClose={handleCloseDetailDrawer}
          onRun={handleRunInstruction}
          onChatWithKan={handleOpenChatForEdit}
        />
      ) : (
        <InstructionDetailDrawer
          instructionCard={selectedCard}
          channel={channel}
          isOpen={selectedCardId !== null}
          onClose={handleCloseDetailDrawer}
          onRun={handleRunInstruction}
        />
      )}

      {/* Chat drawer for conversational creation/editing */}
      <ShroomChatDrawer
        channel={channel}
        isOpen={showChatDrawer}
        onClose={() => {
          setShowChatDrawer(false);
          setChatEditShroom(null);
        }}
        existingShroom={chatEditShroom}
        onShroomCreated={(shroom) => {
          setShowChatDrawer(false);
          setChatEditShroom(null);
          // Optionally open the detail drawer for the new shroom
          setSelectedCardId(shroom.id);
        }}
        onShroomUpdated={() => {
          setShowChatDrawer(false);
          setChatEditShroom(null);
        }}
        onManualFallback={handleManualFallback}
      />
    </>
  );
}
