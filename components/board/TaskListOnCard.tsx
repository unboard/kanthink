'use client';

import type { Task, ID } from '@/lib/types';
import { useStore } from '@/lib/store';
import { TaskCheckbox } from './TaskCheckbox';

interface TaskListOnCardProps {
  cardId: ID;
  channelId: ID;
  tasks: Task[];
  hideCompleted?: boolean;
  maxVisible?: number;
  onTaskClick?: (task: Task) => void;
  onAddTaskClick?: () => void;
}

export function TaskListOnCard({
  cardId,
  channelId,
  tasks,
  hideCompleted = false,
  maxVisible = 4,
  onTaskClick,
  onAddTaskClick,
}: TaskListOnCardProps) {
  const toggleTaskStatus = useStore((s) => s.toggleTaskStatus);

  // Filter and limit tasks for display
  const visibleTasks = hideCompleted
    ? tasks.filter((t) => t.status !== 'done')
    : tasks;

  const displayTasks = visibleTasks.slice(0, maxVisible);
  const hiddenCount = visibleTasks.length - displayTasks.length;

  if (tasks.length === 0) {
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          onAddTaskClick?.();
        }}
        className="mt-2 w-full py-1 px-1.5 -mx-1.5 flex items-center gap-1.5 text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors rounded hover:bg-neutral-100 dark:hover:bg-neutral-800"
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Add task
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-0.5 -mx-1.5" onClick={(e) => e.stopPropagation()}>
      {/* Task list */}
      {displayTasks.map((task) => (
        <div
          key={task.id}
          className="flex items-center gap-2 group/task px-1.5 py-1 rounded cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          onClick={() => onTaskClick?.(task)}
        >
          <TaskCheckbox
            status={task.status}
            onToggle={() => toggleTaskStatus(task.id)}
            size="sm"
          />
          <span
            className={`text-xs flex-1 truncate ${
              task.status === 'done'
                ? 'text-neutral-400 line-through'
                : 'text-neutral-600 dark:text-neutral-400 group-hover/task:text-neutral-900 dark:group-hover/task:text-white'
            }`}
          >
            {task.title}
          </span>
        </div>
      ))}

      {/* Hidden count indicator */}
      {hiddenCount > 0 && (
        <div className="text-xs text-neutral-400">
          +{hiddenCount} more task{hiddenCount > 1 ? 's' : ''}
        </div>
      )}

      {/* Add task button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onAddTaskClick?.();
        }}
        className="w-full py-1 px-1.5 flex items-center gap-1.5 text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors rounded hover:bg-neutral-100 dark:hover:bg-neutral-800"
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Add task
      </button>
    </div>
  );
}
