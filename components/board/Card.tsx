'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
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
import { useSelectionStore } from '@/lib/selectionStore';
import { MobileMenuDrawer, useIsMobile } from './MobileMenuDrawer';
import { Pin } from 'lucide-react';

class CardDrawerErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error('[CardDrawer crash]', error.message, error.stack); }
  render() {
    if (this.state.error) {
      return (
        <div className="p-4 text-red-400 text-sm">
          <p className="font-medium">Card drawer crashed</p>
          <p className="text-red-500/70 text-xs mt-1">{this.state.error.message}</p>
          <button
            onClick={() => this.setState({ error: null })}
            className="mt-2 text-xs text-violet-400 underline"
          >Try again</button>
        </div>
      );
    }
    return this.props.children;
  }
}

const CARD_COLORS: Record<string, string> = {
  red: '#ef4444',
  orange: '#f97316',
  amber: '#f59e0b',
  green: '#22c55e',
  teal: '#14b8a6',
  blue: '#3b82f6',
  purple: '#8b5cf6',
  pink: '#ec4899',
};

interface CardProps {
  card: CardType;
}

export function Card({ card }: CardProps) {
  const router = useRouter();
  const [isCardDrawerOpen, setIsCardDrawerOpen] = useState(false);
  const [isTaskDrawerOpen, setIsTaskDrawerOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [promotedCard, setPromotedCard] = useState<CardType | null>(null);
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
  const isSelected = useSelectionStore((s) => s.selectedCardIds.has(card.id));
  const isSelectionMode = useSelectionStore((s) => s.isSelectionMode);
  const toggleCard = useSelectionStore((s) => s.toggleCard);
  const isMobile = useIsMobile();

  // Long-press to enter selection mode on mobile (800ms, no movement)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressStartPos = useRef<{ x: number; y: number } | null>(null);

  const handleTouchStartForSelection = useCallback((e: React.TouchEvent) => {
    if (!isMobile || isSelectionMode) return; // Only for entering selection mode
    const touch = e.touches[0];
    longPressStartPos.current = { x: touch.clientX, y: touch.clientY };
    longPressTimer.current = setTimeout(() => {
      toggleCard(card.id);
      // Vibrate for feedback if available
      navigator.vibrate?.(50);
    }, 800);
  }, [isMobile, isSelectionMode, card.id, toggleCard]);

  const handleTouchMoveForSelection = useCallback((e: React.TouchEvent) => {
    if (!longPressTimer.current || !longPressStartPos.current) return;
    const touch = e.touches[0];
    const dx = Math.abs(touch.clientX - longPressStartPos.current.x);
    const dy = Math.abs(touch.clientY - longPressStartPos.current.y);
    if (dx > 10 || dy > 10) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleTouchEndForSelection = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  // Close card menu on click outside (desktop only — the MobileMenuDrawer is portaled
  // to document.body, so cardMenuRef.contains(target) is always false for taps inside
  // it. On mobile that race fires setShowCardMenu(false) on mousedown, which slides
  // the bottom sheet off-screen before the button's click event lands — making
  // Delete/Archive/etc. silently no-op. The drawer has its own backdrop that handles
  // outside taps, so we don't need this listener on mobile.
  useEffect(() => {
    if (!showCardMenu || isMobile) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (cardMenuRef.current && !cardMenuRef.current.contains(e.target as Node)) {
        setShowCardMenu(false);
        setShowSnoozeSubmenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showCardMenu, isMobile]);

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
    updateCard(card.id, { pinnedAt: card.pinnedAt ? '' : new Date().toISOString() });
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

  const REACTION_EMOJIS = ['👍', '👎', '❤️', '🔥', '👀', '✅', '🤔', '👏', '🚀', '🎉', '💡', '🍄', '😂'];
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
        style={{
          ...style,
          ...(card.color ? { borderLeftColor: CARD_COLORS[card.color as keyof typeof CARD_COLORS] || card.color } : {}),
        }}
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
          ${!card.isProcessing && card.color ? 'border-l-[3px]' : ''}
          ${isSelected ? 'ring-2 ring-violet-500 dark:ring-violet-400' : ''}
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

        {/* Agent processing indicator */}
        {card.isProcessing && (
          <>
            {/* Background watermark avatar — large, low opacity, bottom-right corner */}
            <img
              src="https://res.cloudinary.com/dcht3dytz/image/upload/f_png,w_128,h_128/v1769532115/kanthink-icon_pbne7q.svg"
              alt=""
              className="absolute bottom-1 right-1 w-16 h-16 opacity-[0.07] pointer-events-none select-none"
            />
            {/* Status text — upper left */}
            <div className="px-3 pt-2 pb-0">
              <span className="text-[10px] font-medium text-violet-500 dark:text-violet-400">
                {card.processingStatus || 'Working...'}
              </span>
            </div>
          </>
        )}

        {/* Selection checkbox — visible on hover or when in selection mode */}
        <div
          className={`absolute top-2 left-2 z-20 transition-opacity ${
            isSelectionMode ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
        >
          <button
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); toggleCard(card.id); }}
            onPointerDown={(e) => e.stopPropagation()}
            className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
              isSelected
                ? 'bg-violet-500 border-violet-500 text-white'
                : 'bg-white/90 dark:bg-neutral-800/90 border-neutral-300 dark:border-neutral-600 hover:border-violet-400'
            }`}
          >
            {isSelected && (
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>
        </div>

        {/* Card content with padding */}
        <div
          className="relative p-3"
          onTouchStart={handleTouchStartForSelection}
          onTouchMove={handleTouchMoveForSelection}
          onTouchEnd={handleTouchEndForSelection}
        >
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
            isMobile ? (
            <MobileMenuDrawer isOpen={showCardMenu} onClose={() => { setShowCardMenu(false); setShowSnoozeSubmenu(false); setShowMoveColumnPicker(false); setShowMoveChannelPicker(false); setShowReactSubmenu(false); }}>
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
                        className="w-10 h-10 flex items-center justify-center rounded hover:bg-neutral-100 dark:hover:bg-neutral-700 text-lg"
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
                  {(channels[card.channelId]?.columns ?? []).map((col) => (
                    <button
                      key={col.id}
                      onClick={(e) => { e.stopPropagation(); moveCard(card.id, col.id, 0); setShowCardMenu(false); setShowMoveColumnPicker(false); }}
                      className="w-full flex items-center gap-2 px-3 py-3 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-700/50 transition-colors"
                    >
                      <span className="truncate">{col.name}</span>
                    </button>
                  ))}
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
                  {Object.values(channels)
                    .filter((ch) => ch.id !== card.channelId && !ch.sharedBy)
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((ch) => {
                      const targetCol = ch.columns?.[0];
                      return targetCol ? (
                        <button
                          key={ch.id}
                          onClick={(e) => { e.stopPropagation(); moveCardToChannel(card.id, ch.id, targetCol.id); setShowCardMenu(false); setShowMoveChannelPicker(false); }}
                          className="w-full flex items-center gap-2 px-3 py-3 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-700/50 transition-colors"
                        >
                          <span className="truncate">{ch.name}</span>
                        </button>
                      ) : null;
                    })}
                </>
              ) : (
                <>
                  <button onClick={(e) => { e.stopPropagation(); setShowCardMenu(false); router.push(`/channel/${card.channelId}/card/${card.id}`); }} className="w-full flex items-center gap-3 px-3 py-3 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-700/50 transition-colors rounded-lg">
                    <svg className="w-5 h-5 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" /></svg>
                    Full screen
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); setShowCardMenu(false); setIsCardDrawerOpen(true); }} className="w-full flex items-center gap-3 px-3 py-3 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-700/50 transition-colors rounded-lg">
                    <svg className="w-5 h-5 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    Info
                  </button>
                  <div className="h-px bg-neutral-200 dark:bg-neutral-700 my-1 mx-2" />
                  <button onClick={(e) => { e.stopPropagation(); setShowMoveColumnPicker(true); }} className="w-full flex items-center gap-3 px-3 py-3 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-700/50 transition-colors rounded-lg">
                    <svg className="w-5 h-5 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    Move to column
                    <svg className="w-3 h-3 text-neutral-400 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); setShowMoveChannelPicker(true); }} className="w-full flex items-center gap-3 px-3 py-3 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-700/50 transition-colors rounded-lg">
                    <svg className="w-5 h-5 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
                    Move to channel
                    <svg className="w-3 h-3 text-neutral-400 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); setShowSnoozeSubmenu(true); }} className="w-full flex items-center gap-3 px-3 py-3 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-700/50 transition-colors rounded-lg">
                    <svg className="w-5 h-5 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    Snooze
                    <svg className="w-3 h-3 text-neutral-400 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); handlePin(); }} className="w-full flex items-center gap-3 px-3 py-3 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-700/50 transition-colors rounded-lg">
                    <Pin className="w-5 h-5 text-neutral-400" />
                    {isPinned ? 'Unpin' : 'Pin'}
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); setShowReactSubmenu(true); }} className="w-full flex items-center gap-3 px-3 py-3 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-700/50 transition-colors rounded-lg">
                    <span className="w-5 h-5 flex items-center justify-center text-sm">😀</span>
                    React
                  </button>
                  {/* Color — mirrors the desktop dropdown so the left-border tint is reachable on mobile too */}
                  <div className="px-3 py-3">
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-2">Color</p>
                    <div className="flex gap-2 flex-wrap">
                      {card.color && (
                        <button
                          onClick={(e) => { e.stopPropagation(); updateCard(card.id, { color: undefined }); setShowCardMenu(false); }}
                          className="w-7 h-7 rounded-full border-2 border-neutral-300 dark:border-neutral-600 flex items-center justify-center hover:border-neutral-500"
                          title="Remove color"
                        >
                          <svg className="w-3.5 h-3.5 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                      {Object.entries(CARD_COLORS).map(([name, hex]) => (
                        <button
                          key={name}
                          onClick={(e) => { e.stopPropagation(); updateCard(card.id, { color: name }); setShowCardMenu(false); }}
                          className={`w-7 h-7 rounded-full border-2 transition-transform active:scale-95 ${card.color === name ? 'border-white dark:border-neutral-200 ring-1 ring-offset-1 ring-neutral-400' : 'border-transparent'}`}
                          style={{ backgroundColor: hex }}
                          title={name}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="h-px bg-neutral-200 dark:bg-neutral-700 my-1 mx-2" />
                  <button onClick={(e) => { e.stopPropagation(); handleDuplicate(); }} className="w-full flex items-center gap-3 px-3 py-3 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-700/50 transition-colors rounded-lg">
                    <svg className="w-5 h-5 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                    Duplicate
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); archiveCard(card.id); setShowCardMenu(false); }} className="w-full flex items-center gap-3 px-3 py-3 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-700/50 transition-colors rounded-lg">
                    <svg className="w-5 h-5 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>
                    Archive
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); setShowCardMenu(false); setShowDeleteConfirm(true); }} className="w-full flex items-center gap-3 px-3 py-3 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors rounded-lg">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    Delete
                  </button>
                </>
              )}
            </MobileMenuDrawer>
            ) : (
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
                  {/* Manage (for widget cards) */}
                  {card.cardType && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setShowCardMenu(false); setIsCardDrawerOpen(true); }}
                      className="w-full flex items-center gap-3 px-3 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-700/50 transition-colors"
                    >
                      <svg className="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      Manage
                    </button>
                  )}
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
                    <Pin className="w-4 h-4 text-neutral-400" />
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
                  {/* Color */}
                  <div className="px-3 py-2">
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-1.5">Color</p>
                    <div className="flex gap-1.5 flex-wrap">
                      {card.color && (
                        <button
                          onClick={(e) => { e.stopPropagation(); updateCard(card.id, { color: undefined }); setShowCardMenu(false); }}
                          className="w-5 h-5 rounded-full border-2 border-neutral-300 dark:border-neutral-600 flex items-center justify-center hover:border-neutral-500"
                          title="Remove color"
                        >
                          <svg className="w-3 h-3 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                      {Object.entries(CARD_COLORS).map(([name, hex]) => (
                        <button
                          key={name}
                          onClick={(e) => { e.stopPropagation(); updateCard(card.id, { color: name }); setShowCardMenu(false); }}
                          className={`w-5 h-5 rounded-full border-2 transition-transform hover:scale-110 ${card.color === name ? 'border-white dark:border-neutral-200 ring-1 ring-offset-1 ring-neutral-400' : 'border-transparent'}`}
                          style={{ backgroundColor: hex }}
                          title={name}
                        />
                      ))}
                    </div>
                  </div>
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
            )
          )}
        </div>

        {/* Clickable content area — in selection mode, tap toggles selection */}
        <div onClick={() => { if (isSelectionMode) { toggleCard(card.id); } else { setIsCardDrawerOpen(true); } }}>
          {/* Pinned chip */}
          {isPinned && (
            <div className="mb-1.5">
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400">
                <Pin className="w-2.5 h-2.5" />
                Pinned
              </span>
            </div>
          )}
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
          {/* Tags - above title (hide "Processing" tag when agent is active) */}
          {(card.tags ?? []).filter(t => !(card.isProcessing && t === 'Processing')).length > 0 && (
            <div className="mb-1.5 flex flex-wrap gap-1 pr-12">
              {(card.tags ?? []).filter(t => !(card.isProcessing && t === 'Processing')).map((tagName) => {
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
      <CardDrawerErrorBoundary>
        <CardDetailDrawer
          card={card}
          isOpen={isCardDrawerOpen}
          onClose={() => setIsCardDrawerOpen(false)}
        />
      </CardDrawerErrorBoundary>
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
        onPromotedToCard={(newCard) => {
          setIsTaskDrawerOpen(false);
          setSelectedTask(null);
          setAutoFocusTaskTitle(false);
          setPromotedCard(newCard);
        }}
      />
      {promotedCard && (
        <CardDrawerErrorBoundary>
          <CardDetailDrawer
            card={promotedCard}
            isOpen={true}
            onClose={() => setPromotedCard(null)}
          />
        </CardDrawerErrorBoundary>
      )}
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
