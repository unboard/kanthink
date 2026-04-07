'use client';

import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Task, Card } from '@/lib/types';
import { useStore } from '@/lib/store';
import { useChannelMembers } from '@/lib/hooks/useChannelMembers';
import { TaskCheckbox } from './TaskCheckbox';
import { AssigneeAvatars } from './AssigneeAvatars';
import { TaskDrawer } from './TaskDrawer';
import { CardDetailDrawer } from './CardDetailDrawer';

interface ColumnTaskItemProps {
  task: Task;
}

export function ColumnTaskItem({ task }: ColumnTaskItemProps) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [promotedCard, setPromotedCard] = useState<Card | null>(null);
  const toggleTaskStatus = useStore((s) => s.toggleTaskStatus);
  const { members } = useChannelMembers(task.channelId);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    data: { type: 'column-task', taskId: task.id },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const isDone = task.status === 'done';

  return (
    <>
      {/* Same mobile touch pattern as Card.tsx — DO NOT use PointerSensor */}
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        className={`
          group/task flex items-center gap-2 p-3 rounded-md cursor-grab select-none
          ${isDragging ? 'touch-none' : 'touch-manipulation'}
          bg-white dark:bg-neutral-900 shadow-sm hover:shadow-md
          ${isDragging ? 'opacity-50 shadow-lg' : ''}
          transition-shadow
        `}
      >
        <TaskCheckbox
          status={task.status}
          onToggle={() => toggleTaskStatus(task.id)}
          size="sm"
        />
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsDrawerOpen(true);
          }}
          className={`
            flex-1 text-left text-xs truncate
            ${isDone ? 'line-through text-neutral-400' : 'text-neutral-600 dark:text-neutral-400 group-hover/task:text-neutral-900 dark:group-hover/task:text-white'}
          `}
        >
          {task.title}
        </button>
        {(task.assignedTo ?? []).length > 0 && (
          <AssigneeAvatars
            userIds={task.assignedTo!}
            members={members}
            size="sm"
          />
        )}
        {task.dueDate && (
          <span className={`text-xs flex-shrink-0 ${
            new Date(task.dueDate) < new Date() && !isDone
              ? 'text-red-500'
              : 'text-neutral-400 dark:text-neutral-500'
          }`}>
            {new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        )}
      </div>

      <TaskDrawer
        task={task}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onPromotedToCard={(card) => {
          setIsDrawerOpen(false);
          setPromotedCard(card);
        }}
      />

      {promotedCard && (
        <CardDetailDrawer
          card={promotedCard}
          isOpen={true}
          onClose={() => setPromotedCard(null)}
        />
      )}
    </>
  );
}
