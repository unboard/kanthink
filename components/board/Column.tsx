'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { Column as ColumnType, ID, Task } from '@/lib/types';
import { useStore } from '@/lib/store';
import { Card } from './Card';
import { BacksideCard } from './BacksideCard';
import { BacksideTask } from './BacksideTask';
import { ColumnMenu } from './ColumnMenu';
import { ColumnDetailDrawer } from './ColumnDetailDrawer';
import { SkeletonCard } from './SkeletonCard';
import { CardDetailDrawer } from './CardDetailDrawer';
import { ColumnTaskItem } from './ColumnTaskItem';
import { TaskDrawer } from './TaskDrawer';

interface ColumnProps {
  column: ColumnType;
  channelId: ID;
  columnCount: number;
  dragHandleProps?: Record<string, unknown>;
}

export function Column({ column, channelId, columnCount, dragHandleProps }: ColumnProps) {
  const router = useRouter();
  const cards = useStore((s) => s.cards);
  const tasks = useStore((s) => s.tasks);
  const updateColumn = useStore((s) => s.updateColumn);
  const createCard = useStore((s) => s.createCard);
  const createColumnTask = useStore((s) => s.createColumnTask);
  const hideCompletedTasks = useStore((s) => s.hideCompletedTasks);
  const skeletonCount = useStore((s) => s.generatingSkeletons[column.id] ?? 0);

  const columnCards = column.cardIds.map((id) => cards[id]).filter(Boolean);
  const backsideCards = (column.backsideCardIds ?? []).map((id) => cards[id]).filter(Boolean);
  const backsideTasks = (column.backsideTaskIds ?? []).map((id) => tasks[id]).filter(Boolean);
  const backsideCount = backsideCards.length + backsideTasks.length;
  const completedTaskCount = (column.taskIds ?? []).filter((id) => tasks[id]?.status === 'done').length;

  // Build interleaved item list from itemOrder
  const itemOrder = column.itemOrder ?? column.cardIds;
  const itemCount = itemOrder.length;

  const [isRenaming, setIsRenaming] = useState(false);
  const [isFlipped, setIsFlipped] = useState(false);
  const [renameValue, setRenameValue] = useState(column.name);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [newCardId, setNewCardId] = useState<ID | null>(null);
  const [isCardDrawerOpen, setIsCardDrawerOpen] = useState(false);
  const [newTaskId, setNewTaskId] = useState<ID | null>(null);
  const [isTaskDrawerOpen, setIsTaskDrawerOpen] = useState(false);
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

  // Get live card/task from store for drawers
  const newCard = newCardId ? cards[newCardId] : null;
  const newTask = newTaskId ? tasks[newTaskId] : null;

  // Header JSX for front side
  const frontHeader = (
    <div className="flex flex-col">
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
        <span className="text-xs text-neutral-400">{isFlipped ? backsideCount : itemCount}</span>
        <button
          onClick={() => router.push(`/channel/${channelId}?focus=${column.id}`)}
          className="rounded p-1 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-600 dark:hover:bg-neutral-700 dark:hover:text-neutral-300"
          title="Focus on column"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
        </button>
        <ColumnMenu
          channelId={channelId}
          columnId={column.id}
          columnCount={columnCount}
          cardCount={columnCards.length}
          columnCardIds={column.cardIds}
          completedTaskCount={completedTaskCount}
          onRename={() => setIsRenaming(true)}
          onOpenSettings={() => setIsDetailOpen(true)}
          onFocus={() => router.push(`/channel/${channelId}?focus=${column.id}`)}
          onHideCompletedTasks={() => hideCompletedTasks(channelId, column.id)}
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
          ? 'bg-neutral-100 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700'
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
          // Back side - show archived cards and hidden tasks
          <>
            {backsideCards.map((card) => (
              <BacksideCard key={card.id} card={card} />
            ))}
            {backsideTasks.map((task) => (
              <BacksideTask key={task.id} task={task} channelId={channelId} columnId={column.id} />
            ))}
          </>
        ) : (
          // Front side - show cards and tasks interleaved
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
            <SortableContext items={itemOrder} strategy={verticalListSortingStrategy}>
              {itemOrder.map((id) => {
                const card = cards[id];
                if (card) return <Card key={id} card={card} />;
                const task = tasks[id];
                if (task) return <ColumnTaskItem key={id} task={task} />;
                return null;
              })}
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

      {/* Back to active - pinned at bottom of archive view */}
      {isFlipped && (
        <button
          onClick={handleFlipColumn}
          className="flex items-center justify-center gap-1.5 mx-2 mb-2 px-2 py-2 rounded-md text-xs text-neutral-500 hover:text-neutral-700 hover:bg-neutral-200 dark:text-neutral-400 dark:hover:text-neutral-200 dark:hover:bg-neutral-700 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to active
        </button>
      )}

      {/* Archive entry button - only shown on front side */}
      {backsideCount > 0 && !isFlipped && (
        <button
          onClick={handleFlipColumn}
          className="absolute bottom-2 right-2 z-10 flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors text-neutral-400 hover:text-neutral-600 hover:bg-neutral-200 dark:hover:text-neutral-300 dark:hover:bg-neutral-700"
          title={`${backsideCount} archived`}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
          </svg>
          <span>{backsideCount}</span>
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

      {/* Task Drawer for new tasks */}
      <TaskDrawer
        task={newTask}
        isOpen={isTaskDrawerOpen}
        onClose={handleTaskDrawerClose}
        autoFocusTitle
      />
    </div>
  );
}
