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
import { nanoid } from 'nanoid';

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
  fullPage?: boolean;
  onNavigateBack?: () => void;
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

export function CardDetailDrawer({ card, isOpen, onClose, autoFocusTitle, fullPage, onNavigateBack }: CardDetailDrawerProps) {
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
  const [copiedLink, setCopiedLink] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [copiedPublicLink, setCopiedPublicLink] = useState(false);
  const shareMenuRef = useRef<HTMLDivElement>(null);
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
  const createCard = useStore((s) => s.createCard);
  const moveCard = useStore((s) => s.moveCard);
  const moveCardToChannel = useStore((s) => s.moveCardToChannel);
  const { members } = useChannelMembers(card?.channelId);

  const [showCardMenu, setShowCardMenu] = useState(false);
  const [showMoveChannelPicker, setShowMoveChannelPicker] = useState(false);
  const [showMoveColumnPicker, setShowMoveColumnPicker] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const cardMenuRef = useRef<HTMLDivElement>(null);

  const [activeDragTaskId, setActiveDragTaskId] = useState<ID | null>(null);
  const [isCoverUploading, setIsCoverUploading] = useState(false);
  const [isGeneratingCover, setIsGeneratingCover] = useState(false);
  const [showImagePrompt, setShowImagePrompt] = useState(false);
  const [imagePromptText, setImagePromptText] = useState('');
  const coverFileInputRef = useRef<HTMLInputElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const { uploadFile: uploadCoverFile } = useImageUpload({ cardId: card?.id });

  const generateCoverImage = async (customPrompt?: string) => {
    if (!card) return;
    setIsGeneratingCover(true);
    try {
      const body = customPrompt
        ? { prompt: customPrompt }
        : { context: card.title, type: 'card' };
      const res = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.url) {
        setCoverImage(card.id, data.url);
      }
    } catch (err) {
      console.error('Cover generation failed:', err);
    } finally {
      setIsGeneratingCover(false);
      setShowImagePrompt(false);
      setImagePromptText('');
    }
  };

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
  // Close share menu on click outside
  useEffect(() => {
    if (!showShareMenu) return;
    const handler = (e: MouseEvent) => {
      if (shareMenuRef.current && !shareMenuRef.current.contains(e.target as Node)) {
        setShowShareMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showShareMenu]);

  // Close card menu on click outside
  useEffect(() => {
    if (!showCardMenu) return;
    const handler = (e: MouseEvent) => {
      if (cardMenuRef.current && !cardMenuRef.current.contains(e.target as Node)) {
        setShowCardMenu(false);
        setShowMoveChannelPicker(false);
        setShowDeleteConfirm(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showCardMenu]);

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

  const content = (
    <>
      <div className={`flex flex-col ${fullPage ? 'h-full' : 'h-[100dvh] sm:h-full sm:max-h-[calc(100vh-2rem)]'}`}>
        {/* Compact Header - sticky on mobile */}
        <div className="flex-shrink-0 sticky top-0 z-10 bg-white dark:bg-neutral-900 flex items-center gap-3 px-4 py-3">
          {fullPage && onNavigateBack && (
            <button
              onClick={onNavigateBack}
              className="flex-shrink-0 w-8 h-8 flex items-center justify-center text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          <input
            ref={titleInputRef}
            type="text"
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            className="flex-1 font-medium text-neutral-900 dark:text-white bg-transparent border-none outline-none placeholder-neutral-400 truncate"
            placeholder="Card title"
          />
          {fullPage && card && (
            <div className="relative" ref={shareMenuRef}>
              <button
                onClick={() => setShowShareMenu(!showShareMenu)}
                className="flex-shrink-0 w-8 h-8 flex items-center justify-center text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800"
                title="Share"
              >
                <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
              </button>

              {showShareMenu && (
                <div className="absolute right-0 top-10 w-72 bg-white dark:bg-neutral-800 rounded-xl shadow-xl border border-neutral-200 dark:border-neutral-700 z-50 overflow-hidden">
                  <div className="p-3 border-b border-neutral-200 dark:border-neutral-700">
                    <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">Share card</h3>
                  </div>

                  <div className="p-2 space-y-1">
                    {/* Copy internal link */}
                    <button
                      onClick={() => {
                        const url = `${window.location.origin}/channel/${card.channelId}/card/${card.id}`;
                        navigator.clipboard.writeText(url);
                        setCopiedLink(true);
                        setTimeout(() => setCopiedLink(false), 2000);
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-neutral-100 dark:hover:bg-neutral-700/50 transition-colors"
                    >
                      <div className="w-8 h-8 rounded-lg bg-neutral-100 dark:bg-neutral-700 flex items-center justify-center flex-shrink-0">
                        {copiedLink ? (
                          <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                          </svg>
                        )}
                      </div>
                      <div>
                        <span className="text-sm font-medium text-neutral-900 dark:text-white block">
                          {copiedLink ? 'Copied!' : 'Copy link'}
                        </span>
                        <span className="text-xs text-neutral-500">Share with channel members</span>
                      </div>
                    </button>

                    {/* Invite to channel */}
                    <button
                      onClick={() => {
                        setShowShareMenu(false);
                        const url = `${window.location.origin}/channel/${card.channelId}?settings=open&tab=members`;
                        window.open(url, '_self');
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-neutral-100 dark:hover:bg-neutral-700/50 transition-colors"
                    >
                      <div className="w-8 h-8 rounded-lg bg-neutral-100 dark:bg-neutral-700 flex items-center justify-center flex-shrink-0">
                        <svg className="w-4 h-4 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                        </svg>
                      </div>
                      <div>
                        <span className="text-sm font-medium text-neutral-900 dark:text-white block">Invite people</span>
                        <span className="text-xs text-neutral-500">Add members to this channel</span>
                      </div>
                    </button>

                    {/* Publish / Make public */}
                    <button
                      onClick={async () => {
                        if (isPublishing) return;
                        setIsPublishing(true);
                        try {
                          if (card.isPublic) {
                            updateCard(card.id, { isPublic: false, shareToken: undefined });
                          } else {
                            const token = card.shareToken || nanoid(12);
                            updateCard(card.id, { isPublic: true, shareToken: token });
                          }
                        } finally {
                          setIsPublishing(false);
                        }
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-neutral-100 dark:hover:bg-neutral-700/50 transition-colors"
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        card.isPublic
                          ? 'bg-green-100 dark:bg-green-900/30'
                          : 'bg-neutral-100 dark:bg-neutral-700'
                      }`}>
                        <svg className={`w-4 h-4 ${card.isPublic ? 'text-green-600 dark:text-green-400' : 'text-neutral-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div>
                        <span className="text-sm font-medium text-neutral-900 dark:text-white block">
                          {card.isPublic ? 'Published' : 'Publish to web'}
                        </span>
                        <span className="text-xs text-neutral-500">
                          {card.isPublic ? 'Anyone with the link can view' : 'Create a public page for this card'}
                        </span>
                      </div>
                      {card.isPublic && (
                        <span className="ml-auto text-xs text-green-600 dark:text-green-400 font-medium">Live</span>
                      )}
                    </button>

                    {/* Public link (shown when published) */}
                    {card.isPublic && card.shareToken && (
                      <div className="mx-3 my-2 p-2.5 rounded-lg bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700">
                        <div className="flex items-center gap-2">
                          <input
                            readOnly
                            value={`${window.location.origin}/public/card/${card.shareToken}`}
                            className="flex-1 bg-transparent text-xs text-neutral-600 dark:text-neutral-400 truncate border-none outline-none"
                          />
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(`${window.location.origin}/public/card/${card.shareToken}`);
                              setCopiedPublicLink(true);
                              setTimeout(() => setCopiedPublicLink(false), 2000);
                            }}
                            className="flex-shrink-0 px-2 py-1 rounded text-xs font-medium bg-violet-600 text-white hover:bg-violet-500 transition-colors"
                          >
                            {copiedPublicLink ? 'Copied!' : 'Copy'}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Theme picker (shown when published) */}
                    {card.isPublic && card.shareToken && (
                      <div className="mx-3 my-2">
                        <p className="text-xs font-medium text-neutral-500 mb-2">Page theme</p>
                        <div className="grid grid-cols-4 gap-1.5">
                          {([
                            { key: 'conversational', label: 'Chat', bg: '#0e0e0e', accent: '#7c3aed', fg: '#a1a1aa', lines: '#27272a' },
                            { key: 'editorial', label: 'Editorial', bg: '#fafaf9', accent: '#7c3aed', fg: '#78716c', lines: '#e7e5e4' },
                            { key: 'terminal', label: 'Terminal', bg: '#0a0a0a', accent: '#4ade80', fg: '#525252', lines: '#262626' },
                            { key: 'poster', label: 'Poster', bg: '#121214', accent: '#7c3aed', fg: '#a1a1aa', lines: 'rgba(255,255,255,0.1)' },
                          ] as const).map((theme) => {
                            const isActive = (card.shareTheme || 'conversational') === theme.key;
                            return (
                              <button
                                key={theme.key}
                                onClick={() => updateCard(card.id, { shareTheme: theme.key })}
                                className={`rounded-lg p-1.5 border transition-all ${
                                  isActive
                                    ? 'border-violet-500 ring-1 ring-violet-500/50'
                                    : 'border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600'
                                }`}
                              >
                                {/* Mini preview */}
                                <div
                                  className="rounded w-full aspect-[3/4] mb-1 p-1.5 flex flex-col gap-0.5"
                                  style={{ backgroundColor: theme.bg }}
                                >
                                  <div className="w-full h-0.5 rounded-full" style={{ backgroundColor: theme.accent }} />
                                  <div className="w-3/4 h-0.5 rounded-full" style={{ backgroundColor: theme.fg }} />
                                  <div className="w-full h-0.5 rounded-full mt-auto" style={{ backgroundColor: theme.lines }} />
                                  <div className="w-2/3 h-0.5 rounded-full" style={{ backgroundColor: theme.lines }} />
                                </div>
                                <p className="text-[10px] text-center text-neutral-500 font-medium leading-none">
                                  {theme.label}
                                </p>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
          {card && (
            <div className="relative" ref={cardMenuRef}>
              <button
                onClick={() => { setShowCardMenu(!showCardMenu); setShowMoveChannelPicker(false); setShowDeleteConfirm(false); }}
                className="flex-shrink-0 w-8 h-8 flex items-center justify-center text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800"
                title="More options"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
                </svg>
              </button>

              {showCardMenu && (
                <div className="absolute right-0 top-10 w-52 bg-white dark:bg-neutral-800 rounded-xl shadow-xl border border-neutral-200 dark:border-neutral-700 z-50 overflow-hidden py-1">
                  {showDeleteConfirm ? (
                    <div className="px-3 py-2">
                      <p className="text-xs text-neutral-600 dark:text-neutral-300 mb-2">Delete this card permanently?</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            deleteCard(card.id);
                            setShowCardMenu(false);
                            setShowDeleteConfirm(false);
                            onClose();
                          }}
                          className="flex-1 px-2 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
                        >
                          Delete
                        </button>
                        <button
                          onClick={() => setShowDeleteConfirm(false)}
                          className="flex-1 px-2 py-1.5 text-xs font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-lg transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : showMoveColumnPicker ? (
                    <div className="max-h-64 overflow-y-auto">
                      <button
                        onClick={() => setShowMoveColumnPicker(false)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-700/50 transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                        Back
                      </button>
                      <div className="h-px bg-neutral-200 dark:bg-neutral-700 my-1" />
                      {(channels[card.channelId]?.columns ?? []).map((col) => (
                        <button
                          key={col.id}
                          onClick={() => {
                            moveCard(card.id, col.id, 0);
                            setShowCardMenu(false);
                            setShowMoveColumnPicker(false);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700/50 transition-colors"
                        >
                          <span className="truncate">{col.name}</span>
                        </button>
                      ))}
                    </div>
                  ) : showMoveChannelPicker ? (
                    <div className="max-h-64 overflow-y-auto">
                      <button
                        onClick={() => setShowMoveChannelPicker(false)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-700/50 transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                        Back
                      </button>
                      <div className="h-px bg-neutral-200 dark:bg-neutral-700 my-1" />
                      {Object.values(channels)
                        .filter((ch) => ch.id !== card.channelId && !ch.sharedBy)
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map((ch) => {
                          const targetCol = ch.columns?.[0];
                          return targetCol ? (
                            <button
                              key={ch.id}
                              onClick={() => {
                                // Move card to target channel preserving all data
                                moveCardToChannel(card.id, ch.id, targetCol.id);
                                setShowCardMenu(false);
                                setShowMoveChannelPicker(false);
                                onClose();
                              }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700/50 transition-colors"
                            >
                              <svg className="w-4 h-4 text-neutral-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                              </svg>
                              <span className="truncate">{ch.name}</span>
                            </button>
                          ) : null;
                        })}
                    </div>
                  ) : (
                    <>
                      {/* Full screen */}
                      {!fullPage && (
                        <button
                          onClick={() => { setShowCardMenu(false); router.push(`/channel/${card.channelId}/card/${card.id}`); }}
                          className="w-full flex items-center gap-3 px-3 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700/50 transition-colors"
                        >
                          <svg className="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" />
                          </svg>
                          Full screen
                        </button>
                      )}

                      {/* Share — copy link */}
                      <button
                        onClick={() => {
                          const url = `${window.location.origin}/channel/${card.channelId}/card/${card.id}`;
                          navigator.clipboard.writeText(url);
                          setCopiedLink(true);
                          setTimeout(() => setCopiedLink(false), 2000);
                          setShowCardMenu(false);
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700/50 transition-colors"
                      >
                        <svg className="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                        </svg>
                        {copiedLink ? 'Link copied!' : 'Share'}
                      </button>

                      {/* Info */}
                      <button
                        onClick={() => { setShowCardMenu(false); setActiveTab('info'); }}
                        className="w-full flex items-center gap-3 px-3 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700/50 transition-colors"
                      >
                        <svg className="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Info
                      </button>

                      <div className="h-px bg-neutral-200 dark:bg-neutral-700 my-1" />

                      {/* Duplicate */}
                      <button
                        onClick={() => {
                          const col = channels[card.channelId]?.columns?.find((c) => c.cardIds?.includes(card.id));
                          if (col) {
                            createCard(card.channelId, col.id, { title: `${card.title} (copy)`, initialMessage: card.messages?.[0]?.content || undefined });
                          }
                          setShowCardMenu(false);
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700/50 transition-colors"
                      >
                        <svg className="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        Duplicate
                      </button>

                      {/* Snooze */}
                      <button
                        onClick={() => {
                          const tomorrow = new Date();
                          tomorrow.setDate(tomorrow.getDate() + 1);
                          tomorrow.setHours(9, 0, 0, 0);
                          updateCard(card.id, { snoozedUntil: tomorrow.toISOString() });
                          setShowCardMenu(false);
                          onClose();
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700/50 transition-colors"
                      >
                        <svg className="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Snooze until tomorrow
                      </button>

                      {/* Pin/Unpin */}
                      <button
                        onClick={() => {
                          updateCard(card.id, { pinnedAt: card.pinnedAt ? undefined : new Date().toISOString() });
                          setShowCardMenu(false);
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700/50 transition-colors"
                      >
                        <svg className="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                        </svg>
                        {card.pinnedAt ? 'Unpin' : 'Pin'}
                      </button>

                      {/* Archive */}
                      <button
                        onClick={() => {
                          archiveCard(card.id);
                          setShowCardMenu(false);
                          onClose();
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700/50 transition-colors"
                      >
                        <svg className="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                        </svg>
                        Archive
                      </button>

                      {/* Move to column */}
                      <button
                        onClick={() => setShowMoveColumnPicker(true)}
                        className="w-full flex items-center gap-3 px-3 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700/50 transition-colors"
                      >
                        <svg className="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        Move to column
                        <svg className="w-3 h-3 text-neutral-400 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>

                      {/* Move to channel */}
                      <button
                        onClick={() => setShowMoveChannelPicker(true)}
                        className="w-full flex items-center gap-3 px-3 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700/50 transition-colors"
                      >
                        <svg className="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                        </svg>
                        Move to channel
                        <svg className="w-3 h-3 text-neutral-400 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>

                      <div className="h-px bg-neutral-200 dark:bg-neutral-700 my-1" />

                      {/* Delete */}
                      <button
                        onClick={() => setShowDeleteConfirm(true)}
                        className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        Delete
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
          {!fullPage && (
            <button
              onClick={handleClose}
              className="flex-shrink-0 w-8 h-8 flex items-center justify-center text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
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

        {/* Cover image - full page only */}
        {fullPage && card.coverImageUrl && (
          <div className="flex-shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={card.coverImageUrl}
              alt=""
              className="w-full h-48 object-cover"
            />
          </div>
        )}

        {/* Tab Buttons - above content */}
        <div className="flex-shrink-0 flex gap-1 px-4 py-2 bg-white dark:bg-neutral-900 border-b border-neutral-100 dark:border-neutral-800">
          <button
            onClick={() => setActiveTab('thread')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activeTab === 'thread'
                ? 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300'
                : 'text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 dark:text-neutral-400'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            Thread
          </button>
          <button
            onClick={() => setActiveTab('tasks')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activeTab === 'tasks'
                ? 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300'
                : 'text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 dark:text-neutral-400'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            Tasks
            {cardTasks.length > 0 && (
              <span className={`ml-0.5 tabular-nums ${
                cardTasks.length - completedCount > 0
                  ? activeTab === 'tasks'
                    ? 'text-violet-600 dark:text-violet-300'
                    : 'text-violet-500 dark:text-violet-400'
                  : 'opacity-50'
              }`}>
                {completedCount}/{cardTasks.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('info')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activeTab === 'info'
                ? 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300'
                : 'text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 dark:text-neutral-400'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Info
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
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
                      onClick={() => generateCoverImage()}
                      disabled={isGeneratingCover}
                      className="px-3 py-1.5 bg-white/90 text-sm text-neutral-800 rounded-md hover:bg-white transition-colors"
                    >
                      {isGeneratingCover ? 'Generating...' : 'Regenerate'}
                    </button>
                    <button
                      onClick={() => coverFileInputRef.current?.click()}
                      disabled={isCoverUploading}
                      className="px-3 py-1.5 bg-white/90 text-sm text-neutral-800 rounded-md hover:bg-white transition-colors"
                    >
                      Upload
                    </button>
                    <button
                      onClick={() => setCoverImage(card.id, null)}
                      className="px-3 py-1.5 bg-white/90 text-sm text-red-600 rounded-md hover:bg-white transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                  {(isCoverUploading || isGeneratingCover) && (
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
                {/* Add cover options (when no cover) */}
                {!card.coverImageUrl && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => generateCoverImage()}
                        disabled={isGeneratingCover}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 border border-dashed border-neutral-300 dark:border-neutral-700 rounded-md hover:border-violet-400 dark:hover:border-violet-500 hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
                      >
                        {isGeneratingCover ? (
                          <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                        ) : (
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                          </svg>
                        )}
                        {isGeneratingCover ? 'Generating...' : 'Generate cover'}
                      </button>
                      <button
                        onClick={() => setShowImagePrompt(!showImagePrompt)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 border border-dashed border-neutral-300 dark:border-neutral-700 rounded-md hover:border-neutral-400 dark:hover:border-neutral-600 transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                        Custom prompt
                      </button>
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
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                          </svg>
                        )}
                        Upload
                      </button>
                    </div>
                    {showImagePrompt && (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={imagePromptText}
                          onChange={(e) => setImagePromptText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && imagePromptText.trim()) {
                              generateCoverImage(imagePromptText.trim());
                            }
                          }}
                          placeholder="Describe the image you want..."
                          className="flex-1 bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-md px-3 py-1.5 text-xs text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:border-violet-500/40"
                        />
                        <button
                          onClick={() => imagePromptText.trim() && generateCoverImage(imagePromptText.trim())}
                          disabled={!imagePromptText.trim() || isGeneratingCover}
                          className="px-3 py-1.5 rounded-md bg-violet-600 text-white text-xs font-medium hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          Generate
                        </button>
                      </div>
                    )}
                  </div>
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
    </>
  );

  if (fullPage) {
    return (
      <div className="fixed inset-0 z-30 bg-white dark:bg-neutral-900">
        <div className="max-w-2xl mx-auto h-full">{content}</div>
      </div>
    );
  }

  return (
    <Drawer isOpen={isOpen} onClose={handleClose} width="lg" floating hideCloseButton>
      {content}
    </Drawer>
  );
}
