'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Task, ChannelMember } from '@/lib/types';
import { TaskCheckbox } from './TaskCheckbox';
import { AssigneeAvatars } from './AssigneeAvatars';

interface SortableTaskRowProps {
  task: Task;
  onToggle: () => void;
  onClick?: () => void;
  size?: 'sm' | 'md';
  members?: ChannelMember[];
}

export function SortableTaskRow({
  task,
  onToggle,
  onClick,
  size = 'sm',
  members = [],
}: SortableTaskRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const textSize = size === 'sm' ? 'text-xs' : 'text-sm';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 group/task"
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="opacity-0 group-hover/task:opacity-100 p-0.5 text-neutral-400 hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-400 cursor-grab active:cursor-grabbing transition-opacity flex-shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <svg className="h-3 w-3" viewBox="0 0 10 16" fill="currentColor">
          <circle cx="2" cy="2" r="1.5" />
          <circle cx="8" cy="2" r="1.5" />
          <circle cx="2" cy="8" r="1.5" />
          <circle cx="8" cy="8" r="1.5" />
          <circle cx="2" cy="14" r="1.5" />
          <circle cx="8" cy="14" r="1.5" />
        </svg>
      </button>
      <TaskCheckbox
        status={task.status}
        onToggle={onToggle}
        size={size}
      />
      <span
        onClick={onClick}
        className={`${textSize} flex-1 truncate cursor-pointer hover:text-neutral-900 dark:hover:text-white ${
          task.status === 'done'
            ? 'text-neutral-400 line-through'
            : 'text-neutral-600 dark:text-neutral-400'
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
      {(task.assignedTo ?? []).length > 0 && members.length > 0 && (
        <AssigneeAvatars
          userIds={task.assignedTo!}
          members={members}
          size="sm"
        />
      )}
    </div>
  );
}
