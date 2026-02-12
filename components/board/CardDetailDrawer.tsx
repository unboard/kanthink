'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useSession } from 'next-auth/react';
import type { Card, Task, ID } from '@/lib/types';
import { useStore, type PromoteConfig } from '@/lib/store';
import { useImageUpload } from '@/lib/hooks/useImageUpload';
import { Drawer } from '@/components/ui';
import { TaskCheckbox } from './TaskCheckbox';
import { TaskDrawer } from './TaskDrawer';
import { CardChat } from './CardChat';
import { TagPicker, getTagStyles } from './TagPicker';
import { AssigneeAvatars } from './AssigneeAvatars';
import { AssigneePicker } from './AssigneePicker';
import { useChannelMembers } from '@/lib/hooks/useChannelMembers';
import { useKeyboardOffset } from './ChatInput';

interface SortableTaskItemProps {
  task: Task;
  onTaskClick: (task: Task) => void;
  onToggleStatus: () => void;
}

function SortableTaskItem({ task, onTaskClick, onToggleStatus }: SortableTaskItemProps) {
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
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 p-2 rounded-md hover:bg-neutral-50 dark:hover:bg-neutral-800 group ${
        isDragging ? 'opacity-50 shadow-md bg-white dark:bg-neutral-900' : ''
      }`}
    >
      <button
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        className="cursor-grab touch-none text-neutral-300 hover:text-neutral-500 dark:text-neutral-600 dark:hover:text-neutral-400"
      >
        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
          <path d="M7 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
        </svg>
      </button>
      <div onClick={(e) => e.stopPropagation()}>
        <TaskCheckbox
          status={task.status}
          onToggle={onToggleStatus}
          size="sm"
        />
      </div>
      <button
        onClick={() => onTaskClick(task)}
        className={`text-sm flex-1 text-left ${
          task.status === 'done'
            ? 'text-neutral-400 line-through'
            : 'text-neutral-700 dark:text-neutral-300'
        }`}
      >
        {task.title}
      </button>
    </div>
  );
}

interface CardDetailDrawerProps {
  card: Card | null;
  isOpen: boolean;
  onClose: () => void;
  autoFocusTitle?: boolean;
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

type ActiveTab = 'thread' | 'tasks' | 'info';

export function CardDetailDrawer({ card, isOpen, onClose, autoFocusTitle }: CardDetailDrawerProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const [title, setTitle] = useState('');
  const [isTitleDirty, setIsTitleDirty] = useState(false);
  const [isPromoting, setIsPromoting] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isTaskDrawerOpen, setIsTaskDrawerOpen] = useState(false);
  const [autoFocusTaskTitle, setAutoFocusTaskTitle] = useState(false);
  const [isTagPickerOpen, setIsTagPickerOpen] = useState(false);
  const [isAssigneePickerOpen, setIsAssigneePickerOpen] = useState(false);
  const [isInstructionHistoryOpen, setIsInstructionHistoryOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('thread');
  const [showTitleDrawer, setShowTitleDrawer] = useState(false);
  const titleDrawerInputRef = useRef<HTMLInputElement>(null);

  // Track keyboard height for mobile title drawer positioning
  const { keyboardOffset, onFocus: handleKeyboardFocus, onBlur: handleKeyboardBlur } = useKeyboardOffset();

  const updateCard = useStore((s) => s.updateCard);
  const deleteCard = useStore((s) => s.deleteCard);
  const archiveCard = useStore((s) => s.archiveCard);
  const promoteCardToChannel = useStore((s) => s.promoteCardToChannel);
  const channels = useStore((s) => s.channels);
  const tasks = useStore((s) => s.tasks);
  const toggleTaskStatus = useStore((s) => s.toggleTaskStatus);
  const reorderTasks = useStore((s) => s.reorderTasks);
  const setCardTasksHidden = useStore((s) => s.setCardTasksHidden);
  const addTagDefinition = useStore((s) => s.addTagDefinition);
  const updateTagDefinition = useStore((s) => s.updateTagDefinition);
  const removeTagDefinition = useStore((s) => s.removeTagDefinition);
  const addTagToCard = useStore((s) => s.addTagToCard);
  const removeTagFromCard = useStore((s) => s.removeTagFromCard);
  const toggleCardAssignee = useStore((s) => s.toggleCardAssignee);
  const instructionCards = useStore((s) => s.instructionCards);
  const clearInstructionRun = useStore((s) => s.clearInstructionRun);
  const instructionRuns = useStore((s) => s.instructionRuns);
  const undoInstructionRun = useStore((s) => s.undoInstructionRun);
  const setCoverImage = useStore((s) => s.setCoverImage);
  const createTask = useStore((s) => s.createTask);
  const { members } = useChannelMembers(card?.channelId);

  const [activeDragTaskId, setActiveDragTaskId] = useState<ID | null>(null);
  const [isCoverUploading, setIsCoverUploading] = useState(false);
  const coverFileInputRef = useRef<HTMLInputElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const { uploadFile: uploadCoverFile } = useImageUpload({ cardId: card?.id });

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleTaskDragStart = (event: DragStartEvent) => {
    setActiveDragTaskId(event.active.id as ID);
  };

  const handleTaskDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragTaskId(null);

    if (!over || !card) return;

    const activeId = active.id as ID;
    const overId = over.id as ID;

    if (activeId !== overId) {
      const taskIds = card.taskIds ?? [];
      const oldIndex = taskIds.indexOf(activeId);
      const newIndex = taskIds.indexOf(overId);

      if (oldIndex !== -1 && newIndex !== -1) {
        reorderTasks(card.id, oldIndex, newIndex);
      }
    }
  };

  const activeDragTask = activeDragTaskId ? tasks[activeDragTaskId] : null;

  // Reset state when switching cards or when the drawer opens (re-sync from store)
  const cardId = card?.id;
  useEffect(() => {
    if (card && isOpen) {
      setTitle(card.title);
      setIsTitleDirty(false);
      setSelectedTask(null);
      setIsTaskDrawerOpen(false);
      setAutoFocusTaskTitle(false);
      setIsTagPickerOpen(false);
      setIsInstructionHistoryOpen(false);
      setActiveTab('thread');
      setShowTitleDrawer(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardId, isOpen]);

  // Show title drawer when opening with autoFocusTitle (first time viewing new card)
  useEffect(() => {
    if (isOpen && autoFocusTitle) {
      setShowTitleDrawer(true);
      // Focus the title drawer input after animation
      const timer = setTimeout(() => {
        titleDrawerInputRef.current?.focus();
        titleDrawerInputRef.current?.select();
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [isOpen, autoFocusTitle]);

  // Auto-save title when it changes (debounced)
  useEffect(() => {
    if (!card || !isTitleDirty || !title.trim()) return;

    const timer = setTimeout(() => {
      updateCard(card.id, { title: title.trim() });
    }, 300);

    return () => clearTimeout(timer);
  }, [title, card, isTitleDirty, updateCard]);

  const handleTitleChange = (newTitle: string) => {
    setTitle(newTitle);
    setIsTitleDirty(true);
  };



  const handleArchive = () => {
    if (!card) return;
    // Save any pending title changes before archiving
    if (isTitleDirty && title.trim()) {
      updateCard(card.id, { title: title.trim() });
    }
    archiveCard(card.id);
    onClose();
  };

  const handleDelete = () => {
    if (!card) return;
    if (confirm('Delete this card?')) {
      deleteCard(card.id);
      onClose();
    }
  };

  const handleClose = () => {
    // Auto-save title on close if changed
    if (isTitleDirty && card && title.trim()) {
      updateCard(card.id, { title: title.trim() });
    }
    onClose();
  };

  const handleCreateChannel = async () => {
    if (!card || isPromoting) return;

    // Save any pending title changes first
    if (isTitleDirty && title.trim()) {
      updateCard(card.id, { title: title.trim() });
    }

    setIsPromoting(true);

    // Get plain text from messages for AI context
    const messagesText = (card.messages ?? []).map((m) => m.content).join('\n');

    try {
      // Try to get AI-generated channel structure
      let config: PromoteConfig | undefined;

      try {
        const response = await fetch('/api/promote-card', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cardTitle: title || card.title,
            cardContent: messagesText,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          if (data.result) {
            config = data.result;
          }
        }
      } catch (error) {
        console.error('Failed to get AI channel structure:', error);
        // Continue with defaults
      }

      const newChannel = promoteCardToChannel(card.id, config);
      if (newChannel) {
        onClose();
        router.push(`/channel/${newChannel.id}`);
      }
    } finally {
      setIsPromoting(false);
    }
  };

  const handleTaskClick = (task: Task) => {
    setSelectedTask(task);
    setAutoFocusTaskTitle(false);
    setIsTaskDrawerOpen(true);
  };

  const handleAddTaskClick = () => {
    const newTask = createTask(card!.channelId, card!.id, { title: 'Untitled', createdBy: session?.user?.id ?? undefined });
    setSelectedTask(newTask);
    setAutoFocusTaskTitle(true);
    setIsTaskDrawerOpen(true);
  };

  if (!card) return null;

  // Get tasks for this card
  const cardTasks = (card.taskIds ?? [])
    .map((id) => tasks[id])
    .filter(Boolean) as Task[];
  const visibleTasks = card.hideCompletedTasks
    ? cardTasks.filter((t) => t.status !== 'done')
    : cardTasks;
  const completedCount = cardTasks.filter((t) => t.status === 'done').length;

  // Get spawned channels for this card
  const spawnedChannels = (card.spawnedChannelIds ?? [])
    .map((id) => channels[id])
    .filter(Boolean);

  return (
    <Drawer isOpen={isOpen} onClose={handleClose} width="lg" floating hideCloseButton>
      <div className="flex flex-col h-[100dvh] sm:h-full sm:max-h-[calc(100vh-2rem)]">
        {/* Compact Header - sticky on mobile */}
        <div className="flex-shrink-0 sticky top-0 z-10 bg-white dark:bg-neutral-900 flex items-center gap-3 px-4 py-3">
          <input
            ref={titleInputRef}
            type="text"
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            className="flex-1 font-medium text-neutral-900 dark:text-white bg-transparent border-none outline-none placeholder-neutral-400 truncate"
            placeholder="Card title"
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

        {/* Hidden file input for cover image */}
        <input
          ref={coverFileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file || !card) return;
            setIsCoverUploading(true);
            try {
              const result = await uploadCoverFile(file);
              setCoverImage(card.id, result.url);
            } catch (err) {
              console.error('Cover upload failed:', err);
            } finally {
              setIsCoverUploading(false);
            }
            if (coverFileInputRef.current) coverFileInputRef.current.value = '';
          }}
        />

        {/* Content Area */}
        <div className="flex-1 overflow-hidden flex flex-col">

          {/* Thread Tab */}
          {activeTab === 'thread' && (
            <div className="flex-1 min-h-0 flex flex-col">
              <CardChat
                card={card}
                channelName={channels[card.channelId]?.name ?? 'Unknown Channel'}
                channelDescription={channels[card.channelId]?.description ?? ''}
                tagDefinitions={channels[card.channelId]?.tagDefinitions ?? []}
              />
            </div>
          )}

          {/* Tasks Tab */}
          {activeTab === 'tasks' && (
            <div className="flex-1 overflow-y-auto">
              {/* Task progress bar */}
              {cardTasks.length > 0 && (
                <div className="px-4 py-4">
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="text-neutral-600 dark:text-neutral-400">Progress</span>
                    <span className="font-medium text-neutral-900 dark:text-white">{completedCount}/{cardTasks.length}</span>
                  </div>
                  <div className="h-2 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500 rounded-full transition-all"
                      style={{ width: cardTasks.length > 0 ? `${(completedCount / cardTasks.length) * 100}%` : '0%' }}
                    />
                  </div>
                  <div className="flex gap-4 mt-2 text-xs text-neutral-500">
                    <span>{cardTasks.filter(t => t.status === 'in_progress').length} in progress</span>
                    <span>{cardTasks.length - completedCount - cardTasks.filter(t => t.status === 'in_progress').length} not started</span>
                  </div>
                </div>
              )}

              {/* Task list */}
              <div className="p-4 space-y-2">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {completedCount > 0 && (
                      <button
                        onClick={() => setCardTasksHidden(card.id, !card.hideCompletedTasks)}
                        className="text-xs text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
                      >
                        {card.hideCompletedTasks ? 'Show completed' : 'Hide completed'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Task list with drag-and-drop */}
                {visibleTasks.length > 0 && (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragStart={handleTaskDragStart}
                    onDragEnd={handleTaskDragEnd}
                  >
                    <SortableContext
                      items={visibleTasks.map((t) => t.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-2">
                        {visibleTasks.map((task) => (
                          <div
                            key={task.id}
                            onClick={() => handleTaskClick(task)}
                            className="flex items-center gap-3 p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                          >
                            <SortableTaskItem
                              task={task}
                              onTaskClick={handleTaskClick}
                              onToggleStatus={() => toggleTaskStatus(task.id)}
                            />
                          </div>
                        ))}
                      </div>
                    </SortableContext>
                    <DragOverlay>
                      {activeDragTask && (
                        <div className="flex items-center gap-2 p-2 rounded-md bg-white dark:bg-neutral-900 shadow-lg">
                          <svg className="h-4 w-4 text-neutral-400" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M7 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
                          </svg>
                          <span className={`text-sm ${
                            activeDragTask.status === 'done'
                              ? 'text-neutral-400 line-through'
                              : 'text-neutral-700 dark:text-neutral-300'
                          }`}>
                            {activeDragTask.title}
                          </span>
                        </div>
                      )}
                    </DragOverlay>
                  </DndContext>
                )}

                {/* Hidden completed indicator */}
                {card.hideCompletedTasks && completedCount > 0 && (
                  <p className="text-xs text-green-600 dark:text-green-400">
                    {completedCount} completed task{completedCount > 1 ? 's' : ''} hidden
                  </p>
                )}

                {/* Add task button */}
                <button
                  onClick={handleAddTaskClick}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border-2 border-dashed border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:border-violet-300 hover:text-violet-600 dark:hover:border-violet-700 dark:hover:text-violet-400 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  <span className="text-sm">Add task</span>
                </button>
              </div>
            </div>
          )}

          {/* Info Tab */}
          {activeTab === 'info' && (
            <div className="flex-1 overflow-y-auto">
              {/* Cover image */}
              {card.coverImageUrl && (
                <div className="relative group flex-shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={card.coverImageUrl}
                    alt=""
                    className="w-full h-40 object-cover"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                    <button
                      onClick={() => coverFileInputRef.current?.click()}
                      disabled={isCoverUploading}
                      className="px-3 py-1.5 bg-white/90 text-sm text-neutral-800 rounded-md hover:bg-white transition-colors"
                    >
                      Change cover
                    </button>
                    <button
                      onClick={() => setCoverImage(card.id, null)}
                      className="px-3 py-1.5 bg-white/90 text-sm text-red-600 rounded-md hover:bg-white transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                  {isCoverUploading && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <svg className="w-6 h-6 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    </div>
                  )}
                </div>
              )}

              {/* Card header section */}
              <div className="p-4 space-y-4">
                {/* Add cover button (when no cover) */}
                {!card.coverImageUrl && (
                  <button
                    onClick={() => coverFileInputRef.current?.click()}
                    disabled={isCoverUploading}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 border border-dashed border-neutral-300 dark:border-neutral-700 rounded-md hover:border-neutral-400 dark:hover:border-neutral-600 transition-colors"
                  >
                    {isCoverUploading ? (
                      <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    ) : (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    )}
                    Add cover image
                  </button>
                )}

                {/* Metadata rows */}
                <div className="space-y-3">
                  {/* Source */}
                  <div className="flex items-center">
                    <span className="w-24 text-sm text-neutral-500">Source</span>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        card.source === 'ai'
                          ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400'
                          : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'
                      }`}
                    >
                      {card.source === 'ai' ? 'AI Generated' : 'Manual'}
                    </span>
                  </div>

                  {/* Created */}
                  <div className="flex items-center">
                    <span className="w-24 text-sm text-neutral-500">Created</span>
                    <span className="text-sm text-neutral-700 dark:text-neutral-300">
                      {formatDate(card.createdAt)}
                    </span>
                  </div>

                  {/* Modified */}
                  <div className="flex items-center">
                    <span className="w-24 text-sm text-neutral-500">Modified</span>
                    <span className="text-sm text-neutral-700 dark:text-neutral-300">
                      {formatDate(card.updatedAt)}
                    </span>
                  </div>

                  {/* Tags */}
                  <div className="flex items-start">
                    <span className="w-24 text-sm text-neutral-500 pt-0.5">Tags</span>
                    <div className="flex-1">
                      {!isTagPickerOpen ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {(card.tags ?? []).map((tagName) => {
                            const tagDef = (channels[card.channelId]?.tagDefinitions ?? []).find(
                              (t) => t.name === tagName
                            );
                            const colorInfo = getTagStyles(tagDef?.color ?? 'gray');
                            return (
                              <span
                                key={tagName}
                                className={`group inline-flex items-center gap-0.5 rounded text-xs font-medium ${colorInfo.className ?? ''}`}
                                style={colorInfo.style}
                              >
                                <button
                                  onClick={() => setIsTagPickerOpen(true)}
                                  className="px-2 py-0.5 hover:opacity-80 transition-opacity"
                                >
                                  {tagName}
                                </button>
                                <button
                                  onClick={() => removeTagFromCard(card.id, tagName)}
                                  className="pr-1.5 py-0.5 opacity-60 hover:opacity-100"
                                >
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              </span>
                            );
                          })}
                          <button
                            onClick={() => setIsTagPickerOpen(true)}
                            className="inline-flex items-center justify-center gap-1 px-2 py-0.5 min-h-[22px] rounded text-xs font-medium text-violet-600 hover:text-violet-700 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                            </svg>
                            {(card.tags ?? []).length === 0 ? 'Add tag' : ''}
                          </button>
                        </div>
                      ) : (
                        <TagPicker
                          tagDefinitions={channels[card.channelId]?.tagDefinitions ?? []}
                          selectedTags={card.tags ?? []}
                          onAddTag={(tagName) => addTagToCard(card.id, tagName)}
                          onRemoveTag={(tagName) => removeTagFromCard(card.id, tagName)}
                          onCreateTag={(name, color) => addTagDefinition(card.channelId, name, color)}
                          onUpdateTag={(tagId, updates) => updateTagDefinition(card.channelId, tagId, updates)}
                          onDeleteTag={(tagId) => removeTagDefinition(card.channelId, tagId)}
                          onClose={() => setIsTagPickerOpen(false)}
                        />
                      )}
                    </div>
                  </div>

                  {/* Assigned */}
                  <div className="flex items-start">
                    <span className="w-24 text-sm text-neutral-500 pt-0.5">Assigned</span>
                    <div className="flex-1">
                      {!isAssigneePickerOpen ? (
                        <div className="flex items-center gap-1.5">
                          <AssigneeAvatars
                            userIds={card.assignedTo ?? []}
                            members={members}
                            size="md"
                            onClick={() => setIsAssigneePickerOpen(true)}
                          />
                          <button
                            onClick={() => setIsAssigneePickerOpen(true)}
                            className="inline-flex items-center justify-center gap-1 px-2 py-0.5 min-h-[22px] rounded text-xs font-medium text-violet-600 hover:text-violet-700 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                            </svg>
                            {(card.assignedTo ?? []).length === 0 ? 'Assign' : ''}
                          </button>
                        </div>
                      ) : (
                        <AssigneePicker
                          channelId={card.channelId}
                          selectedUserIds={card.assignedTo ?? []}
                          onToggleUser={(userId) => toggleCardAssignee(card.id, userId)}
                          onClose={() => setIsAssigneePickerOpen(false)}
                        />
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions section */}
              <div className="p-4 space-y-1">
                <h3 className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-2">Actions</h3>

                {/* Run History (if any) */}
                {card.processedByInstructions && Object.keys(card.processedByInstructions).length > 0 && (
                  <div>
                    <button
                      onClick={() => setIsInstructionHistoryOpen(!isInstructionHistoryOpen)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-lg transition-colors"
                    >
                      <svg className="w-4 h-4 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="flex-1 text-left">Run history</span>
                      <span className="text-xs text-neutral-400">{Object.keys(card.processedByInstructions).length}</span>
                      <svg className={`w-4 h-4 text-neutral-400 transition-transform ${isInstructionHistoryOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {isInstructionHistoryOpen && (
                      <div className="ml-7 mt-1 space-y-2 pb-2">
                        {Object.entries(card.processedByInstructions).map(([instructionId, timestamp]) => {
                          const instruction = instructionCards[instructionId];
                          if (!instruction) return null;

                          const undoableRun = Object.values(instructionRuns)
                            .filter(r =>
                              r.instructionId === instructionId &&
                              !r.undone &&
                              r.changes.some(c => c.cardId === card.id)
                            )
                            .sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];

                          return (
                            <div key={instructionId} className="px-3 py-2 bg-neutral-50 dark:bg-neutral-800/50 rounded-lg">
                              <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">{instruction.title}</p>
                              <p className="text-xs text-neutral-500">{formatDate(timestamp)}</p>
                              <div className="flex items-center gap-2 mt-1">
                                {undoableRun && (
                                  <button
                                    onClick={() => undoInstructionRun(undoableRun.id)}
                                    className="text-xs text-amber-600 hover:text-amber-700 dark:text-amber-400 hover:underline"
                                  >
                                    Undo
                                  </button>
                                )}
                                <button
                                  onClick={() => clearInstructionRun(card.id, instructionId)}
                                  className="text-xs text-violet-600 hover:text-violet-700 dark:text-violet-400 hover:underline"
                                >
                                  Run again
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Create Channel */}
                <button
                  onClick={handleCreateChannel}
                  disabled={isPromoting}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-lg transition-colors disabled:opacity-50"
                >
                  {isPromoting ? (
                    <svg className="w-4 h-4 text-neutral-500 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                  )}
                  {isPromoting ? 'Creating...' : 'Create channel from card'}
                </button>

                {/* Archive */}
                <button
                  onClick={handleArchive}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-lg transition-colors"
                >
                  <svg className="w-4 h-4 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                  </svg>
                  Archive
                </button>

                {/* Delete */}
                <button
                  onClick={handleDelete}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Delete
                </button>
              </div>

              {/* Spawned channels section */}
              {spawnedChannels.length > 0 && (
                <div className="p-4">
                    <h3 className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-2">Created Channels</h3>
                    <div className="space-y-1">
                      {spawnedChannels.map((channel) => (
                        <Link
                          key={channel.id}
                          href={`/channel/${channel.id}`}
                          onClick={onClose}
                          className="flex items-center gap-2 px-3 py-2 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-lg transition-colors"
                        >
                          <svg className="w-4 h-4 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                          </svg>
                          {channel.name}
                        </Link>
                      ))}
                    </div>
                  </div>
              )}
            </div>
          )}
        </div>

        {/* Bottom Tabs - sticky on mobile */}
        <div className="flex-shrink-0 sticky bottom-0 z-10 flex bg-white dark:bg-neutral-900">
          <button
            onClick={() => setActiveTab('thread')}
            className={`flex-1 flex flex-col items-center gap-1 py-3 transition-colors ${
              activeTab === 'thread'
                ? 'text-violet-600 dark:text-violet-400'
                : 'text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300'
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <span className="text-xs font-medium">Thread</span>
          </button>
          <button
            onClick={() => setActiveTab('tasks')}
            className={`flex-1 flex flex-col items-center gap-1 py-3 transition-colors relative ${
              activeTab === 'tasks'
                ? 'text-violet-600 dark:text-violet-400'
                : 'text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300'
            }`}
          >
            <div className="relative">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              {cardTasks.length - completedCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 text-[10px] font-bold bg-violet-500 text-white rounded-full flex items-center justify-center">
                  {cardTasks.length - completedCount}
                </span>
              )}
            </div>
            <span className="text-xs font-medium">Tasks</span>
          </button>
          <button
            onClick={() => setActiveTab('info')}
            className={`flex-1 flex flex-col items-center gap-1 py-3 transition-colors ${
              activeTab === 'info'
                ? 'text-violet-600 dark:text-violet-400'
                : 'text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300'
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-xs font-medium">Info</span>
          </button>
        </div>
      </div>
      <TaskDrawer
        task={selectedTask}
        autoFocusTitle={autoFocusTaskTitle}
        isOpen={isTaskDrawerOpen}
        onClose={() => {
          setIsTaskDrawerOpen(false);
          setSelectedTask(null);
          setAutoFocusTaskTitle(false);
        }}
        onOpenCard={() => {
          setIsTaskDrawerOpen(false);
          setSelectedTask(null);
          setAutoFocusTaskTitle(false);
        }}
      />

      {/* Mini title drawer - appears on first card view */}
      {showTitleDrawer && (
        <div className="absolute inset-0 z-20 overflow-hidden">
          {/* Backdrop - covers full area, behind the drawer */}
          <div
            className="absolute inset-0 bg-black/20 dark:bg-black/40"
            onClick={() => setShowTitleDrawer(false)}
          />
          {/* Mini drawer - positioned above keyboard on mobile */}
          <div
            className="absolute inset-x-0 bg-white dark:bg-neutral-900 rounded-t-2xl transition-[bottom] duration-100"
            style={{
              bottom: keyboardOffset > 0 ? `${keyboardOffset}px` : 0,
              minHeight: '160px',
              maxHeight: '50%'
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
                  Give this card a name
                </label>
                <input
                  ref={titleDrawerInputRef}
                  type="text"
                  value={title}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  onFocus={handleKeyboardFocus}
                  onBlur={handleKeyboardBlur}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      setShowTitleDrawer(false);
                    }
                  }}
                  className="w-full px-3 py-2.5 text-base text-neutral-900 dark:text-white bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent placeholder-neutral-400"
                  placeholder="Card title"
                />
              </div>

              {/* Done button */}
              <button
                onClick={() => setShowTitleDrawer(false)}
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
