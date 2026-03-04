'use client';

import { useState, useRef, useEffect } from 'react';
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
} from '@dnd-kit/sortable';
import type { Column as ColumnType, ID } from '@/lib/types';
import { useStore } from '@/lib/store';
import { Card } from './Card';
import { BacksideCard } from './BacksideCard';
import { BacksideTask } from './BacksideTask';
import { SkeletonCard } from './SkeletonCard';
import { CardDetailDrawer } from './CardDetailDrawer';
import { ColumnMenu } from './ColumnMenu';
import { ColumnDetailDrawer } from './ColumnDetailDrawer';
import { ColumnTaskItem } from './ColumnTaskItem';
import { TaskDrawer } from './TaskDrawer';

interface FocusColumnViewProps {
  column: ColumnType;
  channelId: ID;
  onExitFocus: () => void;
}

export function FocusColumnView({ column, channelId, onExitFocus }: FocusColumnViewProps) {
  const cards = useStore((s) => s.cards);
  const tasks = useStore((s) => s.tasks);
  const moveCard = useStore((s) => s.moveCard);
  const createCard = useStore((s) => s.createCard);
  const createColumnTask = useStore((s) => s.createColumnTask);
  const reorderColumnItems = useStore((s) => s.reorderColumnItems);
  const hideCompletedTasks = useStore((s) => s.hideCompletedTasks);
  const updateColumn = useStore((s) => s.updateColumn);
  const skeletonCount = useStore((s) => s.generatingSkeletons[column.id] ?? 0);

  const [activeId, setActiveId] = useState<ID | null>(null);
  const [activeType, setActiveType] = useState<'card' | 'task' | null>(null);
  const [newCardId, setNewCardId] = useState<ID | null>(null);
  const [isCardDrawerOpen, setIsCardDrawerOpen] = useState(false);
  const [newTaskId, setNewTaskId] = useState<ID | null>(null);
  const [isTaskDrawerOpen, setIsTaskDrawerOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(column.name);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const columnCards = column.cardIds.map((id) => cards[id]).filter(Boolean);
  const backsideCards = (column.backsideCardIds ?? []).map((id) => cards[id]).filter(Boolean);
  const backsideTasks = (column.backsideTaskIds ?? []).map((id) => tasks[id]).filter(Boolean);
  const backsideCount = backsideCards.length + backsideTasks.length;
  const completedTaskCount = (column.taskIds ?? []).filter((id) => tasks[id]?.status === 'done').length;
  const itemOrder = column.itemOrder ?? column.cardIds;
  const activeCard = activeType === 'card' && activeId ? cards[activeId] : null;
  const activeTaskItem = activeType === 'task' && activeId ? tasks[activeId] : null;

  // Auto-flip back when all backside items are gone
  useEffect(() => {
    if (showArchived && backsideCount === 0) {
      setShowArchived(false);
    }
  }, [showArchived, backsideCount]);

  useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isRenaming]);

  const handleRenameSubmit = () => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== column.name) {
      updateColumn(channelId, column.id, { name: trimmed });
    } else {
      setRenameValue(column.name);
    }
    setIsRenaming(false);
  };

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
    const activeData = event.active.data?.current;
    setActiveId(event.active.id as ID);
    setActiveType(activeData?.type === 'column-task' ? 'task' : 'card');
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    setActiveType(null);

    if (!over || active.id === over.id) return;

    // Use itemOrder for reordering (supports interleaved cards and tasks)
    const activeIndex = itemOrder.indexOf(active.id as ID);
    const overIndex = itemOrder.indexOf(over.id as ID);

    if (activeIndex >= 0 && overIndex >= 0) {
      reorderColumnItems(channelId, column.id, activeIndex, overIndex);
    }
  };

  const handleAddCard = () => {
    const card = createCard(channelId, column.id, { title: 'Untitled' });
    setNewCardId(card.id);
    setIsCardDrawerOpen(true);
  };

  const handleAddTask = () => {
    const task = createColumnTask(channelId, column.id, { title: 'Untitled' });
    setNewTaskId(task.id);
    setIsTaskDrawerOpen(true);
  };

  const handleCardDrawerClose = () => {
    setIsCardDrawerOpen(false);
    setNewCardId(null);
  };

  const handleTaskDrawerClose = () => {
    setIsTaskDrawerOpen(false);
    setNewTaskId(null);
  };

  const newCard = newCardId ? cards[newCardId] : null;
  const newTask = newTaskId ? tasks[newTaskId] : null;

  return (
    <div className="flex-1 flex flex-col overflow-hidden px-4 sm:px-6 py-3 sm:py-4">
      <div className="max-w-xl mx-auto w-full flex flex-col flex-1 min-h-0 rounded-lg bg-neutral-100 dark:bg-neutral-800/50">
        {/* Column header */}
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            {/* Exit focus button (collapse icon) */}
            <button
              onClick={onExitFocus}
              className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 flex-shrink-0"
              title="Exit focus mode"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
              </svg>
            </button>
            {isRenaming ? (
              <input
                ref={inputRef}
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={handleRenameSubmit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRenameSubmit();
                  if (e.key === 'Escape') { setRenameValue(column.name); setIsRenaming(false); }
                }}
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
            <span className="text-xs text-neutral-400">{showArchived ? backsideCount : itemOrder.length}</span>
            {backsideCount > 0 && (
              <button
                onClick={() => setShowArchived(!showArchived)}
                className={`rounded p-1 transition-colors ${
                  showArchived
                    ? 'text-amber-500 hover:bg-neutral-200 dark:hover:bg-neutral-700'
                    : 'text-neutral-400 hover:bg-neutral-200 hover:text-neutral-600 dark:hover:bg-neutral-700 dark:hover:text-neutral-300'
                }`}
                title={showArchived ? 'Show active items' : `${backsideCount} archived`}
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                </svg>
              </button>
            )}
            <ColumnMenu
              channelId={channelId}
              columnId={column.id}
              columnCount={1}
              cardCount={columnCards.length}
              columnCardIds={column.cardIds}
              completedTaskCount={completedTaskCount}
              onRename={() => setIsRenaming(true)}
              onOpenSettings={() => setIsDetailOpen(true)}
              onFocus={onExitFocus}
              onHideCompletedTasks={() => hideCompletedTasks(channelId, column.id)}
              hasInstructions={!!column.instructions}
              isFocused
            />
          </div>
        </div>

        {/* Content area - scrollable */}
        <div className="flex-1 overflow-y-auto space-y-2 px-2 pb-4">
          {showArchived ? (
            /* Archived cards + hidden tasks */
            <>
              {backsideCards.map((card) => (
                <BacksideCard key={card.id} card={card} />
              ))}
              {backsideTasks.map((task) => (
                <BacksideTask key={task.id} task={task} channelId={channelId} columnId={column.id} />
              ))}
              {backsideCount === 0 && (
                <p className="text-center text-sm text-neutral-400 py-8">No archived items</p>
              )}
            </>
          ) : (
            <>
              {/* Add card + task buttons */}
              <div className="flex gap-1.5">
                <button
                  onClick={handleAddCard}
                  className="flex-1 flex items-center justify-center py-2.5 rounded-md transition-colors bg-white dark:bg-neutral-900 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
                  title="Add card"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                </button>
                <button
                  onClick={handleAddTask}
                  className="flex items-center justify-center px-3 py-2.5 rounded-md transition-colors bg-white dark:bg-neutral-900 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
                  title="Add task"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <rect x="3" y="5" width="18" height="14" rx="2" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" />
                  </svg>
                </button>
              </div>

              {/* Cards and tasks interleaved with DnD */}
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={itemOrder}
                  strategy={verticalListSortingStrategy}
                >
                  {itemOrder.map((id) => {
                    const card = cards[id];
                    if (card) return <Card key={id} card={card} />;
                    const task = tasks[id];
                    if (task) return <ColumnTaskItem key={id} task={task} />;
                    return null;
                  })}
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
                  {activeTaskItem && (
                    <div className="w-72 cursor-grabbing rounded-md bg-white dark:bg-neutral-900 p-3 shadow-lg flex items-center gap-2">
                      <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${
                        activeTaskItem.status === 'done' ? 'bg-green-500 border-green-500' :
                        activeTaskItem.status === 'in_progress' ? 'border-blue-500 bg-blue-50' :
                        'border-neutral-300'
                      }`} />
                      <span className="text-sm truncate text-neutral-700 dark:text-neutral-200">
                        {activeTaskItem.title}
                      </span>
                    </div>
                  )}
                </DragOverlay>
              </DndContext>

              {/* Skeleton cards while AI is generating */}
              {skeletonCount > 0 &&
                Array.from({ length: skeletonCount }).map((_, i) => (
                  <SkeletonCard key={`skeleton-${i}`} className="h-20" />
                ))}

              {/* Empty state */}
              {itemOrder.length === 0 && skeletonCount === 0 && (
                <p className="text-center text-sm text-neutral-400 py-8">
                  No items in this column
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Card Detail Drawer for new cards */}
      <CardDetailDrawer
        card={newCard}
        isOpen={isCardDrawerOpen}
        onClose={handleCardDrawerClose}
        autoFocusTitle
      />

      {/* Task Drawer for new tasks */}
      <TaskDrawer
        task={newTask}
        isOpen={isTaskDrawerOpen}
        onClose={handleTaskDrawerClose}
        autoFocusTitle
      />

      {/* Column Detail Drawer */}
      <ColumnDetailDrawer
        column={column}
        channelId={channelId}
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
      />
    </div>
  );
}
