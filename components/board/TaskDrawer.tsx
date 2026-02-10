'use client';

import { useState, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import type { Task, TaskStatus, ID } from '@/lib/types';
import { useStore } from '@/lib/store';
import { useChannelMembers } from '@/lib/hooks/useChannelMembers';
import { useKeyboardOffset } from './ChatInput';
import { Drawer, Button, Textarea } from '@/components/ui';
import { AssigneeAvatars } from './AssigneeAvatars';
import { AssigneePicker } from './AssigneePicker';
import { TaskNoteInput } from './TaskNoteInput';
import { TaskNoteMessage } from './TaskNoteMessage';

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
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const notesEndRef = useRef<HTMLDivElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  const [isAssigneePickerOpen, setIsAssigneePickerOpen] = useState(false);

  const { data: session } = useSession();
  const { keyboardOffset } = useKeyboardOffset();

  const updateTask = useStore((s) => s.updateTask);
  const deleteTask = useStore((s) => s.deleteTask);
  const createTask = useStore((s) => s.createTask);
  const toggleTaskAssignee = useStore((s) => s.toggleTaskAssignee);
  const promoteTaskToCard = useStore((s) => s.promoteTaskToCard);
  const addTaskNote = useStore((s) => s.addTaskNote);
  const editTaskNote = useStore((s) => s.editTaskNote);
  const deleteTaskNote = useStore((s) => s.deleteTaskNote);
  const cards = useStore((s) => s.cards);
  const tasks = useStore((s) => s.tasks);

  const channelId = task?.channelId ?? createForChannelId;
  const { members } = useChannelMembers(channelId);

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
        setIsEditingDescription(false);
        setIsAssigneePickerOpen(false);
      } else if (isCreateMode) {
        setTitle('');
        setDescription('');
        setStatus('not_started');
        setIsDirty(false);
        setIsEditingDescription(false);
        setIsAssigneePickerOpen(false);
        setTimeout(() => titleInputRef.current?.focus(), 100);
      }
    }
  }, [isOpen, task, isCreateMode]);

  // Auto-resize description textarea
  useEffect(() => {
    if (isEditingDescription && descriptionRef.current) {
      const ta = descriptionRef.current;
      ta.focus();
      ta.selectionStart = ta.value.length;
      ta.style.height = 'auto';
      ta.style.height = `${ta.scrollHeight}px`;
    }
  }, [isEditingDescription]);

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

    createTask(createForChannelId, createForCardId ?? null, {
      title: title.trim(),
      description: description,
    });

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
    if (isEditingDescription) {
      setIsEditingDescription(false);
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

  const handleDescriptionSave = () => {
    if (task && title.trim()) {
      updateTask(task.id, { description });
    }
    setIsEditingDescription(false);
    setIsDirty(false);
  };

  const handleAddNote = (content: string) => {
    if (!task) return;
    const author = session?.user
      ? { id: session.user.id!, name: session.user.name ?? 'Unknown', image: session.user.image ?? undefined }
      : undefined;
    addTaskNote(task.id, content, author);
    // Scroll to bottom after adding
    setTimeout(() => notesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  // Don't render if not open or if neither task nor create mode
  if (!isOpen || (!task && !isCreateMode)) return null;

  // Read fresh task from store to get updated data
  const freshTask = task?.id ? tasks[task.id] : null;
  const currentStatus = freshTask?.status ?? task?.status ?? status;
  const currentNotes = freshTask?.notes ?? task?.notes ?? [];
  const currentAssignees = freshTask?.assignedTo ?? task?.assignedTo ?? [];

  // ===== Create mode: simplified form =====
  if (isCreateMode) {
    return (
      <Drawer isOpen={isOpen} onClose={onClose} width="md" floating>
        <div className="p-6 space-y-6">
          <div>
            <input
              ref={titleInputRef}
              type="text"
              value={title}
              onChange={(e) => { setTitle(e.target.value); setIsDirty(true); }}
              onKeyDown={handleKeyDown}
              className="w-full text-xl font-semibold bg-transparent border-none outline-none focus:ring-0 pt-6 text-neutral-900 dark:text-white"
              placeholder="New task title..."
              autoFocus
            />
          </div>
          <div>
            <Textarea
              value={description}
              onChange={(e) => { setDescription(e.target.value); setIsDirty(true); }}
              placeholder="Add details about this task..."
              rows={4}
            />
          </div>
          <div className="flex justify-between pt-4">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleCreate} disabled={!title.trim()}>
              Create task
            </Button>
          </div>
        </div>
      </Drawer>
    );
  }

  // ===== Existing task: conversation layout =====
  return (
    <Drawer isOpen={isOpen} onClose={handleClose} width="lg" floating hideCloseButton>
      <div className="flex flex-col h-[100dvh] sm:h-full sm:max-h-[calc(100vh-2rem)]">
        {/* Sticky header */}
        <div className="flex-shrink-0 sticky top-0 z-10 bg-white dark:bg-neutral-900 flex items-center gap-3 px-4 py-3 border-b border-neutral-100 dark:border-neutral-800">
          <input
            ref={titleInputRef}
            type="text"
            value={title}
            onChange={(e) => { setTitle(e.target.value); setIsDirty(true); }}
            onBlur={handleSave}
            className={`flex-1 font-medium bg-transparent border-none outline-none placeholder-neutral-400 truncate ${
              currentStatus === 'done'
                ? 'text-neutral-400 line-through'
                : 'text-neutral-900 dark:text-white'
            }`}
            placeholder="Task title"
          />
          <button
            onClick={handleClose}
            className="flex-shrink-0 w-8 h-8 flex items-center justify-center text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Compact metadata strip */}
        <div className="flex-shrink-0 px-4 py-2.5 border-b border-neutral-100 dark:border-neutral-800 flex items-center gap-3 flex-wrap">
          {/* Status pills */}
          <div className="flex gap-1.5">
            {(['not_started', 'in_progress', 'done'] as TaskStatus[]).map((s) => (
              <button
                key={s}
                onClick={() => handleStatusChange(s)}
                className={`px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                  currentStatus === s
                    ? s === 'done'
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                      : s === 'in_progress'
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                      : 'bg-neutral-200 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-300'
                    : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700'
                }`}
              >
                {statusLabels[s]}
              </button>
            ))}
          </div>

          {/* Divider */}
          <div className="w-px h-5 bg-neutral-200 dark:bg-neutral-700" />

          {/* Assignees */}
          <div className="flex items-center gap-1.5">
            {currentAssignees.length > 0 && (
              <AssigneeAvatars
                userIds={currentAssignees}
                members={members}
                size="sm"
                onClick={() => setIsAssigneePickerOpen(!isAssigneePickerOpen)}
              />
            )}
            <button
              onClick={() => setIsAssigneePickerOpen(!isAssigneePickerOpen)}
              className="inline-flex items-center gap-1 px-1.5 py-1 rounded-md text-xs text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              {currentAssignees.length === 0 && 'Assign'}
            </button>
          </div>
        </div>

        {/* Assignee picker dropdown */}
        {isAssigneePickerOpen && task && (
          <div className="flex-shrink-0 px-4 py-2 border-b border-neutral-100 dark:border-neutral-800">
            <AssigneePicker
              channelId={task.channelId}
              selectedUserIds={currentAssignees}
              onToggleUser={(userId) => toggleTaskAssignee(task.id, userId)}
              onClose={() => setIsAssigneePickerOpen(false)}
            />
          </div>
        )}

        {/* Scrollable content area */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-4 py-4 space-y-4">
            {/* Description — click to edit */}
            {(description || isEditingDescription) ? (
              <div className="relative">
                {isEditingDescription ? (
                  <div>
                    <textarea
                      ref={descriptionRef}
                      value={description}
                      onChange={(e) => {
                        setDescription(e.target.value);
                        setIsDirty(true);
                        e.target.style.height = 'auto';
                        e.target.style.height = `${e.target.scrollHeight}px`;
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          setDescription(freshTask?.description ?? task?.description ?? '');
                          setIsEditingDescription(false);
                        }
                      }}
                      className="w-full resize-none rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                      placeholder="Add a description..."
                      rows={3}
                    />
                    <div className="flex items-center gap-2 mt-2">
                      <button
                        onClick={handleDescriptionSave}
                        className="px-2.5 py-1 text-xs rounded-md bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:bg-neutral-700 dark:hover:bg-neutral-200 transition-colors"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => {
                          setDescription(freshTask?.description ?? task?.description ?? '');
                          setIsEditingDescription(false);
                        }}
                        className="px-2.5 py-1 text-xs rounded-md text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setIsEditingDescription(true)}
                    className="group w-full text-left rounded-lg px-3 py-2.5 bg-neutral-50 dark:bg-neutral-800/50 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                  >
                    <p className="text-sm text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap break-words">
                      {description}
                    </p>
                    <span className="mt-1.5 inline-flex items-center gap-1 text-xs text-neutral-400 opacity-0 group-hover:opacity-100 transition-opacity">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                      Edit
                    </span>
                  </button>
                )}
              </div>
            ) : (
              <button
                onClick={() => setIsEditingDescription(true)}
                className="w-full text-left rounded-lg px-3 py-2.5 border border-dashed border-neutral-200 dark:border-neutral-700 text-sm text-neutral-400 hover:border-neutral-300 dark:hover:border-neutral-600 hover:text-neutral-500 transition-colors"
              >
                Add a description...
              </button>
            )}

            {/* Notes thread */}
            {currentNotes.length > 0 ? (
              <div className="space-y-3">
                {currentNotes.map((note) => (
                  <TaskNoteMessage
                    key={note.id}
                    note={note}
                    isOwnNote={note.authorId === session?.user?.id}
                    onEdit={(noteId, content) => editTaskNote(task!.id, noteId, content)}
                    onDelete={(noteId) => deleteTaskNote(task!.id, noteId)}
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-neutral-400">
                <svg className="w-8 h-8 mb-2 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <span className="text-sm">No notes yet</span>
              </div>
            )}

            {/* Footer: parent card, actions, metadata */}
            <div className="pt-4 border-t border-neutral-100 dark:border-neutral-800 space-y-3">
              {/* Parent card link */}
              {parentCard && (
                <button
                  onClick={onOpenCard}
                  className="flex items-center gap-2 px-3 py-2 rounded-md bg-neutral-50 hover:bg-neutral-100 dark:bg-neutral-800/50 dark:hover:bg-neutral-800 transition-colors w-full text-left"
                >
                  <svg className="w-4 h-4 text-neutral-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="text-xs text-neutral-500 dark:text-neutral-400">Parent card:</span>
                  <span className="text-sm text-neutral-700 dark:text-neutral-300 truncate">
                    {parentCard.title}
                  </span>
                  <svg className="w-4 h-4 text-neutral-400 ml-auto flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              )}

              {/* Action buttons */}
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDelete}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                >
                  Delete
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    promoteTaskToCard(task!.id);
                    onClose();
                  }}
                  className="text-violet-600 hover:text-violet-700 hover:bg-violet-50 dark:text-violet-400 dark:hover:bg-violet-900/20"
                >
                  Promote to card
                </Button>
              </div>

              {/* Metadata */}
              <div className="text-xs text-neutral-400 space-y-0.5">
                <div>Created: {formatDate(task!.createdAt)}</div>
                {(freshTask?.completedAt ?? task?.completedAt) && (
                  <div>Completed: {formatDate((freshTask?.completedAt ?? task?.completedAt)!)}</div>
                )}
              </div>
            </div>

            {/* Extra padding to clear fixed input */}
            <div className="pb-20" />
            <div ref={notesEndRef} />
          </div>
        </div>

        {/* Fixed bottom input with gradient fade */}
        <div
          className="flex-shrink-0 absolute left-0 right-0 bottom-0 bg-gradient-to-t from-white from-70% dark:from-neutral-900 to-transparent pt-8 transition-[bottom] duration-100"
          style={{ bottom: keyboardOffset > 0 ? `${Math.max(0, keyboardOffset - 60)}px` : 0 }}
        >
          <TaskNoteInput
            onSubmit={handleAddNote}
          />
        </div>
      </div>
    </Drawer>
  );
}
