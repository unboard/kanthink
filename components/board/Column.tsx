'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
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
import { WidgetPicker } from './WidgetPicker';

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
  const updateCard = useStore((s) => s.updateCard);
  const updateTask = useStore((s) => s.updateTask);
  const skeletonCount = useStore((s) => s.generatingSkeletons[column.id] ?? 0);

  const columnCards = column.cardIds.map((id) => cards[id]).filter(Boolean);
  const backsideCards = (column.backsideCardIds ?? []).map((id) => cards[id]).filter(Boolean);
  const backsideTasks = (column.backsideTaskIds ?? []).map((id) => tasks[id]).filter(Boolean);
  const backsideCount = backsideCards.length + backsideTasks.length;
  const completedTaskCount = (column.taskIds ?? []).filter((id) => tasks[id]?.status === 'done').length;

  // Build interleaved item list from itemOrder, filtering out snoozed items and sorting pinned first
  const now = new Date();
  const allItemOrder = column.itemOrder ?? column.cardIds;
  const filteredOrder = allItemOrder.filter((id) => {
    const card = cards[id];
    if (card?.snoozedUntil && new Date(card.snoozedUntil) > now) return false;
    const task = tasks[id];
    if (task?.snoozedUntil && new Date(task.snoozedUntil) > now) return false;
    return true;
  });
  // Sort pinned cards to top (most recently pinned first), then unpinned in original order
  const itemOrder = [...filteredOrder].sort((a, b) => {
    const cardA = cards[a];
    const cardB = cards[b];
    const pinnedA = cardA?.pinnedAt ? new Date(cardA.pinnedAt).getTime() : 0;
    const pinnedB = cardB?.pinnedAt ? new Date(cardB.pinnedAt).getTime() : 0;
    if (pinnedA && !pinnedB) return -1;
    if (!pinnedA && pinnedB) return 1;
    if (pinnedA && pinnedB) return pinnedB - pinnedA; // Most recent pin first
    return 0; // Preserve original order for unpinned
  });
  const snoozedCount = allItemOrder.length - filteredOrder.length;
  const itemCount = itemOrder.length;

  const [isRenaming, setIsRenaming] = useState(false);
  const [isFlipped, setIsFlipped] = useState(false);
  const [showSnoozed, setShowSnoozed] = useState(false);
  const [renameValue, setRenameValue] = useState(column.name);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [newCardId, setNewCardId] = useState<ID | null>(null);
  const [isCardDrawerOpen, setIsCardDrawerOpen] = useState(false);
  const [newTaskId, setNewTaskId] = useState<ID | null>(null);
  const [isTaskDrawerOpen, setIsTaskDrawerOpen] = useState(false);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [showWidgetPicker, setShowWidgetPicker] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const addMenuRef = useRef<HTMLDivElement>(null);

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

  // Close add menu on click outside
  useEffect(() => {
    if (!isAddMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setIsAddMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isAddMenuOpen]);

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
            {/* Add to column dropdown */}
            <div className="relative" ref={addMenuRef}>
              <button
                onClick={() => setIsAddMenuOpen(!isAddMenuOpen)}
                className="w-full flex items-center justify-center py-2.5 rounded-md transition-colors bg-white dark:bg-neutral-900 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
              </button>
              {isAddMenuOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 z-30 bg-white dark:bg-neutral-800 rounded-lg shadow-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden">
                  <button
                    onClick={() => { setIsAddMenuOpen(false); handleAddCard(); }}
                    className="w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-neutral-50 dark:hover:bg-neutral-700/50 transition-colors"
                  >
                    <svg className="w-4 h-4 mt-0.5 flex-shrink-0 text-neutral-500 dark:text-neutral-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6M12 9v6" />
                    </svg>
                    <div>
                      <div className="text-sm font-medium text-neutral-700 dark:text-neutral-200">Card</div>
                      <div className="text-xs text-neutral-400 dark:text-neutral-500">Holds tasks, threads, and details</div>
                    </div>
                  </button>
                  <button
                    onClick={() => { setIsAddMenuOpen(false); handleAddTask(); }}
                    className="w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-neutral-50 dark:hover:bg-neutral-700/50 transition-colors"
                  >
                    <svg className="w-4 h-4 mt-0.5 flex-shrink-0 text-neutral-500 dark:text-neutral-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <rect x="3" y="5" width="18" height="14" rx="2" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" />
                    </svg>
                    <div>
                      <div className="text-sm font-medium text-neutral-700 dark:text-neutral-200">Task</div>
                      <div className="text-xs text-neutral-400 dark:text-neutral-500">A single to-do item</div>
                    </div>
                  </button>
                  <button
                    onClick={() => { setIsAddMenuOpen(false); setShowWidgetPicker(true); }}
                    className="w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-neutral-50 dark:hover:bg-neutral-700/50 transition-colors"
                  >
                    <svg className="w-4 h-4 mt-0.5 flex-shrink-0 text-neutral-500 dark:text-neutral-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <rect x="3" y="3" width="7" height="7" rx="1" />
                      <rect x="14" y="3" width="7" height="7" rx="1" />
                      <rect x="3" y="14" width="7" height="7" rx="1" />
                      <rect x="14" y="14" width="7" height="7" rx="1" />
                    </svg>
                    <div>
                      <div className="text-sm font-medium text-neutral-700 dark:text-neutral-200">Widgets</div>
                      <div className="text-xs text-neutral-400 dark:text-neutral-500">Calendar, poll, and more</div>
                    </div>
                  </button>
                </div>
              )}
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

      {/* Snoozed count indicator */}
      {snoozedCount > 0 && !isFlipped && (
        <button
          onClick={() => setShowSnoozed(!showSnoozed)}
          className="absolute bottom-2 left-2 z-10 flex items-center gap-1 px-2 py-1 rounded-md text-xs text-blue-400 dark:text-blue-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
          title={`${snoozedCount} snoozed — click to view`}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{snoozedCount}</span>
        </button>
      )}

      {/* Snoozed items overlay */}
      {showSnoozed && snoozedCount > 0 && (
        <div className="absolute bottom-10 left-2 right-2 z-20 bg-white dark:bg-neutral-800 rounded-lg shadow-lg border border-neutral-200 dark:border-neutral-700 max-h-60 overflow-y-auto">
          <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-200 dark:border-neutral-700">
            <span className="text-xs font-medium text-neutral-500">Snoozed ({snoozedCount})</span>
            <button onClick={() => setShowSnoozed(false)} className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          {allItemOrder.filter((id) => {
            const card = cards[id];
            if (card?.snoozedUntil && new Date(card.snoozedUntil) > now) return true;
            const task = tasks[id];
            if (task?.snoozedUntil && new Date(task.snoozedUntil) > now) return true;
            return false;
          }).map((id) => {
            const card = cards[id];
            const task = tasks[id];
            const item = card || task;
            if (!item) return null;
            const snoozedUntil = card?.snoozedUntil || task?.snoozedUntil;
            return (
              <div key={id} className="px-3 py-2 border-b border-neutral-100 dark:border-neutral-700/50 last:border-b-0">
                <div className="text-xs font-medium text-neutral-700 dark:text-neutral-300 truncate">
                  {card?.title || task?.title}
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[10px] text-blue-400">
                    Until {snoozedUntil ? new Date(snoozedUntil).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                  </span>
                  <button
                    onClick={() => {
                      if (card) updateCard(card.id, { snoozedUntil: '' });
                      if (task) updateTask(task.id, { snoozedUntil: '' });
                    }}
                    className="text-[10px] text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
                  >
                    Unsnooze
                  </button>
                </div>
              </div>
            );
          })}
        </div>
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

      {/* Widget Picker */}
      <WidgetPicker
        isOpen={showWidgetPicker}
        onClose={() => setShowWidgetPicker(false)}
        onCreateWidget={(cardType, title, typeData) => {
          const card = createCard(channelId, column.id, { title });
          // Update the card with widget type data
          updateCard(card.id, { cardType, typeData });
          setNewCardId(card.id);
        }}
      />
    </div>
  );
}
