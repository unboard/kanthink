'use client';

import { useState, useCallback, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  closestCenter,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
  type CollisionDetection,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import type { Channel, ID, Column as ColumnType, InstructionCard, CardChange } from '@/lib/types';
import { useStore, getAIAbortSignal } from '@/lib/store';
import { type AIDebugInfo } from '@/lib/ai/generateCards';
import { processCard } from '@/lib/ai/processCard';
import { runInstruction } from '@/lib/ai/runInstruction';
import { generateProcessingStatus } from '@/lib/processingStatus';
import { Button, Input, Modal } from '@/components/ui';
import { useSettingsStore, requireSignInForAI } from '@/lib/settingsStore';
import { SortableColumn } from './SortableColumn';
import { AIDebugModal } from './AIDebugModal';
// Commented out - question system disabled
// import { QuestionsDrawer } from './QuestionsDrawer';
import { InstructionDetailDrawerV2 } from './InstructionDetailDrawerV2';
import { ShroomChatDrawer } from './ShroomChatDrawer';
import { TaskListView } from './TaskListView';
import { ChannelSettingsDrawer } from './ChannelSettingsDrawer';
import { ShareDrawer } from '@/components/sharing/ShareDrawer';
import { useServerSync } from '@/components/providers/ServerSyncProvider';
import { AnonymousUpgradeBanner } from '@/components/ui/AnonymousUpgradeBanner';
import { CursorPresence, PresenceIndicator } from '@/components/presence/CursorPresence';
import { ChannelMembersBar } from './ChannelMembersBar';
import { useChannelMembers } from '@/lib/hooks/useChannelMembers';
// Commented out - question system disabled
// import { QuestionToast } from '@/components/ui/QuestionToast';
// import { useQuestionTrigger } from '@/lib/hooks/useQuestionTrigger';

// Pre-flight check result for instructions
interface PreflightResult {
  instruction: InstructionCard;
  totalCards: number;
  alreadyProcessed: string[];  // Card IDs
  unprocessed: string[];       // Card IDs
}

type ViewMode = 'board' | 'tasks';

interface BoardProps {
  channel: Channel;
}

export function Board({ channel }: BoardProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('board');
  const [activeId, setActiveId] = useState<ID | null>(null);
  const [activeType, setActiveType] = useState<'card' | 'column' | null>(null);
  const [dragSourceColumnId, setDragSourceColumnId] = useState<ID | null>(null);
  const [isAddingColumn, setIsAddingColumn] = useState(false);
  const [newColumnName, setNewColumnName] = useState('');
  const [debugInfo, setDebugInfo] = useState<AIDebugInfo | null>(null);
  const [isDebugModalOpen, setIsDebugModalOpen] = useState(false);
  const [isQuestionsOpen, setIsQuestionsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [editingShroomId, setEditingShroomId] = useState<string | null>(null);
  const [shroomsButtonPulse, setShroomsButtonPulse] = useState(false);
  const { isServerMode } = useServerSync();
  const { members: channelMembers } = useChannelMembers(channel.id);
  const [preflightResult, setPreflightResult] = useState<PreflightResult | null>(null);
  const [pendingShroomAction, setPendingShroomAction] = useState<{ type: 'edit' | 'run' | 'create'; id?: string } | null>(null);
  const [showShroomChatDrawer, setShowShroomChatDrawer] = useState(false);
  const searchParams = useSearchParams();
  const router = useRouter();

  // Settings store for first-time highlight
  const shroomsButtonHighlighted = useSettingsStore((s) => s.shroomsButtonHighlighted);
  const setShroomsButtonHighlighted = useSettingsStore((s) => s.setShroomsButtonHighlighted);

  // Pulse the Shrooms button on first board visit after welcome flow
  useEffect(() => {
    if (!shroomsButtonHighlighted) {
      // Start pulse animation
      setShroomsButtonPulse(true);
      // Mark as highlighted so it doesn't happen again
      setShroomsButtonHighlighted(true);
      // Stop animation after 3 pulses (2s each = 6s)
      const timer = setTimeout(() => {
        setShroomsButtonPulse(false);
      }, 6000);
      return () => clearTimeout(timer);
    }
  }, [shroomsButtonHighlighted, setShroomsButtonHighlighted]);

  // Handle query params for opening shroom edit drawer from nav
  useEffect(() => {
    const shroomsParam = searchParams.get('shrooms');
    const editParam = searchParams.get('edit');
    const runParam = searchParams.get('run');
    const createParam = searchParams.get('create');

    if (shroomsParam === 'open') {
      // Handle edit - open the edit drawer directly
      if (editParam) {
        setEditingShroomId(editParam);
      } else if (runParam) {
        // Run the shroom directly
        setPendingShroomAction({ type: 'run', id: runParam });
      } else if (createParam === 'true') {
        // Create a new shroom and open edit drawer
        setPendingShroomAction({ type: 'create' });
      }
      // Clear the query params
      router.replace(`/channel/${channel.id}`, { scroll: false });
    }
  }, [searchParams, router, channel.id]);

  const cards = useStore((s) => s.cards);
  const tasks = useStore((s) => s.tasks);
  const instructionCards = useStore((s) => s.instructionCards);
  const moveCard = useStore((s) => s.moveCard);
  const createCard = useStore((s) => s.createCard);
  const updateCard = useStore((s) => s.updateCard);
  const createColumn = useStore((s) => s.createColumn);
  const reorderColumns = useStore((s) => s.reorderColumns);
  const setCardProcessing = useStore((s) => s.setCardProcessing);
  const setCardProperties = useStore((s) => s.setCardProperties);
  const setCardProperty = useStore((s) => s.setCardProperty);
  const addQuestion = useStore((s) => s.addQuestion);
  const addMessage = useStore((s) => s.addMessage);
  const createTask = useStore((s) => s.createTask);
  const startAIOperation = useStore((s) => s.startAIOperation);
  const completeAIOperation = useStore((s) => s.completeAIOperation);
  const setGeneratingSkeletons = useStore((s) => s.setGeneratingSkeletons);
  const clearGeneratingSkeletons = useStore((s) => s.clearGeneratingSkeletons);
  const recordInstructionRun = useStore((s) => s.recordInstructionRun);
  const saveInstructionRun = useStore((s) => s.saveInstructionRun);
  const createInstructionCard = useStore((s) => s.createInstructionCard);
  const addTagDefinition = useStore((s) => s.addTagDefinition);
  const addTagToCard = useStore((s) => s.addTagToCard);
  const setCardAssignees = useStore((s) => s.setCardAssignees);
  const setTaskAssignees = useStore((s) => s.setTaskAssignees);

  // ┌─────────────────────────────────────────────────────────────────────────┐
  // │ CRITICAL: Mobile Drag-and-Drop Configuration                           │
  // │                                                                         │
  // │ DO NOT use PointerSensor - it hijacks touch events and breaks mobile.  │
  // │ PointerSensor responds to pointer events (including touch-synthesized) │
  // │ and activates on movement, which prevents scrolling.                   │
  // │                                                                         │
  // │ MouseSensor = desktop only (actual mouse events)                       │
  // │ TouchSensor = mobile only (touch events with long-press delay)         │
  // │                                                                         │
  // │ Mobile behavior: long-press 250ms to drag, swipe to scroll             │
  // │ Desktop behavior: click and drag 8px to start dragging                 │
  // │                                                                         │
  // │ Card.tsx must have: touch-manipulation (allows scroll)                 │
  // │                     touch-none when isDragging (prevents scroll)       │
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

  // Question trigger hook - shows proactive insight questions
  // DISABLED - question system commented out
  // const {
  //   recordCardMove,
  //   shouldShowQuestion,
  //   currentQuestion,
  //   handleUseful: handleQuestionUseful,
  //   handleSnooze: handleQuestionSnooze,
  //   handleDismiss: handleQuestionDismiss,
  // } = useQuestionTrigger({
  //   channel,
  //   cards,
  //   isDragging: activeId !== null,
  // });
  const recordCardMove = () => {}; // No-op stub

  // Custom collision detection: use closestCenter for columns, pointerWithin for cards
  const collisionDetection: CollisionDetection = useCallback((args) => {
    const { active } = args;
    const activeIdStr = active.id as string;

    // If dragging a column, use closestCenter and filter to only column sortables
    if (activeIdStr.startsWith('sortable-column-')) {
      const collisions = closestCenter(args);
      return collisions.filter((c) => (c.id as string).startsWith('sortable-column-'));
    }

    // For cards, use pointerWithin
    return pointerWithin(args);
  }, []);

  const activeCard = activeType === 'card' && activeId ? cards[activeId] : null;
  const activeColumn = activeType === 'column' && activeId
    ? channel.columns.find((c) => c.id === activeId) ?? null
    : null;

  const findColumnByCardId = useCallback(
    (cardId: ID): ID | null => {
      for (const col of channel.columns) {
        if (col.cardIds.includes(cardId)) {
          return col.id;
        }
      }
      return null;
    },
    [channel.columns]
  );

  const getColumnIdFromDroppableId = (droppableId: string): ID | null => {
    if (droppableId.startsWith('column-')) {
      return droppableId.replace('column-', '');
    }
    return null;
  };

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const activeIdStr = active.id as string;

    // Check if dragging a column
    if (activeIdStr.startsWith('sortable-column-')) {
      const columnId = activeIdStr.replace('sortable-column-', '');
      setActiveId(columnId);
      setActiveType('column');
      setDragSourceColumnId(null);
    } else {
      // Dragging a card - track source column for auto-process
      setActiveId(activeIdStr);
      setActiveType('card');
      setDragSourceColumnId(findColumnByCardId(activeIdStr));
    }
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    // Skip if dragging a column - handle in dragEnd only
    const activeIdStr = active.id as string;
    if (activeIdStr.startsWith('sortable-column-')) return;

    const activeCardId = active.id as ID;
    const overId = over.id as string;

    // Skip if over a column sortable (not a droppable column or card)
    if (overId.startsWith('sortable-column-')) return;

    const activeColumnId = findColumnByCardId(activeCardId);
    if (!activeColumnId) return;

    const overColumnId = getColumnIdFromDroppableId(overId);
    const overCardColumnId = findColumnByCardId(overId as ID);

    const targetColumnId = overColumnId || overCardColumnId;
    if (!targetColumnId) return;

    if (activeColumnId !== targetColumnId) {
      const targetColumn = channel.columns.find((c) => c.id === targetColumnId);
      if (!targetColumn) return;

      let newIndex = targetColumn.cardIds.length;
      if (!overColumnId && overCardColumnId) {
        const overIndex = targetColumn.cardIds.indexOf(overId as ID);
        if (overIndex >= 0) {
          newIndex = overIndex;
        }
      }

      moveCard(activeCardId, targetColumnId, newIndex);
    }
  };

  // Auto-process a card that was moved to a column with autoProcess enabled
  const triggerAutoProcess = async (cardId: ID, targetColumn: ColumnType) => {
    // Check if user is signed in before auto-processing
    if (!requireSignInForAI()) {
      return;
    }

    // Get fresh state from store (closures may be stale after drag)
    const state = useStore.getState();
    const card = state.cards[cardId];
    const freshChannel = state.channels[channel.id];
    if (!card || !freshChannel || !targetColumn.autoProcess || !targetColumn.processingPrompt) return;

    // Generate a contextual status based on the column
    const columnStatuses = [
      `Settling into ${targetColumn.name}...`,
      `Adapting for ${targetColumn.name}...`,
      `Getting cozy in ${targetColumn.name}...`,
    ];
    const status = columnStatuses[Math.floor(Math.random() * columnStatuses.length)];

    // Start global AI operation
    startAIOperation(status);
    setCardProcessing(cardId, true, status);

    try {
      const result = await processCard(card, targetColumn, freshChannel, getAIAbortSignal());

      if (result.success) {
        // Merge new properties with existing ones
        const existingProps = card.properties ?? [];
        const newPropsMap = new Map(result.properties.map((p) => [p.key, p]));

        for (const prop of existingProps) {
          if (!newPropsMap.has(prop.key)) {
            newPropsMap.set(prop.key, prop);
          }
        }

        setCardProperties(cardId, Array.from(newPropsMap.values()));

        // Handle suggested properties - add as questions
        for (const suggestion of result.suggestedProperties) {
          addQuestion(freshChannel.id, {
            question: `Add "${suggestion.label}" property to this channel?`,
            context: suggestion.reason,
            status: 'pending',
            suggestedAnswers: ['Yes, add it', 'No, skip'],
          });
        }
      }
    } finally {
      setCardProcessing(cardId, false);
      completeAIOperation();
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    const sourceColumnId = dragSourceColumnId;
    setActiveId(null);
    setActiveType(null);
    setDragSourceColumnId(null);

    if (!over) return;

    const activeIdStr = active.id as string;
    const overIdStr = over.id as string;

    // Handle column reordering
    if (activeIdStr.startsWith('sortable-column-') && overIdStr.startsWith('sortable-column-')) {
      const activeColumnId = activeIdStr.replace('sortable-column-', '');
      const overColumnId = overIdStr.replace('sortable-column-', '');

      if (activeColumnId !== overColumnId) {
        const fromIndex = channel.columns.findIndex((c) => c.id === activeColumnId);
        const toIndex = channel.columns.findIndex((c) => c.id === overColumnId);
        if (fromIndex !== -1 && toIndex !== -1) {
          reorderColumns(channel.id, fromIndex, toIndex);
        }
      }
      return;
    }

    // Handle card reordering
    const activeCardId = active.id as ID;
    const overId = over.id as string;

    // Skip if over a column sortable
    if (overId.startsWith('sortable-column-')) return;

    const activeColumnId = findColumnByCardId(activeCardId);
    if (!activeColumnId) return;

    const overColumnId = getColumnIdFromDroppableId(overId);
    const overCardColumnId = findColumnByCardId(overId as ID);

    const targetColumnId = overColumnId || overCardColumnId;
    if (!targetColumnId) return;

    // Handle same-column reordering
    if (activeColumnId === targetColumnId) {
      const column = channel.columns.find((c) => c.id === targetColumnId);
      if (!column) return;

      const activeIndex = column.cardIds.indexOf(activeCardId);

      if (overColumnId && !overCardColumnId) {
        // Dropped in empty column space - move to end
        if (activeIndex !== column.cardIds.length - 1) {
          moveCard(activeCardId, targetColumnId, column.cardIds.length);
        }
      } else if (overCardColumnId) {
        // Dropped on a specific card - reorder to that position
        const overIndex = column.cardIds.indexOf(overId as ID);
        if (overIndex >= 0 && activeIndex !== overIndex) {
          moveCard(activeCardId, targetColumnId, overIndex);
        }
      }
    }

    // Check if card moved to a different column - trigger auto-process if enabled
    if (sourceColumnId && sourceColumnId !== targetColumnId) {
      // Record card move for question triggering
      recordCardMove();

      const targetColumn = channel.columns.find((c) => c.id === targetColumnId);
      if (targetColumn?.autoProcess && targetColumn?.processingPrompt) {
        // Defer to next frame to ensure drag cleanup completes and React renders
        requestAnimationFrame(() => {
          triggerAutoProcess(activeCardId, targetColumn);
        });
      }
    }
  };

  const handleAddColumn = () => {
    const trimmed = newColumnName.trim();
    if (trimmed) {
      createColumn(channel.id, trimmed);
      setNewColumnName('');
      setIsAddingColumn(false);
    }
  };

  // Helper to get target column IDs for an instruction
  const getTargetColumnIds = useCallback((instructionCard: InstructionCard) => {
    const target = instructionCard.target;
    if (target.type === 'board') return channel.columns.map((c) => c.id);
    if (target.type === 'column') return [target.columnId];
    if (target.type === 'columns') return target.columnIds;
    return [];
  }, [channel.columns]);

  // Execute instruction on specific cards (or all if cardIdsToProcess is undefined)
  const executeInstruction = async (
    instructionCard: InstructionCard,
    cardIdsToProcess?: string[]
  ) => {
    const targetColumnIds = getTargetColumnIds(instructionCard);
    const targetCardIds: string[] = [];
    const statusMessage = generateProcessingStatus(instructionCard);

    // Get target column name for context
    const targetColumn = targetColumnIds[0]
      ? channel.columns.find((c) => c.id === targetColumnIds[0])
      : null;

    // Extract keywords from instructions for contextual messages
    const instructionText = `${instructionCard.title} ${instructionCard.instructions}`.toLowerCase();
    const keywords: string[] = [];
    if (instructionText.includes('art') || instructionText.includes('creative') || instructionText.includes('design')) keywords.push('creative');
    if (instructionText.includes('code') || instructionText.includes('programming') || instructionText.includes('technical')) keywords.push('technical');
    if (instructionText.includes('idea') || instructionText.includes('brainstorm')) keywords.push('ideas');
    if (instructionText.includes('review') || instructionText.includes('analyze')) keywords.push('analysis');
    if (instructionText.includes('write') || instructionText.includes('content')) keywords.push('writing');

    // Start global AI operation for status bar with context
    startAIOperation(statusMessage, {
      action: instructionCard.action,
      instructionTitle: instructionCard.title,
      targetColumnName: targetColumn?.name,
      cardCount: instructionCard.cardCount,
      keywords,
    });

    if (instructionCard.action === 'modify' || instructionCard.action === 'move') {
      // Set processing state on cards to process
      const cardsToProcess = cardIdsToProcess ?? [];
      if (!cardIdsToProcess) {
        // No specific list, get all cards in target columns
        for (const columnId of targetColumnIds) {
          const column = channel.columns.find((c) => c.id === columnId);
          if (column) {
            for (const cardId of column.cardIds) {
              cardsToProcess.push(cardId);
            }
          }
        }
      }
      for (const cardId of cardsToProcess) {
        targetCardIds.push(cardId);
        setCardProcessing(cardId, true, statusMessage);
      }
    }

    // Show skeleton cards for generate actions
    if (instructionCard.action === 'generate') {
      const skeletonColumnId = targetColumnIds[0] || channel.columns[0]?.id;
      if (skeletonColumnId) {
        setGeneratingSkeletons(skeletonColumnId, instructionCard.cardCount ?? 3);
      }
    }

    try {
      const result = await runInstruction(instructionCard, channel, cards, tasks, getAIAbortSignal(), undefined, undefined, channelMembers);

      // Store debug info for the modal
      if (result.debug) {
        setDebugInfo(result.debug);
      }

      // Build a set of valid member IDs for filtering hallucinated IDs
      const validMemberIds = new Set(channelMembers.map(m => m.id));
      const filterAssignees = (ids?: string[]) =>
        ids?.filter(id => validMemberIds.has(id));

      if (result.action === 'generate' && result.generatedCards) {
        // Get the first target column to add cards to
        const targetColumnId = result.targetColumnIds[0] || channel.columns[0]?.id;
        if (targetColumnId) {
          for (const cardInput of result.generatedCards) {
            const newCard = createCard(channel.id, targetColumnId, cardInput, 'ai');
            const validAssignees = filterAssignees(cardInput.assignedTo);
            if (validAssignees?.length && newCard) {
              setCardAssignees(newCard.id, validAssignees);
            }
          }
        }
      } else if (result.action === 'modify' && result.modifiedCards) {
        // Track all changes for undo capability
        const changes: CardChange[] = [];

        // Update modified cards
        for (const modified of result.modifiedCards) {
          const existingCard = cards[modified.id];

          // Track title change
          if (existingCard && modified.title !== existingCard.title) {
            changes.push({
              cardId: modified.id,
              type: 'title_changed',
              previousTitle: existingCard.title,
            });
          }

          updateCard(modified.id, {
            title: modified.title,
          });

          // Apply tags if present
          if (modified.tags && modified.tags.length > 0) {
            for (const tagName of modified.tags) {
              // Check if tag already exists in channel (case-insensitive match)
              const existingTag = channel.tagDefinitions?.find(
                t => t.name.toLowerCase() === tagName.toLowerCase()
              );

              let finalTagName: string;
              if (existingTag) {
                // Use the existing tag's exact name
                finalTagName = existingTag.name;
              } else {
                // Create a new tag with a default color
                const defaultColors = ['blue', 'green', 'purple', 'orange', 'pink', 'cyan'];
                const colorIndex = (channel.tagDefinitions?.length || 0) % defaultColors.length;
                addTagDefinition(channel.id, tagName, defaultColors[colorIndex]);
                finalTagName = tagName;
              }

              // Add tag to card if not already present
              if (!existingCard?.tags?.includes(finalTagName)) {
                changes.push({
                  cardId: modified.id,
                  type: 'tag_added',
                  tagName: finalTagName,
                });
                addTagToCard(modified.id, finalTagName);
              }
            }
          }

          // Apply properties if present
          if (modified.properties && modified.properties.length > 0) {
            for (const prop of modified.properties) {
              // Track property change
              const existingProp = existingCard?.properties?.find(p => p.key === prop.key);
              changes.push({
                cardId: modified.id,
                type: 'property_set',
                propertyKey: prop.key,
                previousValue: existingProp?.value, // undefined if new property
              });

              setCardProperty(modified.id, prop.key, prop.value, prop.displayType, prop.color);
            }
          }

          // Create tasks if present (skip duplicates by title)
          if (modified.tasks && modified.tasks.length > 0) {
            // Get existing task titles for this card
            const existingTaskTitles = new Set(
              (existingCard?.taskIds || [])
                .map(id => tasks[id]?.title?.toLowerCase().trim())
                .filter(Boolean)
            );

            for (const task of modified.tasks) {
              const normalizedTitle = task.title?.toLowerCase().trim();
              if (normalizedTitle && !existingTaskTitles.has(normalizedTitle)) {
                const createdTask = createTask(channel.id, modified.id, {
                  title: task.title,
                  description: task.description,
                });
                // Apply task-level assignment if present
                const validTaskAssignees = filterAssignees(task.assignedTo);
                if (validTaskAssignees?.length) {
                  setTaskAssignees(createdTask.id, validTaskAssignees);
                }
                // Track task creation for undo
                changes.push({
                  cardId: modified.id,
                  type: 'task_added',
                  taskId: createdTask.id,
                });
                // Add to set to prevent duplicates within the same batch
                existingTaskTitles.add(normalizedTitle);
              }
            }
          }

          // Apply card-level assignment if present
          const validCardAssignees = filterAssignees(modified.assignedTo);
          if (validCardAssignees?.length) {
            setCardAssignees(modified.id, validCardAssignees);
          }

          // Add modified content as a new message if present
          if (modified.content) {
            const newMessage = addMessage(modified.id, 'ai_response', modified.content);
            if (newMessage) {
              changes.push({
                cardId: modified.id,
                type: 'message_added',
                messageId: newMessage.id,
              });
            }
          }

          // Record that this instruction has processed this card
          recordInstructionRun(modified.id, instructionCard.id);
        }

        // Save the instruction run for undo capability
        if (changes.length > 0) {
          saveInstructionRun({
            instructionId: instructionCard.id,
            instructionTitle: instructionCard.title,
            channelId: channel.id,
            timestamp: new Date().toISOString(),
            changes,
            undone: false,
          });
        }
      } else if (result.action === 'move' && result.movedCards) {
        // Move cards to their destination columns
        for (const move of result.movedCards) {
          moveCard(move.cardId, move.destinationColumnId, 0);
          // Record that this instruction has processed this card
          recordInstructionRun(move.cardId, instructionCard.id);
        }
      } else if (result.action === 'multi-step') {
        // Unified multi-step: process flat modifiedCards, movedCards, generatedCards
        // Apply modifications first, then moves (order matters for coherence)

        if (result.generatedCards) {
          const targetColumnId = result.targetColumnIds?.[0] || channel.columns[0]?.id;
          if (targetColumnId) {
            for (const cardInput of result.generatedCards) {
              const newCard = createCard(channel.id, targetColumnId, cardInput, 'ai');
              const validAssignees = filterAssignees(cardInput.assignedTo);
              if (validAssignees?.length && newCard) {
                setCardAssignees(newCard.id, validAssignees);
              }
            }
          }
        }

        if (result.modifiedCards) {
          for (const modified of result.modifiedCards) {
            updateCard(modified.id, { title: modified.title });
            if (modified.content) {
              addMessage(modified.id, 'ai_response', modified.content);
            }
            if (modified.tags) {
              for (const tagName of modified.tags) {
                const existingTag = channel.tagDefinitions?.find(t => t.name.toLowerCase() === tagName.toLowerCase());
                if (!existingTag) {
                  const defaultColors = ['blue', 'green', 'purple', 'orange', 'pink', 'cyan'];
                  const colorIndex = (channel.tagDefinitions?.length || 0) % defaultColors.length;
                  addTagDefinition(channel.id, tagName, defaultColors[colorIndex]);
                }
                addTagToCard(modified.id, existingTag?.name || tagName);
              }
            }
            if (modified.properties) {
              for (const prop of modified.properties) {
                setCardProperty(modified.id, prop.key, prop.value, prop.displayType, prop.color);
              }
            }
            // Apply card-level assignment
            const validCardAssignees = filterAssignees(modified.assignedTo);
            if (validCardAssignees?.length) {
              setCardAssignees(modified.id, validCardAssignees);
            }
            // Apply task-level assignment for any tasks created
            if (modified.tasks) {
              const existingCard = cards[modified.id];
              const existingTaskTitles = new Set(
                (existingCard?.taskIds || [])
                  .map(id => tasks[id]?.title?.toLowerCase().trim())
                  .filter(Boolean)
              );
              for (const task of modified.tasks) {
                const normalizedTitle = task.title?.toLowerCase().trim();
                if (normalizedTitle && !existingTaskTitles.has(normalizedTitle)) {
                  const createdTask = createTask(channel.id, modified.id, {
                    title: task.title,
                    description: task.description,
                  });
                  const validTaskAssignees = filterAssignees(task.assignedTo);
                  if (validTaskAssignees?.length) {
                    setTaskAssignees(createdTask.id, validTaskAssignees);
                  }
                  existingTaskTitles.add(normalizedTitle);
                }
              }
            }
            recordInstructionRun(modified.id, instructionCard.id);
          }
        }

        if (result.movedCards) {
          for (const move of result.movedCards) {
            moveCard(move.cardId, move.destinationColumnId, 0);
            recordInstructionRun(move.cardId, instructionCard.id);
          }
        }
      }

      if (result.error && result.error !== 'cancelled') {
        console.error('Instruction run error:', result.error);
      }
    } catch (error) {
      console.error('Failed to run instruction:', error);
    } finally {
      // Clear processing state on all target cards
      for (const cardId of targetCardIds) {
        setCardProcessing(cardId, false);
      }
      // Clear skeleton cards for generate actions
      if (instructionCard.action === 'generate') {
        const skeletonColumnId = targetColumnIds[0] || channel.columns[0]?.id;
        if (skeletonColumnId) {
          clearGeneratingSkeletons(skeletonColumnId);
        }
      }
      // Complete the global AI operation
      completeAIOperation();
    }
  };

  const handleRunInstruction = async (instructionCard: InstructionCard) => {
    // For generate actions or multi-step shrooms, no pre-flight check needed
    if (instructionCard.action === 'generate' || (instructionCard.steps && instructionCard.steps.length > 0)) {
      await executeInstruction(instructionCard);
      return;
    }

    // For modify/move actions, check for already-processed cards
    const targetColumnIds = getTargetColumnIds(instructionCard);
    const alreadyProcessed: string[] = [];
    const unprocessed: string[] = [];

    for (const columnId of targetColumnIds) {
      const column = channel.columns.find((c) => c.id === columnId);
      if (column) {
        for (const cardId of column.cardIds) {
          const card = cards[cardId];
          if (card?.processedByInstructions?.[instructionCard.id]) {
            alreadyProcessed.push(cardId);
          } else {
            unprocessed.push(cardId);
          }
        }
      }
    }

    const totalCards = alreadyProcessed.length + unprocessed.length;

    // If some cards are already processed, show pre-flight dialog
    if (alreadyProcessed.length > 0 && unprocessed.length > 0) {
      setPreflightResult({
        instruction: instructionCard,
        totalCards,
        alreadyProcessed,
        unprocessed,
      });
      return;
    }

    // If ALL cards are already processed, show dialog too
    if (alreadyProcessed.length > 0 && unprocessed.length === 0) {
      setPreflightResult({
        instruction: instructionCard,
        totalCards,
        alreadyProcessed,
        unprocessed,
      });
      return;
    }

    // No already-processed cards, run normally
    await executeInstruction(instructionCard);
  };

  // Handle preflight dialog choices
  const handlePreflightRunAll = async () => {
    if (!preflightResult) return;
    setPreflightResult(null);
    await executeInstruction(preflightResult.instruction);
  };

  const handlePreflightRunUnprocessed = async () => {
    if (!preflightResult) return;
    const { instruction, unprocessed } = preflightResult;
    setPreflightResult(null);
    if (unprocessed.length > 0) {
      await executeInstruction(instruction, unprocessed);
    }
  };

  const handlePreflightCancel = () => {
    setPreflightResult(null);
  };

  // Handle pending shroom actions (run or create)
  useEffect(() => {
    if (!pendingShroomAction) return;

    if (pendingShroomAction.type === 'run' && pendingShroomAction.id) {
      const instructionCard = instructionCards[pendingShroomAction.id];
      if (instructionCard) {
        setPendingShroomAction(null);
        handleRunInstruction(instructionCard);
      } else {
        setPendingShroomAction(null);
      }
    } else if (pendingShroomAction.type === 'create') {
      // Open chat drawer for conversational creation
      setPendingShroomAction(null);
      setShowShroomChatDrawer(true);
    }
  }, [pendingShroomAction, instructionCards]);

  return (
    <div className="flex h-full flex-col">
      {/* Cursor presence overlay - shows other users' cursors */}
      {isServerMode && (
        <CursorPresence channelId={channel.id} />
      )}
      {/* Shrooms button pulse animation for first-time users */}
      <style>{`
        @keyframes shrooms-button-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(139, 92, 246, 0); }
          50% { box-shadow: 0 0 0 6px rgba(139, 92, 246, 0.4); }
        }
        .shrooms-button-pulse {
          animation: shrooms-button-pulse 2s ease-in-out 3;
        }
      `}</style>
      <header className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          {/* Kanthink icon - mobile only */}
          <img
            src="https://res.cloudinary.com/dcht3dytz/image/upload/v1769532115/kanthink-icon_pbne7q.svg"
            alt="Kanthink"
            className="h-5 w-5 flex-shrink-0 md:hidden"
          />
          <h2 className="text-base sm:text-lg font-semibold text-neutral-900 dark:text-white truncate">
            {channel.name}
          </h2>
          {/* View toggle */}
          <div className="flex items-center bg-neutral-100 dark:bg-neutral-800 rounded-lg p-0.5 sm:p-1 flex-shrink-0">
            <button
              onClick={() => setViewMode('board')}
              className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 text-xs sm:text-sm rounded-md transition-colors ${
                viewMode === 'board'
                  ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
              }`}
            >
              <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
              </svg>
              <span className="hidden xs:inline">Board</span>
            </button>
            <button
              onClick={() => setViewMode('tasks')}
              className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 text-xs sm:text-sm rounded-md transition-colors ${
                viewMode === 'tasks'
                  ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
              }`}
            >
              <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
              <span className="hidden xs:inline">Tasks</span>
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Channel members with online/offline status */}
          {isServerMode && (
            <ChannelMembersBar channelId={channel.id} />
          )}
{/* Shrooms button removed - now accessible from left nav */}
          {debugInfo && (
            <button
              onClick={() => setIsDebugModalOpen(true)}
              className="hidden md:block rounded-md p-2 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              title="View AI Debug Log"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
            </button>
          )}
          {isServerMode && (
            <button
              onClick={() => setIsShareOpen(true)}
              className="rounded-md p-2 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              title="Share channel"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
            </button>
          )}
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="rounded-md p-2 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            title="Channel settings"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </header>

      <AnonymousUpgradeBanner />

      {viewMode === 'tasks' ? (
        <TaskListView channelId={channel.id} />
      ) : (
        <>
          <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex flex-1 gap-3 sm:gap-4 overflow-x-auto px-4 sm:px-6 py-3 sm:py-4">
          <SortableContext
            items={channel.columns.map((c) => `sortable-column-${c.id}`)}
            strategy={horizontalListSortingStrategy}
          >
            {channel.columns.map((column) => (
              <SortableColumn
                key={column.id}
                column={column}
                channelId={channel.id}
                columnCount={channel.columns.length}
              />
            ))}
          </SortableContext>

          {/* Add Column */}
          <div className="flex-shrink-0 self-stretch">
            {isAddingColumn ? (
              <div className="w-[280px] sm:w-72 rounded-lg bg-neutral-100 p-3 dark:bg-neutral-800/50">
                <Input
                  placeholder="Column name"
                  value={newColumnName}
                  onChange={(e) => setNewColumnName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddColumn();
                    if (e.key === 'Escape') {
                      setIsAddingColumn(false);
                      setNewColumnName('');
                    }
                  }}
                  autoFocus
                />
                <div className="mt-2 flex gap-2">
                  <Button size="sm" onClick={handleAddColumn} disabled={!newColumnName.trim()}>
                    Add
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setIsAddingColumn(false);
                      setNewColumnName('');
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setIsAddingColumn(true)}
                className="flex h-full w-12 items-center justify-center rounded-lg bg-neutral-100 dark:bg-neutral-800/50 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
                title="Add column"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
            )}
          </div>
        </div>
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
          {activeColumn && (
            <div className="w-72 cursor-grabbing rounded-lg bg-neutral-100 p-3 shadow-lg opacity-80 dark:bg-neutral-800">
              <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                {activeColumn.name}
              </h3>
              <p className="mt-1 text-xs text-neutral-400">
                {activeColumn.cardIds.length} cards
              </p>
            </div>
          )}
        </DragOverlay>
          </DndContext>
        </>
      )}

      <AIDebugModal
        isOpen={isDebugModalOpen}
        onClose={() => setIsDebugModalOpen(false)}
        debug={debugInfo}
      />

      {/* Pre-flight dialog for already-processed cards */}
      <Modal
        isOpen={!!preflightResult}
        onClose={handlePreflightCancel}
        title="Some cards already processed"
        size="sm"
      >
        {preflightResult && (
          <div className="space-y-4">
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              <strong>{preflightResult.alreadyProcessed.length}</strong> of{' '}
              <strong>{preflightResult.totalCards}</strong> cards have already been
              processed by "{preflightResult.instruction.title}".
            </p>

            <div className="flex flex-col gap-2">
              {preflightResult.unprocessed.length > 0 && (
                <Button
                  onClick={handlePreflightRunUnprocessed}
                  variant="primary"
                  className="w-full"
                >
                  Run on {preflightResult.unprocessed.length} unprocessed only
                </Button>
              )}
              <Button
                onClick={handlePreflightRunAll}
                variant="secondary"
                className="w-full"
              >
                Run on all {preflightResult.totalCards} cards
              </Button>
              <Button
                onClick={handlePreflightCancel}
                variant="ghost"
                className="w-full"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <ChannelSettingsDrawer
        channel={channel}
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      <ShareDrawer
        channelId={channel.id}
        channelName={channel.name}
        isOpen={isShareOpen}
        onClose={() => setIsShareOpen(false)}
      />

      <InstructionDetailDrawerV2
        instructionCard={editingShroomId ? instructionCards[editingShroomId] : null}
        channel={channel}
        isOpen={editingShroomId !== null}
        onClose={() => setEditingShroomId(null)}
        onRun={handleRunInstruction}
        onChatWithKan={(card) => {
          setEditingShroomId(null);
          setShowShroomChatDrawer(true);
        }}
      />

      <ShroomChatDrawer
        channel={channel}
        isOpen={showShroomChatDrawer}
        onClose={() => setShowShroomChatDrawer(false)}
        onShroomCreated={(shroom) => {
          setShowShroomChatDrawer(false);
          setEditingShroomId(shroom.id);
        }}
        onShroomUpdated={() => setShowShroomChatDrawer(false)}
        onManualFallback={() => {
          setShowShroomChatDrawer(false);
          const newCard = createInstructionCard(channel.id, {
            title: 'New Action',
            instructions: '',
            action: 'generate',
            target: { type: 'column', columnId: channel.columns[0]?.id || '' },
            runMode: 'manual',
            cardCount: 5,
          });
          setEditingShroomId(newCard.id);
        }}
      />
    </div>
  );
}
