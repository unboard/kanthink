'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  DragOverlay,
  useDroppable,
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
import { useSession } from 'next-auth/react';
import type { Task, TaskStatus, ID } from '@/lib/types';
import { useStore } from '@/lib/store';
import { useChannelMembers } from '@/lib/hooks/useChannelMembers';
import { SortableTaskRow } from './SortableTaskRow';
import { TaskCheckbox } from './TaskCheckbox';
import { TaskDrawer } from './TaskDrawer';
import { TaskFilterDrawer } from './TaskFilterDrawer';
import { AssigneeAvatars } from './AssigneeAvatars';

interface TaskListViewProps {
  channelId: ID;
  filterCardIds?: ID[];
}

type GroupByMode = 'card' | 'column' | 'status' | 'assignee';

const groupByLabels: Record<GroupByMode, string> = {
  card: 'Card',
  column: 'Column',
  status: 'Status',
  assignee: 'Assignee',
};

interface TaskGroupProps {
  group: { cardId: ID | null; cardTitle: string; tasks: Task[] };
  showGroupHeader: boolean;
  members: Array<{ id: string; name: string; email: string; image: string | null }>;
  onTaskClick: (task: Task) => void;
  onAddTask: (cardId: ID) => void;
  isDragActive?: boolean;
}

function TaskGroup({ group, showGroupHeader, members, onTaskClick, onAddTask, isDragActive }: TaskGroupProps) {
  const toggleTaskStatus = useStore((s) => s.toggleTaskStatus);

  const sortableIds = group.tasks.map((t) => t.id);
  const canDrag = showGroupHeader && !!group.cardId;

  // Make the group header a drop target for cross-group moves
  const droppableId = `group:${group.cardId ?? 'unlinked'}`;
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: droppableId });

  return (
    <div
      className={`bg-white/80 dark:bg-neutral-900/50 rounded-lg border overflow-hidden backdrop-blur-sm transition-colors ${
        isOver && isDragActive
          ? 'border-violet-400 dark:border-violet-600 ring-1 ring-violet-400/30'
          : 'border-neutral-200 dark:border-neutral-800'
      }`}
    >
      {/* Group header */}
      {showGroupHeader && (
        <div
          ref={setDropRef}
          className={`px-4 py-3 bg-neutral-50/80 dark:bg-neutral-800/30 border-b border-neutral-200 dark:border-neutral-800 transition-colors ${
            isOver && isDragActive ? 'bg-violet-50/80 dark:bg-violet-900/20' : ''
          }`}
        >
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
                  members={members}
                />
              </div>
            ))}
          </SortableContext>
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
              {task.dueDate && task.status !== 'done' && (
                <span className={`flex-shrink-0 text-xs ${
                  (() => {
                    const due = new Date(task.dueDate);
                    const today = new Date();
                    due.setHours(0, 0, 0, 0);
                    today.setHours(0, 0, 0, 0);
                    const diffDays = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                    if (diffDays < 0) return 'text-red-500 dark:text-red-400';
                    if (diffDays <= 2) return 'text-amber-500 dark:text-amber-400';
                    return 'text-neutral-400 dark:text-neutral-500';
                  })()
                }`}>
                  {new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              )}
              {(task.assignedTo ?? []).length > 0 && (
                <AssigneeAvatars
                  userIds={task.assignedTo!}
                  members={members}
                  size="sm"
                />
              )}
              {task.status === 'in_progress' && (
                <span className="px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                  In Progress
                </span>
              )}
              <svg
                className="w-4 h-4 text-neutral-400 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
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

export function TaskListView({ channelId, filterCardIds }: TaskListViewProps) {
  const [statusFilters, setStatusFilters] = useState<Set<TaskStatus>>(new Set());
  const [assigneeFilters, setAssigneeFilters] = useState<Set<string>>(new Set());
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
  const [groupBy, setGroupBy] = useState<GroupByMode>('card');
  const [isGroupByOpen, setIsGroupByOpen] = useState(false);
  const groupByRef = useRef<HTMLDivElement>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isTaskDrawerOpen, setIsTaskDrawerOpen] = useState(false);
  const [autoFocusTaskTitle, setAutoFocusTaskTitle] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  const { data: session } = useSession();
  const currentUserId = session?.user?.id as string | undefined;

  const tasks = useStore((s) => s.tasks);
  const cards = useStore((s) => s.cards);
  const channels = useStore((s) => s.channels);
  const createTask = useStore((s) => s.createTask);
  const reorderTasks = useStore((s) => s.reorderTasks);
  const reorderUnlinkedTasks = useStore((s) => s.reorderUnlinkedTasks);
  const moveTaskToCard = useStore((s) => s.moveTaskToCard);
  const { members } = useChannelMembers(channelId);

  // Sensors per CLAUDE.md: MouseSensor + TouchSensor (NOT PointerSensor)
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Close group-by dropdown on outside click
  useEffect(() => {
    if (!isGroupByOpen) return;
    const handler = (e: MouseEvent) => {
      if (groupByRef.current && !groupByRef.current.contains(e.target as Node)) {
        setIsGroupByOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isGroupByOpen]);

  const groupByCard = groupBy === 'card';

  // Get all tasks for this channel (optionally scoped to specific cards)
  const channelTasks = useMemo(() => {
    const all = Object.values(tasks).filter((task) => task.channelId === channelId);
    if (!filterCardIds) return all;
    const cardIdSet = new Set(filterCardIds);
    return all.filter((task) => task.cardId && cardIdSet.has(task.cardId));
  }, [tasks, channelId, filterCardIds]);

  // Apply filters (status + assignee are independent, empty Set = show all)
  const filteredTasks = useMemo(() => {
    let result = channelTasks;

    if (statusFilters.size > 0) {
      result = result.filter((t) => statusFilters.has(t.status));
    }

    if (assigneeFilters.size > 0) {
      result = result.filter((t) => (t.assignedTo ?? []).some((id) => assigneeFilters.has(id)));
    }

    return result;
  }, [channelTasks, statusFilters, assigneeFilters]);

  // Group tasks by card
  const channel = channels[channelId];
  // Build set of archived card IDs (cards on column backsides)
  const archivedCardIds = useMemo(() => {
    const ids = new Set<string>();
    if (channel) {
      for (const col of channel.columns) {
        for (const cid of col.backsideCardIds ?? []) {
          ids.add(cid);
        }
      }
    }
    return ids;
  }, [channel]);

  // Helper: find which column a card belongs to
  const cardToColumnMap = useMemo(() => {
    const map = new Map<string, string>();
    if (channel) {
      for (const col of channel.columns) {
        for (const cid of col.cardIds) {
          map.set(cid, col.id);
        }
      }
    }
    return map;
  }, [channel]);

  const statusLabelMap: Record<string, string> = {
    not_started: 'To Do',
    in_progress: 'In Progress',
    on_hold: 'On Hold',
    done: 'Done',
  };

  const groupedTasks = useMemo(() => {
    const nonArchivedTasks = filteredTasks.filter((t) => !t.cardId || !archivedCardIds.has(t.cardId));

    if (groupBy === 'column') {
      const groups: Record<string, { cardId: ID | null; cardTitle: string; tasks: Task[] }> = {};
      groups['no-column'] = { cardId: null, cardTitle: 'No Column', tasks: [] };

      for (const task of nonArchivedTasks) {
        let colId: string | undefined;
        if (task.cardId) {
          colId = cardToColumnMap.get(task.cardId);
        } else {
          colId = task.columnId ?? undefined;
        }

        if (colId && channel) {
          const col = channel.columns.find((c) => c.id === colId);
          if (!groups[colId]) {
            groups[colId] = { cardId: null, cardTitle: col?.name ?? 'Unknown Column', tasks: [] };
          }
          groups[colId].tasks.push(task);
        } else {
          groups['no-column'].tasks.push(task);
        }
      }

      // Sort groups by column order
      const colOrder = channel?.columns.map((c) => c.id) ?? [];
      return Object.entries(groups)
        .filter(([, g]) => g.tasks.length > 0)
        .sort(([keyA], [keyB]) => {
          if (keyA === 'no-column') return 1;
          if (keyB === 'no-column') return -1;
          return colOrder.indexOf(keyA) - colOrder.indexOf(keyB);
        })
        .map(([, g]) => g);
    }

    if (groupBy === 'status') {
      const statusOrder: string[] = ['not_started', 'in_progress', 'on_hold', 'done'];
      const groups: Record<string, { cardId: ID | null; cardTitle: string; tasks: Task[] }> = {};
      for (const s of statusOrder) {
        groups[s] = { cardId: null, cardTitle: statusLabelMap[s], tasks: [] };
      }
      for (const task of nonArchivedTasks) {
        groups[task.status]?.tasks.push(task);
      }
      return statusOrder
        .filter((s) => groups[s].tasks.length > 0)
        .map((s) => groups[s]);
    }

    if (groupBy === 'assignee') {
      const groups: Record<string, { cardId: ID | null; cardTitle: string; tasks: Task[] }> = {};
      groups['unassigned'] = { cardId: null, cardTitle: 'Unassigned', tasks: [] };

      for (const task of nonArchivedTasks) {
        const assignees = task.assignedTo ?? [];
        if (assignees.length === 0) {
          groups['unassigned'].tasks.push(task);
        } else {
          for (const userId of assignees) {
            if (!groups[userId]) {
              const member = members.find((m) => m.id === userId);
              groups[userId] = { cardId: null, cardTitle: member?.name ?? 'Unknown', tasks: [] };
            }
            groups[userId].tasks.push(task);
          }
        }
      }

      // Sort: named assignees alphabetically, unassigned last
      return Object.entries(groups)
        .filter(([, g]) => g.tasks.length > 0)
        .sort(([keyA, a], [keyB, b]) => {
          if (keyA === 'unassigned') return 1;
          if (keyB === 'unassigned') return -1;
          return a.cardTitle.localeCompare(b.cardTitle);
        })
        .map(([, g]) => g);
    }

    // groupBy === 'card' (default — existing logic)
    const groups: Record<string, { cardId: ID | null; cardTitle: string; tasks: Task[] }> = {};
    groups['unlinked'] = { cardId: null, cardTitle: 'Unlinked Tasks', tasks: [] };

    for (const task of filteredTasks) {
      if (task.cardId && archivedCardIds.has(task.cardId)) continue;

      if (!task.cardId) {
        if (task.columnId && channel) {
          const col = channel.columns.find((c) => c.id === task.columnId);
          const colKey = `column:${task.columnId}`;
          if (!groups[colKey]) {
            groups[colKey] = { cardId: null, cardTitle: col ? `Column: ${col.name}` : 'Column Tasks', tasks: [] };
          }
          groups[colKey].tasks.push(task);
        } else {
          groups['unlinked'].tasks.push(task);
        }
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
    for (const [, group] of Object.entries(groups)) {
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

    // Sort unlinked tasks by channel's unlinkedTaskOrder
    if (groups['unlinked'].tasks.length > 0) {
      if (channel?.unlinkedTaskOrder && channel.unlinkedTaskOrder.length > 0) {
        const orderMap = new Map(channel.unlinkedTaskOrder.map((id, idx) => [id, idx]));
        groups['unlinked'].tasks.sort((a, b) => {
          const aIdx = orderMap.get(a.id) ?? Infinity;
          const bIdx = orderMap.get(b.id) ?? Infinity;
          return aIdx - bIdx;
        });
      } else {
        groups['unlinked'].tasks.sort((a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
      }
    }

    // Include all non-archived cards, even with no tasks
    if (channel) {
      const cardIdsToShow = filterCardIds ?? Object.values(cards)
        .filter((c) => c.channelId === channelId)
        .map((c) => c.id);
      for (const cardId of cardIdsToShow) {
        if (archivedCardIds.has(cardId)) continue;
        if (!groups[cardId]) {
          const card = cards[cardId];
          if (card) {
            groups[cardId] = { cardId, cardTitle: card.title, tasks: [] };
          }
        }
      }
    }

    return Object.values(groups)
      .filter((g) => g.tasks.length > 0 || g.cardId !== null)
      .sort((a, b) => {
        // Unlinked tasks always first
        if (!a.cardId) return -1;
        if (!b.cardId) return 1;
        // Groups with tasks before empty groups
        const aHasTasks = a.tasks.length > 0 ? 0 : 1;
        const bHasTasks = b.tasks.length > 0 ? 0 : 1;
        if (aHasTasks !== bHasTasks) return aHasTasks - bHasTasks;
        // Then alphabetical within each tier
        return a.cardTitle.localeCompare(b.cardTitle);
      });
  }, [filteredTasks, groupBy, cards, channel?.unlinkedTaskOrder, channel, channelId, filterCardIds, archivedCardIds, cardToColumnMap, members]);

  // Build a lookup: taskId -> group's cardId
  const taskToGroupCard = useMemo(() => {
    const map = new Map<string, ID | null>();
    for (const group of groupedTasks) {
      for (const task of group.tasks) {
        map.set(task.id, group.cardId);
      }
    }
    return map;
  }, [groupedTasks]);

  const handleTaskClick = (task: Task) => {
    setSelectedTask(task);
    setAutoFocusTaskTitle(false);
    setIsTaskDrawerOpen(true);
  };

  const handleAddTaskClick = () => {
    const newTask = createTask(channelId, null, { title: 'Untitled', createdBy: session?.user?.id ?? undefined });
    setSelectedTask(newTask);
    setAutoFocusTaskTitle(true);
    setIsTaskDrawerOpen(true);
  };

  const handleAddTaskToCard = (cardId: ID) => {
    const newTask = createTask(channelId, cardId, { title: 'Untitled', createdBy: session?.user?.id ?? undefined });
    setSelectedTask(newTask);
    setAutoFocusTaskTitle(true);
    setIsTaskDrawerOpen(true);
  };

  const handleCloseDrawer = () => {
    setIsTaskDrawerOpen(false);
    setSelectedTask(null);
    setAutoFocusTaskTitle(false);
  };

  const handleReorder = (cardId: ID | null, oldIndex: number, newIndex: number) => {
    if (cardId) {
      reorderTasks(cardId, oldIndex, newIndex);
    } else {
      reorderUnlinkedTasks(channelId, oldIndex, newIndex);
    }
  };

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const activeTaskId = active.id as string;
    const overId = over.id as string;

    // Check if dropped on a group header (droppable id like "group:cardId" or "group:unlinked")
    if (overId.startsWith('group:')) {
      const targetCardId = overId === 'group:unlinked' ? null : overId.slice('group:'.length);
      const sourceCardId = taskToGroupCard.get(activeTaskId) ?? null;
      if (sourceCardId !== targetCardId) {
        moveTaskToCard(activeTaskId, targetCardId);
      }
      return;
    }

    // Dropped on another task — check if same group or different group
    const sourceCardId = taskToGroupCard.get(activeTaskId) ?? null;
    const targetCardId = taskToGroupCard.get(overId) ?? null;

    if (sourceCardId === targetCardId) {
      // Same group — reorder
      if (activeTaskId === overId) return;
      const group = groupedTasks.find((g) => g.cardId === sourceCardId);
      if (!group) return;
      const taskIds = group.tasks.map((t) => t.id);
      const oldIndex = taskIds.indexOf(activeTaskId);
      const newIndex = taskIds.indexOf(overId);
      if (oldIndex !== -1 && newIndex !== -1) {
        handleReorder(sourceCardId, oldIndex, newIndex);
      }
    } else {
      // Different group — move task to new card
      moveTaskToCard(activeTaskId, targetCardId);
    }
  }, [groupedTasks, taskToGroupCard, moveTaskToCard, handleReorder]);

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
  }, []);

  const activeTask = activeId ? tasks[activeId] : null;

  const notStartedCount = channelTasks.filter((t) => t.status === 'not_started').length;
  const inProgressCount = channelTasks.filter((t) => t.status === 'in_progress').length;
  const onHoldCount = channelTasks.filter((t) => t.status === 'on_hold').length;
  const completedCount = channelTasks.filter((t) => t.status === 'done').length;

  // Count active filter categories for badge (0, 1, or 2)
  const activeFilterCount = (statusFilters.size > 0 ? 1 : 0) + (assigneeFilters.size > 0 ? 1 : 0);
  const hasActiveFilters = activeFilterCount > 0;

  const statusCounts: Record<TaskStatus, number> = {
    not_started: notStartedCount,
    in_progress: inProgressCount,
    on_hold: onHoldCount,
    done: completedCount,
  };

  // Build assignee chip labels
  const assigneeChips = useMemo(() => {
    return Array.from(assigneeFilters).map((id) => {
      if (id === currentUserId) return { id, label: 'Me' };
      const member = members.find((m) => m.id === id);
      return { id, label: member?.name?.split(' ')[0] ?? 'Unknown' };
    });
  }, [assigneeFilters, currentUserId, members]);

  const removeStatusFilter = (status: TaskStatus) => {
    const next = new Set(statusFilters);
    next.delete(status);
    setStatusFilters(next);
  };

  const removeAssigneeFilter = (id: string) => {
    const next = new Set(assigneeFilters);
    next.delete(id);
    setAssigneeFilters(next);
  };

  const clearAllFilters = () => {
    setStatusFilters(new Set());
    setAssigneeFilters(new Set());
  };


  const groupContent = (
    <div className="space-y-6">
      {groupedTasks.map((group, idx) => (
        <TaskGroup
          key={group.cardId ?? `group-${idx}`}
          group={group}
          showGroupHeader={true}
          members={members}
          onTaskClick={handleTaskClick}
          onAddTask={handleAddTaskToCard}
          isDragActive={!!activeId}
        />
      ))}
    </div>
  );

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
            Tasks
          </h2>
          <div className="flex items-center gap-2">
            {/* Filter button */}
            <button
              onClick={() => setIsFilterDrawerOpen(true)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs sm:text-sm rounded-md border transition-colors ${
                hasActiveFilters
                  ? 'border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-700 dark:bg-violet-950 dark:text-violet-400'
                  : 'border-neutral-300 dark:border-neutral-600 text-neutral-600 dark:text-neutral-400 hover:border-neutral-400'
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              <span className="hidden sm:inline">Filter</span>
              {activeFilterCount > 0 && (
                <span className="ml-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-violet-600 text-white text-[10px] font-bold leading-none">
                  {activeFilterCount}
                </span>
              )}
            </button>

            {/* Group by dropdown */}
            <div className="relative" ref={groupByRef}>
              <button
                onClick={() => setIsGroupByOpen(!isGroupByOpen)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs sm:text-sm rounded-md border transition-colors border-neutral-300 dark:border-neutral-600 text-neutral-600 dark:text-neutral-400 hover:border-neutral-400"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                <span className="hidden sm:inline">Group by {groupByLabels[groupBy].toLowerCase()}</span>
                <svg className="w-3 h-3 ml-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {isGroupByOpen && (
                <div className="absolute right-0 top-full z-20 mt-1 w-40 rounded-md bg-white py-1 shadow-lg ring-1 ring-black/5 dark:bg-neutral-800 dark:ring-white/10">
                  {(['card', 'column', 'status', 'assignee'] as GroupByMode[]).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => { setGroupBy(mode); setIsGroupByOpen(false); }}
                      className={`block w-full px-3 py-1.5 text-left text-sm transition-colors ${
                        groupBy === mode
                          ? 'bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-400'
                          : 'text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-700'
                      }`}
                    >
                      {groupByLabels[mode]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Active filter chips */}
        {hasActiveFilters && (
          <div className="flex items-center gap-2 flex-wrap mb-4">
            <span className="text-xs text-neutral-500 dark:text-neutral-400">Filtered by:</span>
            {Array.from(statusFilters).map((status) => (
              <span
                key={status}
                className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
              >
                {statusLabelMap[status]}
                <button
                  onClick={() => removeStatusFilter(status)}
                  className="ml-0.5 hover:text-neutral-900 dark:hover:text-white"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </span>
            ))}
            {assigneeChips.map((chip) => (
              <span
                key={chip.id}
                className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400"
              >
                {chip.label}
                <button
                  onClick={() => removeAssigneeFilter(chip.id)}
                  className="ml-0.5 hover:text-violet-900 dark:hover:text-violet-200"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </span>
            ))}
            <button
              onClick={clearAllFilters}
              className="text-xs text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 transition-colors"
            >
              Clear all
            </button>
          </div>
        )}

        {/* Task progress bar */}
        {channelTasks.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center justify-between text-sm text-neutral-500 dark:text-neutral-400 mb-2">
              <span>{completedCount}/{channelTasks.length} tasks completed</span>
              <span>{Math.round((completedCount / channelTasks.length) * 100)}%</span>
            </div>
            <div className="h-2 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 dark:bg-green-600 rounded-full transition-all duration-300"
                style={{ width: `${(completedCount / channelTasks.length) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Task groups */}
        {groupedTasks.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              {hasActiveFilters
                ? 'No tasks match the current filters.'
                : 'No cards yet — add a card to the board to get started.'}
            </p>
          </div>
        ) : groupByCard ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            {groupContent}
            <DragOverlay>
              {activeTask ? (
                <div className="px-4 py-3 bg-white dark:bg-neutral-800 rounded-lg shadow-lg border border-neutral-200 dark:border-neutral-700 opacity-90">
                  <div className="flex items-center gap-2">
                    <TaskCheckbox status={activeTask.status} onToggle={() => {}} size="md" />
                    <span className={`text-sm ${
                      activeTask.status === 'done'
                        ? 'text-neutral-400 line-through'
                        : 'text-neutral-800 dark:text-neutral-200'
                    }`}>
                      {activeTask.title}
                    </span>
                  </div>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        ) : (
          groupContent
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
        task={selectedTask}
        autoFocusTitle={autoFocusTaskTitle}
        isOpen={isTaskDrawerOpen}
        onClose={handleCloseDrawer}
        onOpenCard={handleCloseDrawer}
      />

      <TaskFilterDrawer
        isOpen={isFilterDrawerOpen}
        onClose={() => setIsFilterDrawerOpen(false)}
        statusFilters={statusFilters}
        onStatusFiltersChange={setStatusFilters}
        statusCounts={statusCounts}
        assigneeFilters={assigneeFilters}
        onAssigneeFiltersChange={setAssigneeFilters}
        members={members}
        currentUserId={currentUserId}
      />
    </div>
  );
}
