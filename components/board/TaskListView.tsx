'use client';

import { useState, useMemo } from 'react';
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
import type { Task, ID } from '@/lib/types';
import { useStore } from '@/lib/store';
import { SortableTaskRow } from './SortableTaskRow';
import { TaskCheckbox } from './TaskCheckbox';
import { TaskDrawer } from './TaskDrawer';
import { Button } from '@/components/ui';

interface TaskListViewProps {
  channelId: ID;
}

type FilterMode = 'all' | 'active' | 'completed';

interface TaskGroupProps {
  group: { cardId: ID | null; cardTitle: string; tasks: Task[] };
  groupByCard: boolean;
  onTaskClick: (task: Task) => void;
  onReorder: (cardId: ID | null, oldIndex: number, newIndex: number) => void;
  onAddTask: (cardId: ID) => void;
}

function TaskGroup({ group, groupByCard, onTaskClick, onReorder, onAddTask }: TaskGroupProps) {
  const toggleTaskStatus = useStore((s) => s.toggleTaskStatus);

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

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    const taskIds = group.tasks.map((t) => t.id);
    const oldIndex = taskIds.indexOf(activeId);
    const newIndex = taskIds.indexOf(overId);

    if (oldIndex !== -1 && newIndex !== -1) {
      onReorder(group.cardId, oldIndex, newIndex);
    }
  };

  const sortableIds = group.tasks.map((t) => t.id);
  const canDrag = groupByCard; // Can drag when grouped by card (both linked and unlinked)

  return (
    <div className="bg-white/80 dark:bg-neutral-900/50 rounded-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden backdrop-blur-sm">
      {/* Group header */}
      {groupByCard && (
        <div className="px-4 py-3 bg-neutral-50/80 dark:bg-neutral-800/30 border-b border-neutral-200 dark:border-neutral-800">
          <div className="flex items-center gap-2">
            {group.cardId ? (
              <>
                <svg className="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  {group.cardTitle}
                </span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                <span className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
                  {group.cardTitle}
                </span>
              </>
            )}
            <span className="text-xs text-neutral-400 ml-auto">
              {group.tasks.length} task{group.tasks.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      )}

      {/* Task list */}
      <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
        {canDrag ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={sortableIds}
              strategy={verticalListSortingStrategy}
            >
              {group.tasks.map((task) => (
                <div key={task.id} className="px-4 py-3 hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
                  <SortableTaskRow
                    task={task}
                    onToggle={() => toggleTaskStatus(task.id)}
                    onClick={() => onTaskClick(task)}
                    size="md"
                  />
                </div>
              ))}
            </SortableContext>
          </DndContext>
        ) : (
          // Non-draggable list for standalone tasks
          group.tasks.map((task) => (
            <div
              key={task.id}
              className="flex items-center gap-3 px-4 py-3 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 cursor-pointer group"
              onClick={() => onTaskClick(task)}
            >
              <div onClick={(e) => e.stopPropagation()}>
                <TaskCheckbox
                  status={task.status}
                  onToggle={() => toggleTaskStatus(task.id)}
                  size="md"
                />
              </div>
              <span
                className={`flex-1 text-sm ${
                  task.status === 'done'
                    ? 'text-neutral-400 line-through'
                    : 'text-neutral-800 dark:text-neutral-200'
                }`}
              >
                {task.title}
              </span>
              {task.status === 'in_progress' && (
                <span className="px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                  In Progress
                </span>
              )}
              <svg
                className="w-4 h-4 text-neutral-400 opacity-0 group-hover:opacity-100 transition-opacity"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          ))
        )}
      </div>

      {/* Add task button - only for card groups */}
      {group.cardId && (
        <button
          onClick={() => onAddTask(group.cardId!)}
          className="w-full px-4 py-2 text-sm text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors flex items-center gap-2 border-t border-neutral-100 dark:border-neutral-800"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add task
        </button>
      )}
    </div>
  );
}

