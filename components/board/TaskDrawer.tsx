'use client';

import { useState, useEffect, useRef } from 'react';
import type { Task, TaskStatus, ID } from '@/lib/types';
import { useStore } from '@/lib/store';
import { Drawer, Button, Textarea } from '@/components/ui';
import { TaskCheckbox } from './TaskCheckbox';

interface TaskDrawerProps {
  // For editing an existing task
  task?: Task | null;
  // For creating a new task
  createForChannelId?: ID;
  createForCardId?: ID | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenCard?: () => void;
  onTaskCreated?: (task: Task) => void;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const statusLabels: Record<TaskStatus, string> = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  done: 'Done',
};

export function TaskDrawer({
  task,
  createForChannelId,
  createForCardId,
  isOpen,
  onClose,
  onOpenCard,
  onTaskCreated,
}: TaskDrawerProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TaskStatus>('not_started');
  const [isDirty, setIsDirty] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const updateTask = useStore((s) => s.updateTask);
  const deleteTask = useStore((s) => s.deleteTask);
  const toggleTaskStatus = useStore((s) => s.toggleTaskStatus);
  const createTask = useStore((s) => s.createTask);
  const cards = useStore((s) => s.cards);
  const tasks = useStore((s) => s.tasks);

  const isCreateMode = !task && createForChannelId;
  const parentCard = task?.cardId ? cards[task.cardId] : createForCardId ? cards[createForCardId] : null;

  // Reset state when drawer opens/closes or task changes
  useEffect(() => {
    if (isOpen) {
      if (task) {
        setTitle(task.title);
        setDescription(task.description);
        setStatus(task.status);
        setIsDirty(false);
      } else if (isCreateMode) {
        setTitle('');
        setDescription('');
        setStatus('not_started');
        setIsDirty(false);
        // Focus title input in create mode
        setTimeout(() => titleInputRef.current?.focus(), 100);
      }
    }
  }, [isOpen, task, isCreateMode]);

  const handleSave = () => {
    if (task && isDirty && title.trim()) {
      updateTask(task.id, {
        title: title.trim(),
        description: description,
      });
      setIsDirty(false);
    }
  };

  const handleCreate = () => {
    if (!isCreateMode || !createForChannelId || !title.trim()) return;

    const newTask = createTask(createForChannelId, createForCardId ?? null, {
      title: title.trim(),
      description: description,
    });

    // Get the created task from the store
    const createdTask = Object.values(tasks).find(
      (t) => t.title === title.trim() && t.channelId === createForChannelId
    );

    if (createdTask && onTaskCreated) {
      onTaskCreated(createdTask);
    }

    onClose();
  };

  const handleClose = () => {
    if (task && isDirty && title.trim()) {
      handleSave();
    }
    onClose();
  };

  const handleDelete = () => {
    if (!task) return;
    if (confirm('Delete this task?')) {
      deleteTask(task.id);
      onClose();
    }
  };

  const handleStatusChange = (newStatus: TaskStatus) => {
    if (!task) {
      setStatus(newStatus);
      return;
    }
    updateTask(task.id, {
      status: newStatus,
      completedAt: newStatus === 'done' ? new Date().toISOString() : undefined,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && isCreateMode) {
      e.preventDefault();
      handleCreate();
    }
  };

  // Don't render if not open or if neither task nor create mode
  if (!isOpen || (!task && !isCreateMode)) return null;

  // Read fresh task from store to get updated status after changes
  const freshTask = task?.id ? tasks[task.id] : null;
  const currentStatus = freshTask?.status ?? task?.status ?? status;

  return (
    <Drawer isOpen={isOpen} onClose={handleClose} width="md" floating>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div>
          <input
            ref={titleInputRef}
            type="text"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setIsDirty(true);
            }}
            onBlur={task ? handleSave : undefined}
            onKeyDown={handleKeyDown}
            className={`w-full text-xl font-semibold bg-transparent border-none outline-none focus:ring-0 pt-6 ${
              currentStatus === 'done'
                ? 'text-neutral-400 line-through'
                : 'text-neutral-900 dark:text-white'
            }`}
            placeholder={isCreateMode ? 'New task title...' : 'Task title'}
            autoFocus={!!isCreateMode}
          />
        </div>

        {/* Status selector - only show for existing tasks */}
        {task && (
          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
              Status
            </label>
            <div className="flex gap-2">
              {(['not_started', 'in_progress', 'done'] as TaskStatus[]).map((s) => (
                <button
                  key={s}
                  onClick={() => handleStatusChange(s)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    currentStatus === s
                      ? s === 'done'
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : s === 'in_progress'
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                        : 'bg-neutral-200 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-300'
                      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700'
                  }`}
                >
                  {statusLabels[s]}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
            Description
          </label>
          <Textarea
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              setIsDirty(true);
            }}
            onBlur={task ? handleSave : undefined}
            placeholder="Add details about this task..."
            rows={4}
          />
        </div>

        {/* Parent card link */}
        {parentCard && (
          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
              Card
            </label>
            <button
              onClick={onOpenCard}
              className="flex items-center gap-2 px-3 py-2 rounded-md bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 transition-colors w-full text-left"
            >
              <svg className="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="text-sm text-neutral-700 dark:text-neutral-300 truncate">
                {parentCard.title}
              </span>
              <svg className="w-4 h-4 text-neutral-400 ml-auto flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        )}

        {/* Metadata - only for existing tasks */}
        {task && (
          <div className="text-xs text-neutral-500 space-y-1">
            <div>Created: {formatDate(task.createdAt)}</div>
            {task.completedAt && (
              <div>Completed: {formatDate(task.completedAt)}</div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-between pt-4">
          {task ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDelete}
                className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
              >
                Delete task
              </Button>
              <Button variant="ghost" size="sm" onClick={handleClose}>
                Done
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleCreate} disabled={!title.trim()}>
                Create task
              </Button>
            </>
          )}
        </div>
      </div>
    </Drawer>
  );
}
