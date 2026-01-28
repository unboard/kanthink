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
import type { Card, Task, ID } from '@/lib/types';
import { useStore, type PromoteConfig } from '@/lib/store';
import { useSettingsStore } from '@/lib/settingsStore';
import { useImageUpload } from '@/lib/hooks/useImageUpload';
import { Drawer } from '@/components/ui';
import { TaskCheckbox } from './TaskCheckbox';
import { TaskDrawer } from './TaskDrawer';
import { CardChat } from './CardChat';
import { TagPicker, getTagStyles } from './TagPicker';

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
      <svg
        className="w-4 h-4 text-neutral-400 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        onClick={() => onTaskClick(task)}
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </div>
  );
}

interface CardDetailDrawerProps {
  card: Card | null;
  isOpen: boolean;
  onClose: () => void;
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

type ActiveTab = 'details' | 'tasks';

export function CardDetailDrawer({ card, isOpen, onClose }: CardDetailDrawerProps) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [isTitleDirty, setIsTitleDirty] = useState(false);
  const [isPromoting, setIsPromoting] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isTaskDrawerOpen, setIsTaskDrawerOpen] = useState(false);
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [isTagPickerOpen, setIsTagPickerOpen] = useState(false);
  const [isInstructionHistoryOpen, setIsInstructionHistoryOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('details');

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
  const instructionCards = useStore((s) => s.instructionCards);
  const clearInstructionRun = useStore((s) => s.clearInstructionRun);
  const instructionRuns = useStore((s) => s.instructionRuns);
  const undoInstructionRun = useStore((s) => s.undoInstructionRun);
  const setCoverImage = useStore((s) => s.setCoverImage);
  const aiSettings = useSettingsStore((s) => s.ai);

  const [activeDragTaskId, setActiveDragTaskId] = useState<ID | null>(null);
  const [isCoverUploading, setIsCoverUploading] = useState(false);
  const coverFileInputRef = useRef<HTMLInputElement>(null);
  const { uploadFile: uploadCoverFile } = useImageUpload({ cardId: card?.id });

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

  useEffect(() => {
    if (card) {
      setTitle(card.title);
      setIsTitleDirty(false);
      setSelectedTask(null);
      setIsTaskDrawerOpen(false);
      setIsCreatingTask(false);
      setIsTagPickerOpen(false);
      setIsInstructionHistoryOpen(false);
      setIsMenuOpen(false);
      setActiveTab('details');
    }
  }, [card]);

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

      if (aiSettings.apiKey) {
        try {
          const response = await fetch('/api/promote-card', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              cardTitle: title || card.title,
              cardContent: messagesText,
              aiConfig: {
                provider: aiSettings.provider,
                apiKey: aiSettings.apiKey,
                model: aiSettings.model || undefined,
              },
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
    setIsCreatingTask(false);
    setIsTaskDrawerOpen(true);
  };

  const handleAddTaskClick = () => {
    setSelectedTask(null);
    setIsCreatingTask(true);
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
    <Drawer isOpen={isOpen} onClose={handleClose} width="lg" floating>
      <div className="flex flex-col h-full max-h-[calc(100vh-2rem)]">
        {/* 3-dot menu - positioned to the left of the close button */}
        <div className="absolute top-4 right-14 z-10">
        <button
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className={`p-2 rounded-md transition-colors ${
            isMenuOpen
              ? 'bg-neutral-200 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200'
              : 'text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 dark:hover:text-neutral-300 dark:hover:bg-neutral-800'
          }`}
          title="Card menu"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <circle cx="12" cy="5" r="1.5" />
            <circle cx="12" cy="12" r="1.5" />
            <circle cx="12" cy="19" r="1.5" />
          </svg>
        </button>

        {/* Menu dropdown */}
        {isMenuOpen && (
          <>
            {/* Backdrop to close menu */}
            <div
              className="fixed inset-0 z-10"
              onClick={() => setIsMenuOpen(false)}
            />
            <div className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-lg z-20">
              {/* Action History submenu */}
              {card.processedByInstructions && Object.keys(card.processedByInstructions).length > 0 && (
                <>
                  <button
                    onClick={() => {
                      setIsInstructionHistoryOpen(!isInstructionHistoryOpen);
                    }}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-t-lg"
                  >
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Run History
                    </div>
                    <svg className={`w-4 h-4 transition-transform ${isInstructionHistoryOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {/* Expanded history list */}
                  {isInstructionHistoryOpen && (
                    <div className="border-t border-neutral-100 dark:border-neutral-800 max-h-48 overflow-y-auto">
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
                          <div
                            key={instructionId}
                            className="px-3 py-2 bg-neutral-50 dark:bg-neutral-800/50"
                          >
                            <p className="text-xs font-medium text-neutral-600 dark:text-neutral-400 truncate">
                              {instruction.title}
                            </p>
                            <p className="text-xs text-neutral-400 dark:text-neutral-500">
                              {formatDate(timestamp)}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              {undoableRun && (
                                <button
                                  onClick={() => {
                                    undoInstructionRun(undoableRun.id);
                                    setIsMenuOpen(false);
                                  }}
                                  className="text-xs text-amber-600 hover:text-amber-700 dark:text-amber-400 hover:underline"
                                >
                                  Undo
                                </button>
                              )}
                              <button
                                onClick={() => {
                                  clearInstructionRun(card.id, instructionId);
                                  setIsMenuOpen(false);
                                }}
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
                </>
              )}

              {/* Archive */}
              <button
                onClick={() => {
                  setIsMenuOpen(false);
                  handleArchive();
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                </svg>
                Archive
              </button>

              {/* Create Channel */}
              <button
                onClick={() => {
                  setIsMenuOpen(false);
                  handleCreateChannel();
                }}
                disabled={isPromoting}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-50"
              >
                {isPromoting ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                )}
                {isPromoting ? 'Creating...' : 'Create Channel'}
              </button>

              {/* Delete */}
              <button
                onClick={() => {
                  setIsMenuOpen(false);
                  handleDelete();
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-b-lg"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Delete
              </button>
            </div>
          </>
        )}
      </div>

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

      {/* Fixed header area */}
      <div className="flex-shrink-0 p-6 pt-12 pb-0">
        {/* Add cover button (when no cover) */}
        {!card.coverImageUrl && (
          <button
            onClick={() => coverFileInputRef.current?.click()}
            disabled={isCoverUploading}
            className="mb-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 border border-dashed border-neutral-300 dark:border-neutral-700 rounded-md hover:border-neutral-400 dark:hover:border-neutral-600 transition-colors"
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

        {/* Title */}
        <input
          type="text"
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          className="w-full text-2xl font-semibold text-neutral-900 dark:text-white bg-transparent border-none outline-none placeholder-neutral-400"
          placeholder="Card title"
        />

        {/* Metadata rows */}
        <div className="mt-4 mb-4 space-y-3">
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
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-neutral-200 dark:border-neutral-700">
          <button
            onClick={() => setActiveTab('details')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'details'
                ? 'border-violet-500 text-violet-600 dark:text-violet-400'
                : 'border-transparent text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
            }`}
          >
            Details
          </button>
          <button
            onClick={() => setActiveTab('tasks')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'tasks'
                ? 'border-violet-500 text-violet-600 dark:text-violet-400'
                : 'border-transparent text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
            }`}
          >
            Tasks {cardTasks.length > 0 && `(${completedCount}/${cardTasks.length})`}
          </button>
        </div>
      </div>

      {/* Tab Content - fills remaining space */}
      {activeTab === 'tasks' && (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="flex items-center justify-between mb-3">
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
            <button
              onClick={handleAddTaskClick}
              className="text-xs text-violet-600 hover:text-violet-700 dark:text-violet-400"
            >
              + Add task
            </button>
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
                <div className="space-y-1 mb-3">
                  {visibleTasks.map((task) => (
                    <SortableTaskItem
                      key={task.id}
                      task={task}
                      onTaskClick={handleTaskClick}
                      onToggleStatus={() => toggleTaskStatus(task.id)}
                    />
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
            <p className="text-xs text-green-600 dark:text-green-400 mb-3">
              {completedCount} completed task{completedCount > 1 ? 's' : ''} hidden
            </p>
          )}

          {/* Empty state */}
          {cardTasks.length === 0 && (
            <p className="text-xs text-neutral-400 dark:text-neutral-500">
              No tasks yet. Break this card into actionable items.
            </p>
          )}
        </div>
      )}

      {/* Chat interface - fills remaining space below tabs, only visible on details tab */}
      {activeTab === 'details' && (
        <div className="flex-1 min-h-0 flex flex-col">
          <CardChat
            card={card}
            channelName={channels[card.channelId]?.name ?? 'Unknown Channel'}
            channelDescription={channels[card.channelId]?.description ?? ''}
          />
        </div>
      )}
      </div>
      <TaskDrawer
        task={isCreatingTask ? null : selectedTask}
        createForChannelId={isCreatingTask ? card.channelId : undefined}
        createForCardId={isCreatingTask ? card.id : undefined}
        isOpen={isTaskDrawerOpen}
        onClose={() => {
          setIsTaskDrawerOpen(false);
          setSelectedTask(null);
          setIsCreatingTask(false);
        }}
      />
    </Drawer>
  );
}