export function TaskListView({ channelId }: TaskListViewProps) {
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [groupByCard, setGroupByCard] = useState(true);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isTaskDrawerOpen, setIsTaskDrawerOpen] = useState(false);
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [createForCardId, setCreateForCardId] = useState<ID | null>(null);

  const tasks = useStore((s) => s.tasks);
  const cards = useStore((s) => s.cards);
  const channels = useStore((s) => s.channels);
  const reorderTasks = useStore((s) => s.reorderTasks);
  const reorderUnlinkedTasks = useStore((s) => s.reorderUnlinkedTasks);

  // Get all tasks for this channel
  const channelTasks = useMemo(() => {
    return Object.values(tasks).filter((task) => task.channelId === channelId);
  }, [tasks, channelId]);

  // Apply filter
  const filteredTasks = useMemo(() => {
    switch (filterMode) {
      case 'active':
        return channelTasks.filter((t) => t.status !== 'done');
      case 'completed':
        return channelTasks.filter((t) => t.status === 'done');
      default:
        return channelTasks;
    }
  }, [channelTasks, filterMode]);

  // Group tasks by card
  const channel = channels[channelId];
  const groupedTasks = useMemo(() => {
    if (!groupByCard) {
      return [{ cardId: null, cardTitle: 'All Tasks', tasks: filteredTasks }];
    }

    const groups: Record<string, { cardId: ID | null; cardTitle: string; tasks: Task[] }> = {};

    // Unlinked group first
    groups['unlinked'] = { cardId: null, cardTitle: 'Unlinked Tasks', tasks: [] };

    for (const task of filteredTasks) {
      if (!task.cardId) {
        groups['unlinked'].tasks.push(task);
      } else {
        const card = cards[task.cardId];
        if (card) {
          if (!groups[task.cardId]) {
            groups[task.cardId] = { cardId: task.cardId, cardTitle: card.title, tasks: [] };
          }
          groups[task.cardId].tasks.push(task);
        } else {
          groups['unlinked'].tasks.push(task);
        }
      }
    }

    // Sort card-linked tasks by their position in card.taskIds
    for (const [groupKey, group] of Object.entries(groups)) {
      if (group.cardId) {
        const card = cards[group.cardId];
        if (card?.taskIds) {
          const orderMap = new Map(card.taskIds.map((id, idx) => [id, idx]));
          group.tasks.sort((a, b) => {
            const aIdx = orderMap.get(a.id) ?? Infinity;
            const bIdx = orderMap.get(b.id) ?? Infinity;
            return aIdx - bIdx;
          });
        }
      }
    }

    // Sort unlinked tasks by channel's unlinkedTaskOrder (or by createdAt as fallback)
    if (groups['unlinked'].tasks.length > 0) {
      if (channel?.unlinkedTaskOrder && channel.unlinkedTaskOrder.length > 0) {
        const orderMap = new Map(channel.unlinkedTaskOrder.map((id, idx) => [id, idx]));
        groups['unlinked'].tasks.sort((a, b) => {
          const aIdx = orderMap.get(a.id) ?? Infinity;
          const bIdx = orderMap.get(b.id) ?? Infinity;
          return aIdx - bIdx;
        });
      } else {
        // Sort by createdAt as fallback (same as store does when building order)
        groups['unlinked'].tasks.sort((a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
      }
    }

    // Convert to array and sort - unlinked first, then by card title
    return Object.values(groups)
      .filter((g) => g.tasks.length > 0)
      .sort((a, b) => {
        if (!a.cardId) return -1;
        if (!b.cardId) return 1;
        return a.cardTitle.localeCompare(b.cardTitle);
      });
  }, [filteredTasks, groupByCard, cards, channel?.unlinkedTaskOrder]);

  const handleTaskClick = (task: Task) => {
    setSelectedTask(task);
    setIsCreatingTask(false);
    setIsTaskDrawerOpen(true);
  };

  const handleAddTaskClick = () => {
    setSelectedTask(null);
    setIsCreatingTask(true);
    setCreateForCardId(null);
    setIsTaskDrawerOpen(true);
  };

  const handleAddTaskToCard = (cardId: ID) => {
    setSelectedTask(null);
    setIsCreatingTask(true);
    setCreateForCardId(cardId);
    setIsTaskDrawerOpen(true);
  };

  const handleCloseDrawer = () => {
    setIsTaskDrawerOpen(false);
    setSelectedTask(null);
    setIsCreatingTask(false);
    setCreateForCardId(null);
  };

  const handleReorder = (cardId: ID | null, oldIndex: number, newIndex: number) => {
    if (cardId) {
      reorderTasks(cardId, oldIndex, newIndex);
    } else {
      reorderUnlinkedTasks(channelId, oldIndex, newIndex);
    }
  };

  const activeCount = channelTasks.filter((t) => t.status !== 'done').length;
  const completedCount = channelTasks.filter((t) => t.status === 'done').length;

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
            Tasks
          </h2>
          <div className="flex items-center gap-4">
            {/* Filter buttons */}
            <div className="flex items-center gap-1 bg-neutral-100/80 dark:bg-neutral-800/50 rounded-lg p-1 backdrop-blur-sm">
              <button
                onClick={() => setFilterMode('all')}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  filterMode === 'all'
                    ? 'bg-white/90 dark:bg-neutral-700/70 text-neutral-900 dark:text-white shadow-sm'
                    : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                }`}
              >
                All ({channelTasks.length})
              </button>
              <button
                onClick={() => setFilterMode('active')}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  filterMode === 'active'
                    ? 'bg-white/90 dark:bg-neutral-700/70 text-neutral-900 dark:text-white shadow-sm'
                    : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                }`}
              >
                Active ({activeCount})
              </button>
              <button
                onClick={() => setFilterMode('completed')}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  filterMode === 'completed'
                    ? 'bg-white/90 dark:bg-neutral-700/70 text-neutral-900 dark:text-white shadow-sm'
                    : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                }`}
              >
                Done ({completedCount})
              </button>
            </div>

            {/* Group by card toggle */}
            <button
              onClick={() => setGroupByCard(!groupByCard)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border transition-colors ${
                groupByCard
                  ? 'border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-700 dark:bg-violet-950 dark:text-violet-400'
                  : 'border-neutral-300 dark:border-neutral-600 text-neutral-600 dark:text-neutral-400 hover:border-neutral-400'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              Group by card
            </button>
          </div>
        </div>

        {/* Task groups */}
        {groupedTasks.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-neutral-500 dark:text-neutral-400 mb-4">
              No tasks {filterMode !== 'all' ? `${filterMode}` : 'yet'}
            </p>
            <Button onClick={handleAddTaskClick}>
              Create a task
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            {groupedTasks.map((group) => (
              <TaskGroup
                key={group.cardId ?? 'unlinked'}
                group={group}
                groupByCard={groupByCard}
                onTaskClick={handleTaskClick}
                onReorder={handleReorder}
                onAddTask={handleAddTaskToCard}
              />
            ))}
          </div>
        )}

        {/* Add standalone task button */}
        <button
          onClick={handleAddTaskClick}
          className="mt-6 w-full p-4 text-sm text-neutral-500 dark:text-neutral-400 border-2 border-dashed border-neutral-200 dark:border-neutral-700 rounded-lg hover:border-neutral-300 dark:hover:border-neutral-600 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add standalone task
        </button>
      </div>

      <TaskDrawer
        task={isCreatingTask ? null : selectedTask}
        createForChannelId={isCreatingTask ? channelId : undefined}
        createForCardId={isCreatingTask ? createForCardId : undefined}
        isOpen={isTaskDrawerOpen}
        onClose={handleCloseDrawer}
      />
    </div>
  );
}
