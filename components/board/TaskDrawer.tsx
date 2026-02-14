'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import type { Task, TaskStatus, TaskNote, CardMessage, CardMessageType } from '@/lib/types';
import { useStore } from '@/lib/store';
import { requireSignInForAI } from '@/lib/settingsStore';
import { useChannelMembers } from '@/lib/hooks/useChannelMembers';
import { ChatInput, useKeyboardOffset } from './ChatInput';
import { ChatMessage } from './ChatMessage';
import { Drawer } from '@/components/ui';
import { AssigneeAvatars } from './AssigneeAvatars';
import { AssigneePicker } from './AssigneePicker';

/** Convert a TaskNote into the CardMessage format so we can reuse ChatMessage */
function taskNoteToCardMessage(note: TaskNote): CardMessage {
  const isKan = note.authorId === 'kan' || note.authorName === 'Kan';
  return {
    id: note.id,
    type: isKan ? 'ai_response' : 'note',
    content: note.content,
    imageUrls: note.imageUrls,
    authorId: note.authorId,
    authorName: note.authorName,
    authorImage: isKan ? undefined : note.authorImage, // let ChatMessage use KanthinkIcon for Kan
    createdAt: note.createdAt,
  };
}

interface TaskDrawerProps {
  task?: Task | null;
  autoFocusTitle?: boolean;
  isOpen: boolean;
  onClose: () => void;
  onOpenCard?: () => void;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const statusLabels: Record<TaskStatus, string> = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  done: 'Done',
};

