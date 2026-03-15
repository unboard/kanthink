'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Card as CardType, Task } from '@/lib/types';
import { useStore } from '@/lib/store';
import { useChannelMembers } from '@/lib/hooks/useChannelMembers';
import { CardDetailDrawer } from './CardDetailDrawer';
import { TaskListOnCard } from './TaskListOnCard';
import { TaskDrawer } from './TaskDrawer';
import { AssigneeAvatars } from './AssigneeAvatars';
import { Modal } from '@/components/ui';
import { getTagStyles } from './TagPicker';
import { stripMentionMarkup } from './ChatMessage';
import { SnoozePicker } from './SnoozePicker';

interface CardProps {
  card: CardType;
}

export function Card({ card }: CardProps) {
  const router = useRouter();
  const [isCardDrawerOpen, setIsCardDrawerOpen] = useState(false);
  const [isTaskDrawerOpen, setIsTaskDrawerOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [autoFocusTaskTitle, setAutoFocusTaskTitle] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showCardMenu, setShowCardMenu] = useState(false);
  const [showSnoozeSubmenu, setShowSnoozeSubmenu] = useState(false);
  const [showMoveChannelPicker, setShowMoveChannelPicker] = useState(false);
  const [showMoveColumnPicker, setShowMoveColumnPicker] = useState(false);
  const [showReactSubmenu, setShowReactSubmenu] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const cardMenuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const [menuPosition, setMenuPosition] = useState<'below' | 'above'>('below');
  const { data: session } = useSession();
  const deleteCard = useStore((s) => s.deleteCard);
  const archiveCard = useStore((s) => s.archiveCard);
  const updateCard = useStore((s) => s.updateCard);
  const updateTask = useStore((s) => s.updateTask);
  const createTask = useStore((s) => s.createTask);
  const createCardStore = useStore((s) => s.createCard);
  const moveCardToChannel = useStore((s) => s.moveCardToChannel);
  const moveCard = useStore((s) => s.moveCard);
  const tasks = useStore((s) => s.tasks);
  const channels = useStore((s) => s.channels);
  const { members } = useChannelMembers(card.channelId);

  // Close card menu on click outside
  useEffect(() => {
    if (!showCardMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (cardMenuRef.current && !cardMenuRef.current.contains(e.target as Node)) {
        setShowCardMenu(false);
        setShowSnoozeSubmenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showCardMenu]);

  // Get tasks for this card
  const cardTasks = (card.taskIds ?? [])
    .map((id) => tasks[id])
    .filter(Boolean) as Task[];

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: card.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleConfirmDelete = () => {
    deleteCard(card.id);
    setShowDeleteConfirm(false);
  };

  const handleSnooze = (until: string) => {
    updateCard(card.id, { snoozedUntil: until });
    cardTasks.forEach((task) => {
      updateTask(task.id, { snoozedUntil: until });
    });
    setShowCardMenu(false);
    setShowSnoozeSubmenu(false);
  };

  const handlePin = () => {
    updateCard(card.id, { pinnedAt: card.pinnedAt ? undefined : new Date().toISOString() });
    setShowCardMenu(false);
  };

  const handleDuplicate = () => {
    const col = channels[card.channelId]?.columns?.find((c) => c.cardIds?.includes(card.id));
    if (col) {
      createCardStore(card.channelId, col.id, { title: `${card.title} (copy)`, initialMessage: card.messages?.[0]?.content || undefined });
    }
    setShowCardMenu(false);
  };

  const isPinned = !!card.pinnedAt;

  const REACTION_EMOJIS = ['👍', '❤️', '🔥', '👀', '✅', '🤔', '👏', '🚀'];
  const [showReactionPicker, setShowReactionPicker] = useState(false);

  const handleReaction = (emoji: string) => {
    const userId = session?.user?.id;
    if (!userId) return;
    const reactions = [...(card.reactions ?? [])];
    const existing = reactions.find((r) => r.emoji === emoji);
    if (existing) {
      if (existing.userIds.includes(userId)) {
        existing.userIds = existing.userIds.filter((id) => id !== userId);
        if (existing.userIds.length === 0) {
          reactions.splice(reactions.indexOf(existing), 1);
        }
      } else {
        existing.userIds.push(userId);
      }
    } else {
      reactions.push({ emoji, userIds: [userId] });
    }
    updateCard(card.id, { reactions });
    setShowReactionPicker(false);
    setShowCardMenu(false);
  };

  // Use summary for preview, fall back to first message content
  const messages = card.messages ?? [];
  const rawPreview = card.summary
    || (messages.length > 0 ? messages[0].content.slice(0, 150) : '');
  const contentPreview = stripMentionMarkup(rawPreview);

  // Get tag definitions for color lookup
  const tagDefinitions = channels[card.channelId]?.tagDefinitions ?? [];

  const getTagColorInfo = (tagName: string) => {
    const tagDef = tagDefinitions.find((t) => t.name === tagName);
    return getTagStyles(tagDef?.color ?? 'gray');
  };

  return (
    <>
      {/* ────────────────────────────────────────────────────────────────────
          CRITICAL: Mobile touch configuration - DO NOT CHANGE without testing

          touch-manipulation: allows scroll (horizontal & vertical)
          touch-none when dragging: prevents scroll interference

          This works with TouchSensor's 250ms delay in Board.tsx.
          See Board.tsx sensors comment for full explanation.
          ──────────────────────────────────────────────────────────────────── */}
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        className={`
          card-container
          group relative cursor-grab rounded-md transition-shadow
          select-none
          ${isDragging ? 'touch-none' : 'touch-manipulation'}
          bg-white dark:bg-neutral-900 shadow-sm hover:shadow-md
          ${isDragging ? 'opacity-50 shadow-lg' : ''}
          ${card.isProcessing ? 'card-processing' : ''}
          ${showCardMenu ? 'z-40' : ''}
        `}
      >
        {/* Cover image */}
        {card.coverImageUrl && (
          <div className="overflow-hidden rounded-t-md">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={card.coverImageUrl}
              alt=""
              className="w-full h-32 object-cover cursor-pointer"
              loading="lazy"
              onClick={() => setIsCardDrawerOpen(true)}
            />
          </div>
        )}

        {/* Pinned header */}
        {isPinned && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-100 dark:bg-neutral-800 border-b border-neutral-200/50 dark:border-neutral-700/50">
            <svg className="w-3 h-3 text-neutral-400" fill="currentColor" viewBox="0 0 20 20">
              <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
            <span className="text-[10px] font-medium text-neutral-400 uppercase tracking-wider">Pinned</span>
          </div>
        )}

        {/* Card content with padding */}
        <div className="relative p-3">
        {/* 3-dot menu button */}
        <div className="absolute top-2 right-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity z-10" ref={cardMenuRef}>
          <button
            ref={menuButtonRef}
            onClick={(e) => {
              e.stopPropagation();
              // Compute whether to render menu above or below
              if (menuButtonRef.current) {
                const rect = menuButtonRef.current.getBoundingClientRect();
                const spaceBelow = window.innerHeight - rect.bottom;
                setMenuPosition(spaceBelow < 350 ? 'above' : 'below');
              }
              setShowCardMenu(!showCardMenu);
              setShowSnoozeSubmenu(false);
              setShowMoveChannelPicker(false);
              setShowMoveColumnPicker(false);
              setShowReactSubmenu(false);
            }}
            className="p-1 rounded text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 dark:hover:text-neutral-300 dark:hover:bg-neutral-700"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
            </svg>
          </button>

          {showCardMenu && (
            <div className={`absolute right-0 w-52 bg-white dark:bg-neutral-800 rounded-lg shadow-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden z-50 ${menuPosition === 'above' ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
              {showReactSubmenu ? (
                <div className="p-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowReactSubmenu(false); }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-neutral-500 hover:bg-neutral-50 dark:hover:bg-neutral-700/50 rounded mb-1"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    Back
                  </button>
                  <div className="flex flex-wrap gap-1 justify-center">
                    {REACTION_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        onClick={(e) => { e.stopPropagation(); handleReaction(emoji); }}
                        className="w-8 h-8 flex items-center justify-center rounded hover:bg-neutral-100 dark:hover:bg-neutral-700 text-base"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              ) : showSnoozeSubmenu ? (
                <>
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowSnoozeSubmenu(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-neutral-500 hover:bg-neutral-50 dark:hover:bg-neutral-700/50"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    Back
                  </button>
                  <SnoozePicker onSnooze={handleSnooze} onClose={() => { setShowCardMenu(false); setShowSnoozeSubmenu(false); }} />
                </>
              ) : showMoveColumnPicker ? (
                <>
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowMoveColumnPicker(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-neutral-500 hover:bg-neutral-50 dark:hover:bg-neutral-700/50"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    Back
                  </button>
                  <div className="max-h-48 overflow-y-auto">
                    {(channels[card.channelId]?.columns ?? []).map((col) => (
                      <button
                        key={col.id}
                        onClick={(e) => { e.stopPropagation(); moveCard(card.id, col.id, 0); setShowCardMenu(false); setShowMoveColumnPicker(false); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-700/50 transition-colors"
                      >
                        <span className="truncate">{col.name}</span>
                      </button>
                    ))}
                  </div>
                </>
              ) : showMoveChannelPicker ? (
                <>
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowMoveChannelPicker(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-neutral-500 hover:bg-neutral-50 dark:hover:bg-neutral-700/50"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    Back
                  </button>
                  <div className="max-h-48 overflow-y-auto">
                    {Object.values(channels)
                      .filter((ch) => ch.id !== card.channelId && !ch.sharedBy)
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((ch) => {
                        const targetCol = ch.columns?.[0];
                        return targetCol ? (
                          <button
                            key={ch.id}
                            onClick={(e) => { e.stopPropagation(); moveCardToChannel(card.id, ch.id, targetCol.id); setShowCardMenu(false); setShowMoveChannelPicker(false); }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-700/50 transition-colors"
                          >
                            <span className="truncate">{ch.name}</span>
                          </button>
                        ) : null;
                      })}
                  </div>
                </>
              ) : (
                <>
                  {/* Full screen */}
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowCardMenu(false); router.push(`/channel/${card.channelId}/card/${card.id}`); }}
                    className="w-full flex items-center gap-3 px-3 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-700/50 transition-colors"
                  >
                    <svg className="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" />
                    </svg>
                    Full screen
                  </button>
                  {/* Share */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const url = `${window.location.origin}/channel/${card.channelId}/card/${card.id}`;
                      navigator.clipboard.writeText(url);
                      setCopiedLink(true);
                      setTimeout(() => setCopiedLink(false), 2000);
                      setShowCardMenu(false);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-700/50 transition-colors"
                  >
                    <svg className="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                    </svg>
                    {copiedLink ? 'Link copied!' : 'Share'}
                  </button>
                  {/* Info */}
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowCardMenu(false); setIsCardDrawerOpen(true); }}
                    className="w-full flex items-center gap-3 px-3 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-700/50 transition-colors"
                  >
                    <svg className="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Info
                  </button>
                  <div className="h-px bg-neutral-200 dark:bg-neutral-700 my-1" />
                  {/* Duplicate */}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDuplicate(); }}
                    className="w-full flex items-center gap-3 px-3 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-700/50 transition-colors"
                  >
                    <svg className="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    Duplicate
                  </button>
                  {/* Archive */}
                  <button
                    onClick={(e) => { e.stopPropagation(); archiveCard(card.id); setShowCardMenu(false); }}
                    className="w-full flex items-center gap-3 px-3 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-700/50 transition-colors"
                  >
                    <svg className="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                    </svg>
                    Archive
                  </button>
                  {/* Move to column */}
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowMoveColumnPicker(true); }}
                    className="w-full flex items-center gap-3 px-3 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-700/50 transition-colors"
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
                    onClick={(e) => { e.stopPropagation(); setShowMoveChannelPicker(true); }}
                    className="w-full flex items-center gap-3 px-3 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-700/50 transition-colors"
                  >
                    <svg className="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                    </svg>
                    Move to channel
                    <svg className="w-3 h-3 text-neutral-400 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                  {/* Snooze */}
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowSnoozeSubmenu(true); }}
                    className="w-full flex items-center gap-3 px-3 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-700/50 transition-colors"
                  >
                    <svg className="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Snooze
                    <svg className="w-3 h-3 text-neutral-400 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                  {/* Pin/Unpin */}
                  <button
                    onClick={(e) => { e.stopPropagation(); handlePin(); }}
                    className="w-full flex items-center gap-3 px-3 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-700/50 transition-colors"
                  >
                    <svg className="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                    </svg>
                    {isPinned ? 'Unpin' : 'Pin'}
                  </button>
                  {/* React */}
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowReactSubmenu(true); }}
                    className="w-full flex items-center gap-3 px-3 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-700/50 transition-colors"
                  >
                    <span className="w-4 h-4 flex items-center justify-center text-sm">😀</span>
                    React
                  </button>
                  <div className="h-px bg-neutral-200 dark:bg-neutral-700 my-1" />
                  {/* Delete */}
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowCardMenu(false); setShowDeleteConfirm(true); }}
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

        {/* Clickable content area */}
        <div onClick={() => setIsCardDrawerOpen(true)}>
          {/* Snoozed badge */}
          {card.snoozedUntil && new Date(card.snoozedUntil) > new Date() && (
            <div className="mb-1.5 flex items-center gap-1 text-blue-500 dark:text-blue-400">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-[10px] font-medium">
                Snoozed until {new Date(card.snoozedUntil).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            </div>
          )}
          {/* Tags - above title */}
          {(card.tags ?? []).length > 0 && (
            <div className="mb-1.5 flex flex-wrap gap-1 pr-12">
              {(card.tags ?? []).map((tagName) => {
                const colorInfo = getTagColorInfo(tagName);
                return (
                  <span
                    key={tagName}
                    className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${colorInfo.className ?? ''}`}
                    style={colorInfo.style}
                  >
                    {tagName}
                  </span>
                );
              })}
            </div>
          )}

          <h4 className="text-sm font-medium text-neutral-900 dark:text-white pr-6">
            {card.title}
          </h4>
          {contentPreview && (
            <p className="mt-1 text-xs text-neutral-500 line-clamp-2">
              {contentPreview}
            </p>
          )}
        </div>

        {/* Assignee avatars */}
        {(card.assignedTo ?? []).length > 0 && (
          <div className="mt-2" onClick={() => setIsCardDrawerOpen(true)}>
            <AssigneeAvatars
              userIds={card.assignedTo!}
              members={members}
              size="sm"
            />
          </div>
        )}

        {/* Task progress bar */}
        {cardTasks.length > 0 && (
          <div className="mt-2" onClick={() => setIsCardDrawerOpen(true)}>
            <div className="flex items-center justify-between text-xs text-neutral-500 mb-1">
              <span>{cardTasks.filter(t => t.status === 'done').length}/{cardTasks.length} tasks</span>
              <span>{Math.round((cardTasks.filter(t => t.status === 'done').length / cardTasks.length) * 100)}%</span>
            </div>
            <div className="h-1.5 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 dark:bg-green-600 rounded-full transition-all duration-300"
                style={{ width: `${(cardTasks.filter(t => t.status === 'done').length / cardTasks.length) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Published indicator */}
        {card.isPublic && (
          <div className="mt-2 flex items-center gap-1 text-green-600 dark:text-green-400">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-[10px] font-medium">Published</span>
          </div>
        )}

        {/* Reactions */}
        {(card.reactions ?? []).length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
            {(card.reactions ?? []).map((r) => (
              <button
                key={r.emoji}
                onClick={() => handleReaction(r.emoji)}
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs transition-colors ${
                  r.userIds.includes(session?.user?.id ?? '')
                    ? 'bg-blue-100 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-700'
                    : 'bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700'
                }`}
              >
                <span>{r.emoji}</span>
                <span className="text-neutral-500 dark:text-neutral-400">{r.userIds.length}</span>
              </button>
            ))}
            <button
              onClick={() => setShowReactionPicker(!showReactionPicker)}
              className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
            >
              +
            </button>
            {showReactionPicker && (
              <div className="absolute z-50 mt-6 bg-white dark:bg-neutral-800 rounded-lg shadow-lg border border-neutral-200 dark:border-neutral-700 p-1.5 flex gap-1">
                {REACTION_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => handleReaction(emoji)}
                    className="w-7 h-7 flex items-center justify-center rounded hover:bg-neutral-100 dark:hover:bg-neutral-700 text-sm"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tasks */}
        <div>
          <TaskListOnCard
            cardId={card.id}
            channelId={card.channelId}
            tasks={cardTasks}
            hideCompleted={card.hideCompletedTasks}
            onTaskClick={(task) => {
              setSelectedTask(task);
              setAutoFocusTaskTitle(false);
              setIsTaskDrawerOpen(true);
            }}
            onAddTaskClick={() => {
              const newTask = createTask(card.channelId, card.id, { title: 'Untitled', createdBy: session?.user?.id ?? undefined });
              setSelectedTask(newTask);
              setAutoFocusTaskTitle(true);
              setIsTaskDrawerOpen(true);
            }}
          />
        </div>
        </div>{/* End card content padding wrapper */}
      </div>
      <CardDetailDrawer
        card={card}
        isOpen={isCardDrawerOpen}
        onClose={() => setIsCardDrawerOpen(false)}
      />
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
          setIsCardDrawerOpen(true);
        }}
      />
      <Modal isOpen={showDeleteConfirm} onClose={() => setShowDeleteConfirm(false)} size="sm">
        <div className="p-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
            <svg className="h-6 w-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </div>
          <h3 className="mb-2 text-lg font-semibold text-neutral-900 dark:text-white">Delete card?</h3>
          <p className="mb-6 text-sm text-neutral-500 dark:text-neutral-400">
            This will permanently delete &ldquo;{card.title}&rdquo;. This action cannot be undone.
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmDelete}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors"
            >
              Delete
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
