'use client';

import { useState, useCallback } from 'react';
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
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
import { SortableColumn } from './SortableColumn';
import { AIDebugModal } from './AIDebugModal';
// Commented out - question system disabled
// import { QuestionsDrawer } from './QuestionsDrawer';
import { InstructionRow } from './InstructionRow';
import { TaskListView } from './TaskListView';
import { ChannelSettingsDrawer } from './ChannelSettingsDrawer';
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
  const [preflightResult, setPreflightResult] = useState<PreflightResult | null>(null);

  const cards = useStore((s) => s.cards);
  const tasks = useStore((s) => s.tasks);
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
  const addTagDefinition = useStore((s) => s.addTagDefinition);
  const addTagToCard = useStore((s) => s.addTagToCard);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
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
      const result = await runInstruction(instructionCard, channel, cards, tasks, getAIAbortSignal());

      // Store debug info for the modal
      if (result.debug) {
        setDebugInfo(result.debug);
      }

      if (result.action === 'generate' && result.generatedCards) {
        // Get the first target column to add cards to
        const targetColumnId = result.targetColumnIds[0] || channel.columns[0]?.id;
        if (targetColumnId) {
          for (const cardInput of result.generatedCards) {
            createCard(channel.id, targetColumnId, cardInput, 'ai');
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
    // For generate actions, no pre-flight check needed
    if (instructionCard.action === 'generate') {
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

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
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
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="rounded-md p-2 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </header>

      {viewMode === 'tasks' ? (
        <TaskListView channelId={channel.id} />
      ) : (
        <>
          {/* Instruction cards row */}
          <InstructionRow channel={channel} onRunInstruction={handleRunInstruction} />

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
          <div className="flex h-full w-[280px] sm:w-72 flex-shrink-0 flex-col">
            {isAddingColumn ? (
              <div className="rounded-lg bg-neutral-100 p-3 dark:bg-neutral-800/50">
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
                className="flex h-10 items-center justify-center rounded-lg border-2 border-dashed border-neutral-300 text-sm text-neutral-500 hover:border-neutral-400 hover:text-neutral-600 dark:border-neutral-700 dark:hover:border-neutral-600 dark:hover:text-neutral-400"
              >
                + Add column
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
    </div>
  );
}