export function TaskDrawer({
  task,
  autoFocusTitle,
  isOpen,
  onClose,
  onOpenCard,
}: TaskDrawerProps) {
  const [title, setTitle] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isStatusOpen, setIsStatusOpen] = useState(false);
  const [showTitleDrawer, setShowTitleDrawer] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const titleDrawerInputRef = useRef<HTMLInputElement>(null);
  const notesEndRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);

  const [isAssigneePickerOpen, setIsAssigneePickerOpen] = useState(false);
  const [isMovingTask, setIsMovingTask] = useState(false);
  const [isAILoading, setIsAILoading] = useState(false);
  const [aiError, setAIError] = useState<string | null>(null);

  const { data: session } = useSession();
  const { keyboardOffset, onFocus: handleKeyboardFocus, onBlur: handleKeyboardBlur } = useKeyboardOffset();

  const updateTask = useStore((s) => s.updateTask);
  const deleteTask = useStore((s) => s.deleteTask);
  const toggleTaskAssignee = useStore((s) => s.toggleTaskAssignee);
  const promoteTaskToCard = useStore((s) => s.promoteTaskToCard);
  const moveTaskToCard = useStore((s) => s.moveTaskToCard);
  const addTaskNote = useStore((s) => s.addTaskNote);
  const editTaskNote = useStore((s) => s.editTaskNote);
  const deleteTaskNote = useStore((s) => s.deleteTaskNote);
  const cards = useStore((s) => s.cards);
  const channels = useStore((s) => s.channels);
  const tasks = useStore((s) => s.tasks);

  const channelId = task?.channelId;
  const { members } = useChannelMembers(channelId);

  const parentCard = task?.cardId ? cards[task.cardId] : null;

  // Reset state when drawer opens/closes or task changes
  useEffect(() => {
    if (isOpen && task) {
      setTitle(task.title);
      setIsDirty(false);
      setIsAssigneePickerOpen(false);
      setIsMovingTask(false);
      setIsMenuOpen(false);
      setIsStatusOpen(false);
      setShowTitleDrawer(false);
      setIsAILoading(false);
      setAIError(null);
    }
  }, [isOpen, task]);

  // Show title drawer when opening with autoFocusTitle
  useEffect(() => {
    if (isOpen && autoFocusTitle) {
      setShowTitleDrawer(true);
      setTimeout(() => {
        titleDrawerInputRef.current?.focus();
        titleDrawerInputRef.current?.select();
      }, 150);
    }
  }, [isOpen, autoFocusTitle]);

  // Click-outside handler for 3-dot menu
  useEffect(() => {
    if (!isMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMenuOpen]);

  // Click-outside handler for status dropdown
  useEffect(() => {
    if (!isStatusOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (statusRef.current && !statusRef.current.contains(e.target as Node)) {
        setIsStatusOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isStatusOpen]);

  const handleSave = () => {
    if (task && isDirty && title.trim()) {
      updateTask(task.id, { title: title.trim() });
      setIsDirty(false);
    }
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
    if (!task) return;
    updateTask(task.id, {
      status: newStatus,
      completedAt: newStatus === 'done' ? new Date().toISOString() : undefined,
    });
  };

  const handleAddNote = useCallback(async (content: string, type: CardMessageType, imageUrls?: string[]) => {
    if (!task) return;
    const author = session?.user
      ? { id: session.user.id!, name: session.user.name ?? 'Unknown', image: session.user.image ?? undefined }
      : undefined;

    // If it's a question, check auth first
    if (type === 'question' && !requireSignInForAI()) {
      return;
    }

    // Add the user's note
    addTaskNote(task.id, content, author, imageUrls);
    setTimeout(() => notesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);

    // If it's a question, send to AI
    if (type === 'question') {
      setIsAILoading(true);
      setAIError(null);

      try {
        const channel = channels[task.channelId];
        const parentCard = task.cardId ? cards[task.cardId] : null;

        // Read latest notes from store (not stale prop) so the AI sees full conversation
        const liveNotes = useStore.getState().tasks[task.id]?.notes ?? [];

        const response = await fetch('/api/task-chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            taskId: task.id,
            questionContent: content,
            imageUrls,
            context: {
              taskTitle: task.title,
              taskStatus: task.status,
              parentCardTitle: parentCard?.title,
              channelName: channel?.name ?? '',
              channelDescription: channel?.description ?? '',
              previousNotes: liveNotes.slice(-10),
            },
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || 'Failed to get AI response');
        }

        const data = await response.json();

        // Add AI response as a note from "Kan"
        addTaskNote(task.id, data.response, {
          id: 'kan',
          name: 'Kan',
          image: 'https://res.cloudinary.com/dcht3dytz/image/upload/v1769532115/kanthink-icon_pbne7q.svg',
        });
        setTimeout(() => notesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      } catch (error) {
        setAIError(error instanceof Error ? error.message : 'Failed to get AI response');
      } finally {
        setIsAILoading(false);
      }
    }
  }, [task, session, addTaskNote, channels, cards]);

  const handleTitleDrawerSave = () => {
    if (task && title.trim()) {
      updateTask(task.id, { title: title.trim() });
    }
    setShowTitleDrawer(false);
  };

  // Don't render if not open or no task
  if (!isOpen || !task) return null;

  // Read fresh task from store to get updated data
  const freshTask = task.id ? tasks[task.id] : null;
  const currentStatus = freshTask?.status ?? task.status;
  const currentNotes = freshTask?.notes ?? task.notes ?? [];
  const currentAssignees = freshTask?.assignedTo ?? task.assignedTo ?? [];

  // Status dropdown colors
  const statusColors: Record<TaskStatus, string> = {
    not_started: 'bg-neutral-200 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-300',
    in_progress: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    done: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  };

  return (
    <Drawer isOpen={isOpen} onClose={handleClose} width="lg" floating hideCloseButton>
      <div className="flex flex-col h-[100dvh] sm:h-full sm:max-h-[calc(100vh-2rem)]">
        {/* Row 1: Breadcrumb title + Close + 3-dot menu */}
        <div className="flex-shrink-0 sticky top-0 z-10 bg-white dark:bg-neutral-900 flex items-center gap-2 px-4 py-3 border-b border-neutral-100 dark:border-neutral-800">
          <div className="flex-1 flex items-center gap-1 min-w-0">
            {parentCard && (
              <>
                <button
                  onClick={onOpenCard}
                  className="flex-shrink-0 text-sm text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 hover:underline truncate max-w-[140px]"
                >
                  {parentCard.title}
                </button>
                <span className="flex-shrink-0 text-neutral-300 dark:text-neutral-600 text-sm">/</span>
              </>
            )}
            <input
              ref={titleInputRef}
              type="text"
              value={title}
              onChange={(e) => { setTitle(e.target.value); setIsDirty(true); }}
              onBlur={handleSave}
              className={`flex-1 min-w-0 font-medium bg-transparent border-none outline-none placeholder-neutral-400 truncate ${
                currentStatus === 'done'
                  ? 'text-neutral-400 line-through'
                  : 'text-neutral-900 dark:text-white'
              }`}
              placeholder="Task title"
            />
          </div>

          {/* 3-dot menu */}
          <div className="relative flex-shrink-0" ref={menuRef}>
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="w-8 h-8 flex items-center justify-center text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
              </svg>
            </button>
            {isMenuOpen && (
              <div className="absolute right-0 top-full z-20 mt-1 w-44 rounded-md bg-white py-1 shadow-lg ring-1 ring-black/5 dark:bg-neutral-800 dark:ring-white/10">
                <button
                  onClick={() => {
                    promoteTaskToCard(task.id);
                    setIsMenuOpen(false);
                    onClose();
                  }}
                  className="block w-full px-3 py-1.5 text-left text-sm text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-700"
                >
                  Promote to card
                </button>
                <button
                  onClick={() => {
                    setIsMovingTask(true);
                    setIsMenuOpen(false);
                  }}
                  className="block w-full px-3 py-1.5 text-left text-sm text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-700"
                >
                  Move to card
                </button>
                <hr className="my-1 border-neutral-200 dark:border-neutral-700" />
                <button
                  onClick={() => {
                    setIsMenuOpen(false);
                    handleDelete();
                  }}
                  className="block w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
                >
                  Delete
                </button>
              </div>
            )}
          </div>

          {/* Close button */}
          <button
            onClick={handleClose}
            className="flex-shrink-0 w-8 h-8 flex items-center justify-center text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Row 2: Status dropdown + Assignees + Trash */}
        <div className="flex-shrink-0 px-4 py-2 border-b border-neutral-100 dark:border-neutral-800 flex items-center gap-3">
          {/* Status dropdown */}
          <div className="relative" ref={statusRef}>
            <button
              onClick={() => setIsStatusOpen(!isStatusOpen)}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors ${statusColors[currentStatus]}`}
            >
              {statusLabels[currentStatus]}
              <svg className="w-3 h-3 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {isStatusOpen && (
              <div className="absolute left-0 top-full z-20 mt-1 w-36 rounded-md bg-white py-1 shadow-lg ring-1 ring-black/5 dark:bg-neutral-800 dark:ring-white/10">
                {(['not_started', 'in_progress', 'done'] as TaskStatus[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      handleStatusChange(s);
                      setIsStatusOpen(false);
                    }}
                    className={`block w-full px-3 py-1.5 text-left text-sm transition-colors ${
                      currentStatus === s
                        ? 'bg-neutral-100 dark:bg-neutral-700 font-medium text-neutral-900 dark:text-white'
                        : 'text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-700'
                    }`}
                  >
                    {statusLabels[s]}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="w-px h-5 bg-neutral-200 dark:bg-neutral-700" />

          {/* Assignees */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {currentAssignees.map((userId) => {
              const member = members.find((m) => m.id === userId);
              const name = member?.name || 'Unknown';
              return (
                <span
                  key={userId}
                  className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full text-xs font-medium bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300"
                >
                  {name}
                  <button
                    onClick={() => toggleTaskAssignee(task.id, userId)}
                    className="w-4 h-4 flex items-center justify-center rounded-full hover:bg-violet-200 dark:hover:bg-violet-800 transition-colors"
                    title={`Remove ${name}`}
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              );
            })}
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

          {/* Spacer */}
          <div className="flex-1" />

          {/* Delete text button */}
          <button
            onClick={handleDelete}
            className="px-2 py-1 text-xs text-neutral-400 hover:text-red-500 dark:hover:text-red-400 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            Delete
          </button>
        </div>

        {/* Row 3: Dates */}
        <div className="flex-shrink-0 px-4 py-1.5 text-xs text-neutral-400">
          Created{task.createdBy ? (() => {
            const creator = members.find((m) => m.id === task.createdBy);
            return creator ? ` by ${creator.name}` : '';
          })() : ''} {formatDate(task.createdAt)}
          {(freshTask?.completedAt ?? task.completedAt) && (
            <> &middot; Completed: {formatDate((freshTask?.completedAt ?? task.completedAt)!)}</>
          )}
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

        {/* Card picker for moving task */}
        {isMovingTask && task && (() => {
          const channel = channels[task.channelId];
          const channelCards = channel
            ? channel.columns.flatMap((col) =>
                (col.cardIds ?? []).map((cid) => cards[cid]).filter(Boolean)
              )
            : [];
          return (
            <div className="flex-shrink-0 px-4 py-2 border-b border-neutral-100 dark:border-neutral-800">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Move to card</span>
                <button
                  onClick={() => setIsMovingTask(false)}
                  className="text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
                >
                  Cancel
                </button>
              </div>
              <div className="max-h-48 overflow-y-auto space-y-0.5">
                <button
                  onClick={() => {
                    moveTaskToCard(task.id, null);
                    setIsMovingTask(false);
                  }}
                  disabled={!task.cardId}
                  className={`block w-full px-3 py-2 text-left text-sm rounded-md transition-colors ${
                    !task.cardId
                      ? 'bg-violet-50 dark:bg-violet-950 text-violet-700 dark:text-violet-400 cursor-default'
                      : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                  }`}
                >
                  Standalone (no card)
                </button>
                {channelCards.map((card) => (
                  <button
                    key={card.id}
                    onClick={() => {
                      moveTaskToCard(task.id, card.id);
                      setIsMovingTask(false);
                    }}
                    disabled={task.cardId === card.id}
                    className={`block w-full px-3 py-2 text-left text-sm rounded-md transition-colors truncate ${
                      task.cardId === card.id
                        ? 'bg-violet-50 dark:bg-violet-950 text-violet-700 dark:text-violet-400 cursor-default'
                        : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                    }`}
                  >
                    {card.title}
                  </button>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Scrollable thread body */}
        <div className="relative flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-3">
            {/* Notes thread — reuses ChatMessage from card detail */}
            {currentNotes.length > 0 ? (
              <div className="space-y-3">
                {currentNotes.map((note) => {
                  const msg = taskNoteToCardMessage(note);
                  const isOwn = note.authorId === session?.user?.id;
                  return (
                    <ChatMessage
                      key={note.id}
                      message={msg}
                      onDelete={() => deleteTaskNote(task.id, note.id)}
                      onEdit={isOwn ? (content) => editTaskNote(task.id, note.id, content) : undefined}
                    />
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-neutral-400">
                <svg className="w-8 h-8 mb-2 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <span className="text-sm">No notes yet</span>
              </div>
            )}

            {/* AI Loading indicator */}
            {isAILoading && (
              <div className="pl-3 relative">
                <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-violet-400 dark:bg-violet-500 rounded-full" />
                <div className="rounded-lg px-3 py-2 bg-violet-50 dark:bg-violet-950/30">
                  <div className="flex items-center gap-2 text-sm text-violet-600 dark:text-violet-400">
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Kan is thinking...
                  </div>
                </div>
              </div>
            )}

            {/* AI Error */}
            {aiError && (
              <div className="rounded-lg px-3 py-2 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
                <div className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <div className="text-sm text-red-700 dark:text-red-300">{aiError}</div>
                    <button
                      onClick={() => setAIError(null)}
                      className="text-xs text-red-600 dark:text-red-400 underline mt-1"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div ref={notesEndRef} />
          </div>

          {/* Fixed bottom input with gradient fade */}
          <div
            className="absolute left-0 right-0 bottom-0 bg-gradient-to-t from-white from-70% dark:from-neutral-900 to-transparent pt-8 transition-[bottom] duration-100"
            style={{ bottom: keyboardOffset > 0 ? `${Math.max(0, keyboardOffset - 60)}px` : 0 }}
          >
            <ChatInput
              onSubmit={(content, type, imageUrls) => handleAddNote(content, type, imageUrls)}
              isLoading={isAILoading}
              cardId={task.id}
              members={members}
              onKeyboardFocus={handleKeyboardFocus}
              onKeyboardBlur={handleKeyboardBlur}
            />
          </div>
        </div>
      </div>

      {/* Mini title drawer — appears when creating a new task */}
      {showTitleDrawer && (
        <div className="absolute inset-0 z-20 overflow-hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/20 dark:bg-black/40"
            onClick={handleTitleDrawerSave}
          />
          {/* Mini drawer */}
          <div
            className="absolute inset-x-0 bg-white dark:bg-neutral-900 rounded-t-2xl transition-[bottom] duration-100"
            style={{
              bottom: keyboardOffset > 0 ? `${keyboardOffset}px` : 0,
              minHeight: '160px',
              maxHeight: '50%',
            }}
          >
            <div className="flex flex-col h-full p-4">
              {/* Handle bar */}
              <div className="flex justify-center mb-3">
                <div className="w-10 h-1 rounded-full bg-neutral-300 dark:bg-neutral-600" />
              </div>

              {/* Title input */}
              <div className="flex-1 flex flex-col">
                <label className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-2">
                  Name this task
                </label>
                <input
                  ref={titleDrawerInputRef}
                  type="text"
                  value={title}
                  onChange={(e) => { setTitle(e.target.value); setIsDirty(true); }}
                  onFocus={handleKeyboardFocus}
                  onBlur={handleKeyboardBlur}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleTitleDrawerSave();
                    }
                  }}
                  className="w-full px-3 py-2.5 text-base text-neutral-900 dark:text-white bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent placeholder-neutral-400"
                  placeholder="Task name"
                />
              </div>

              {/* Done button */}
              <button
                onClick={handleTitleDrawerSave}
                className="mt-3 w-full py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </Drawer>
  );
}
