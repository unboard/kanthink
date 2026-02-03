'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  MouseSensor,
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
import { useNav } from '@/components/providers/NavProvider';
import { useStore } from '@/lib/store';
import { useSettingsStore, type Theme } from '@/lib/settingsStore';
import { Button } from '@/components/ui';
import { KanthinkIcon } from '@/components/icons/KanthinkIcon';
import { signInWithGoogle } from '@/lib/actions/auth';
import { ConversationalWelcome, type ConversationalWelcomeResultData } from '@/app/prototypes/overlays/ConversationalWelcome';
import type { Channel } from '@/lib/types';

// ============================================
// SORTABLE CHANNEL ITEM
// ============================================

interface SortableChannelItemProps {
  channel: Channel;
  isActive: boolean;
  onNavigate: () => void;
}

function SortableChannelItem({ channel, isActive, onNavigate }: SortableChannelItemProps) {
  const router = useRouter();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: channel.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleClick = () => {
    // Don't navigate if we're dragging
    if (isDragging) return;
    onNavigate();
    setTimeout(() => router.push(`/channel/${channel.id}`), 50);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={handleClick}
      className={`flex items-center gap-3 p-3 rounded-xl select-none ${
        isDragging
          ? 'opacity-50 shadow-lg bg-white dark:bg-neutral-800 touch-none'
          : 'touch-manipulation'
      } ${isActive
        ? 'bg-violet-100 dark:bg-violet-900/40'
        : 'bg-neutral-50 dark:bg-neutral-800/50 active:bg-neutral-100 dark:active:bg-neutral-800'
      }`}
    >
      {/* Drag handle indicator (visual only) */}
      <div className="text-neutral-300 dark:text-neutral-600 flex-shrink-0">
        <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
          <path d="M7 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
        </svg>
      </div>
      {/* Channel name */}
      <span
        className={`text-sm flex-1 ${
          isActive
            ? 'text-violet-700 dark:text-violet-300 font-medium'
            : 'text-neutral-700 dark:text-neutral-300'
        }`}
      >
        {channel.name}
      </span>
    </div>
  );
}

// ============================================
// CHANNELS LIST WITH DRAG-AND-DROP (modeled after task list)
// ============================================

function ChannelsList({ onClose }: { onClose: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const channels = useStore((s) => s.channels);
  const channelOrder = useStore((s) => s.channelOrder);
  const createChannel = useStore((s) => s.createChannel);
  const createChannelWithStructure = useStore((s) => s.createChannelWithStructure);
  const reorderChannels = useStore((s) => s.reorderChannels);
  const hasHydrated = useStore((s) => s._hasHydrated);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [activeDragChannelId, setActiveDragChannelId] = useState<string | null>(null);

  // Use MouseSensor + TouchSensor (NOT PointerSensor) per CLAUDE.md guidelines
  // PointerSensor breaks mobile drag-drop by hijacking touch events
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragChannelId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragChannelId(null);

    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    if (activeId !== overId) {
      const oldIndex = channelOrder.indexOf(activeId);
      const newIndex = channelOrder.indexOf(overId);

      if (oldIndex !== -1 && newIndex !== -1) {
        reorderChannels(oldIndex, newIndex);
      }
    }
  };

  const activeDragChannel = activeDragChannelId ? channels[activeDragChannelId] : null;

  const rootChannels = channelOrder.map((id) => channels[id]).filter((c) => c && c.status !== 'archived');

  const handleCreateChannel = (result: ConversationalWelcomeResultData) => {
    let channel;

    if (result.structure && result.structure.columns.length > 0) {
      channel = createChannelWithStructure({
        name: result.channelName,
        description: result.channelDescription,
        aiInstructions: result.instructions,
        columns: result.structure.columns,
        instructionCards: result.structure.instructionCards || [],
      });
    } else {
      channel = createChannel({
        name: result.channelName,
        description: result.channelDescription,
        aiInstructions: result.instructions,
      });
    }

    setIsCreateOpen(false);
    onClose();
    setTimeout(() => {
      router.push(`/channel/${channel.id}`);
    }, 50);
  };

  if (!hasHydrated) {
    return <div className="p-6 text-neutral-500">Loading...</div>;
  }

  return (
    <>
      <div className="flex flex-col h-full">
        {/* Channel list with drag-and-drop */}
        <div className="flex-1 px-4 pt-2">
          {rootChannels.length > 0 && (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={rootChannels.map((c) => c.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {rootChannels.map((channel) => (
                    <SortableChannelItem
                      key={channel.id}
                      channel={channel}
                      isActive={pathname === `/channel/${channel.id}`}
                      onNavigate={onClose}
                    />
                  ))}
                </div>
              </SortableContext>
              <DragOverlay>
                {activeDragChannel && (
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-neutral-800 shadow-xl border border-neutral-200 dark:border-neutral-700">
                    <svg className="h-5 w-5 text-neutral-400" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M7 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
                    </svg>
                    <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                      {activeDragChannel.name}
                    </span>
                  </div>
                )}
              </DragOverlay>
            </DndContext>
          )}

          {/* Empty state */}
          {rootChannels.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="w-16 h-16 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center mb-3">
                <svg className="w-8 h-8 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <p className="text-base font-medium text-neutral-800 dark:text-neutral-200">No channels yet</p>
              <p className="text-sm text-neutral-500 mt-1">Create your first channel below</p>
            </div>
          )}
        </div>

        {/* Sticky footer with action button */}
        <div className="flex-shrink-0 sticky bottom-0 bg-white dark:bg-neutral-900 border-t border-neutral-200 dark:border-neutral-800 p-4">
          <button
            onClick={() => setIsCreateOpen(true)}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-violet-600 hover:bg-violet-500 active:bg-violet-700 text-white font-medium transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Channel
          </button>
        </div>
      </div>

      <ConversationalWelcome
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreate={handleCreateChannel}
        isWelcome={false}
      />
    </>
  );
}

function ShroomsList({ onClose }: { onClose: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const instructionCards = useStore((s) => s.instructionCards);
  const channels = useStore((s) => s.channels);
  const currentChannelId = pathname.startsWith('/channel/') ? pathname.split('/')[2] : null;
  const currentChannel = currentChannelId ? channels[currentChannelId] : null;

  const allShrooms = Object.values(instructionCards);
  const channelShrooms = currentChannelId
    ? allShrooms.filter((ic) => ic.channelId === currentChannelId && ic.scope !== 'global')
    : [];
  const globalShrooms = allShrooms.filter((ic) => ic.scope === 'global');

  const handleRun = (shroom: typeof allShrooms[0]) => {
    const targetChannelId = shroom.channelId || currentChannelId;
    if (targetChannelId) {
      onClose();
      requestAnimationFrame(() => {
        router.push(`/channel/${targetChannelId}?shrooms=open&run=${shroom.id}`);
      });
    }
  };

  const handleEdit = (shroom: typeof allShrooms[0]) => {
    const targetChannelId = shroom.channelId || currentChannelId;
    if (targetChannelId) {
      onClose();
      requestAnimationFrame(() => {
        router.push(`/channel/${targetChannelId}?shrooms=open&edit=${shroom.id}`);
      });
    }
  };

  const handleCreate = () => {
    if (currentChannelId) {
      onClose();
      requestAnimationFrame(() => {
        router.push(`/channel/${currentChannelId}?shrooms=open&create=true`);
      });
    }
  };

  // Get target column name for a shroom
  const getTargetInfo = (shroom: typeof allShrooms[0]) => {
    const targetChannel = shroom.channelId ? channels[shroom.channelId] : currentChannel;
    if (!targetChannel) return null;

    if (shroom.target.type === 'column') {
      const target = shroom.target as { type: 'column'; columnId: string };
      const column = targetChannel.columns.find(c => c.id === target.columnId);
      return column?.name || 'Unknown';
    } else if (shroom.target.type === 'board') {
      return 'All columns';
    }
    return null;
  };

  const allChannelShrooms = [...channelShrooms, ...globalShrooms];

  return (
    <div className="flex flex-col h-full">
      {/* Content */}
      <div className="flex-1 p-4 space-y-3">
        {allChannelShrooms.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="w-16 h-16 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center mb-3">
              <KanthinkIcon size={32} className="text-violet-600 dark:text-violet-400" />
            </div>
            <p className="text-base font-medium text-neutral-800 dark:text-neutral-200">No shrooms yet</p>
            <p className="text-sm text-neutral-500 mt-1 text-center">
              {currentChannelId ? 'Add your first AI automation' : 'Open a channel first'}
            </p>
          </div>
        ) : (
          allChannelShrooms.map((shroom) => {
            const targetInfo = getTargetInfo(shroom);
            const isGlobal = shroom.scope === 'global';

            return (
              <div
                key={shroom.id}
                className="relative p-4 rounded-2xl bg-neutral-100 dark:bg-neutral-800/80 border border-neutral-200 dark:border-neutral-700"
              >
                {/* Edit button */}
                <button
                  onClick={() => handleEdit(shroom)}
                  className="absolute top-3 right-3 p-2 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-white hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>

                {/* Title */}
                <h3 className="text-base font-semibold text-neutral-900 dark:text-white pr-10 mb-1">
                  {shroom.title}
                </h3>

                {/* Description */}
                <p className="text-sm text-neutral-500 dark:text-neutral-400 line-clamp-2 mb-3">
                  {shroom.instructions}
                </p>

                {/* Target info */}
                {targetInfo && (
                  <div className="flex items-center gap-2 text-xs text-neutral-400 dark:text-neutral-500 mb-3">
                    <span>→ {targetInfo}</span>
                    {shroom.cardCount && <span>• {shroom.cardCount} cards</span>}
                    {isGlobal && (
                      <span className="px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 text-[10px]">
                        Global
                      </span>
                    )}
                  </div>
                )}

                {/* Run button */}
                <button
                  onClick={() => handleRun(shroom)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 active:bg-violet-700 text-white font-medium transition-colors"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                  </svg>
                  Run Now
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Sticky footer with add button */}
      {currentChannelId && (
        <div className="flex-shrink-0 sticky bottom-0 bg-white dark:bg-neutral-900 border-t border-neutral-200 dark:border-neutral-800 p-4">
          <button
            onClick={handleCreate}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-violet-600 hover:bg-violet-500 active:bg-violet-700 text-white font-medium transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Shroom
          </button>
        </div>
      )}
    </div>
  );
}

function AccountContent({ onClose }: { onClose: () => void }) {
  const { data: session, status } = useSession();
  const pathname = usePathname();

  if (status === 'loading') {
    return <div className="flex-1 flex items-center justify-center text-neutral-500">Loading...</div>;
  }

  if (!session) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <div className="text-6xl mb-4">🔐</div>
          <p className="text-lg font-medium text-neutral-900 dark:text-white mb-1">Sign in to get started</p>
          <p className="text-sm text-neutral-500 mb-6 text-center">Free tier includes 10 AI requests per month</p>
          <form action={signInWithGoogle} className="w-full max-w-xs">
            <input type="hidden" name="redirectTo" value={pathname} />
            <Button type="submit" className="w-full h-12 text-base">
              Sign in with Google
            </Button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 p-6">
        {/* Profile header */}
        <div className="flex items-center gap-4 mb-8">
          {session.user?.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={session.user.image} alt="" className="w-16 h-16 rounded-full" />
          ) : (
            <div className="w-16 h-16 rounded-full bg-violet-100 dark:bg-violet-900 flex items-center justify-center">
              <span className="text-violet-600 dark:text-violet-300 font-semibold text-2xl">
                {session.user?.name?.[0] || '?'}
              </span>
            </div>
          )}
          <div>
            <p className="text-lg font-semibold text-neutral-900 dark:text-white">{session.user?.name || 'User'}</p>
            <p className="text-sm text-neutral-500">{session.user?.email}</p>
          </div>
        </div>

        {/* Plan info */}
        <div className="rounded-2xl bg-neutral-100 dark:bg-neutral-800 p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold text-neutral-900 dark:text-white">
              {session.user?.tier === 'premium' ? 'Premium' : 'Free'} Plan
            </span>
            {session.user?.tier === 'premium' && (
              <span className="px-2 py-1 rounded-full bg-violet-200 dark:bg-violet-800 text-xs font-medium text-violet-700 dark:text-violet-300">
                Active
              </span>
            )}
          </div>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            {session.user?.tier === 'premium' ? '200' : '10'} AI requests per month
          </p>
        </div>
      </div>

      {/* Sticky footer */}
      <div className="flex-shrink-0 sticky bottom-0 bg-white dark:bg-neutral-900 border-t border-neutral-200 dark:border-neutral-800 p-4">
        <Button
          variant="secondary"
          className="w-full h-12 text-base"
          onClick={() => { onClose(); signOut(); }}
        >
          Sign out
        </Button>
      </div>
    </div>
  );
}

function SettingsContent({ onClose }: { onClose: () => void }) {
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 p-6">
        {/* Theme selector */}
        <div className="mb-8">
          <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-4">Theme</p>
          <div className="grid grid-cols-3 gap-3">
            {(['spores', 'stars', 'terminal'] as Theme[]).map((t) => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className={`py-4 px-3 text-sm font-medium rounded-xl border-2 transition-all ${
                  theme === t
                    ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300'
                    : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 active:bg-neutral-100 dark:active:bg-neutral-800'
                }`}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Sticky footer */}
      <div className="flex-shrink-0 sticky bottom-0 bg-white dark:bg-neutral-900 border-t border-neutral-200 dark:border-neutral-800 p-4">
        <Link
          href="/settings"
          onClick={onClose}
          className="flex items-center justify-center gap-2 py-3.5 rounded-xl bg-neutral-100 dark:bg-neutral-800 active:bg-neutral-200 dark:active:bg-neutral-700 font-medium text-neutral-900 dark:text-white"
        >
          <svg className="w-5 h-5 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          All Settings
        </Link>
      </div>
    </div>
  );
}

// ============================================
// MAIN MOBILE FULL-SCREEN PANEL COMPONENT
// ============================================

const PANEL_CONFIG: Record<string, { title: string; subtitle?: string }> = {
  channels: { title: 'Channels' },
  shrooms: { title: 'Shrooms', subtitle: 'AI-powered actions for your board' },
  account: { title: 'Account' },
  settings: { title: 'Settings' },
};

export function MobileBottomSheet() {
  const { activePanel, closePanel } = useNav();
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  // Track when interaction is safe - prevents accidental taps during open animation
  const [isInteractionReady, setIsInteractionReady] = useState(false);

  // Handle open/close with animation
  useEffect(() => {
    if (activePanel) {
      setIsVisible(true);
      setIsInteractionReady(false); // Block interaction until animation completes

      // Start animation after DOM is ready
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsAnimating(true);
        });
      });

      // Allow interaction only after animation completes (200ms)
      // This prevents accidental channel selection from the opening tap
      const interactionTimer = setTimeout(() => {
        setIsInteractionReady(true);
      }, 250); // Slightly longer than 200ms animation

      return () => clearTimeout(interactionTimer);
    } else {
      setIsAnimating(false);
      setIsInteractionReady(false);
      const timer = setTimeout(() => setIsVisible(false), 200);
      return () => clearTimeout(timer);
    }
  }, [activePanel]);

  // Close on route change
  const pathname = usePathname();
  const prevPathname = useRef(pathname);
  useEffect(() => {
    if (prevPathname.current !== pathname && activePanel) {
      closePanel();
    }
    prevPathname.current = pathname;
  }, [pathname, activePanel, closePanel]);

  // Don't render anything if not visible
  if (!isVisible) {
    return null;
  }

  // Use portal to render at document root (escapes any stacking context issues)
  // Full-screen overlay instead of bottom sheet
  return createPortal(
    <div
      className="md:hidden fixed inset-0"
      style={{ zIndex: 9999 }} // Maximum z-index to be above everything
    >
      {/* Full-screen panel - slides in from right like card detail drawer */}
      <div
        className={`absolute inset-0 bg-white dark:bg-neutral-900 flex flex-col transition-transform duration-200 ease-out ${
          isAnimating ? 'translate-x-0' : 'translate-x-full'
        }`}
        style={{
          pointerEvents: isAnimating ? 'auto' : 'none',
        }}
      >
        {/* Header - sticky at top */}
        <div className="flex-shrink-0 sticky top-0 z-10 bg-white dark:bg-neutral-900 flex items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-neutral-800">
          <div className="flex items-center gap-3">
            {activePanel === 'shrooms' && (
              <img
                src="https://res.cloudinary.com/dcht3dytz/image/upload/v1770097904/shrooms_ez2c6v.svg"
                alt=""
                className="w-6 h-6"
              />
            )}
            <div>
              <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
                {activePanel ? PANEL_CONFIG[activePanel]?.title : ''}
              </h2>
              {activePanel && PANEL_CONFIG[activePanel]?.subtitle && (
                <p className="text-xs text-neutral-500">
                  {PANEL_CONFIG[activePanel].subtitle}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={closePanel}
            className="w-8 h-8 flex items-center justify-center rounded-full text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content - scrollable area */}
        {/* This prevents accidental channel selection from the tap that opened the panel */}
        <div
          className="flex-1 overflow-y-auto overscroll-contain"
          style={{
            pointerEvents: isInteractionReady ? 'auto' : 'none',
          }}
        >
          {isAnimating && activePanel === 'channels' && <ChannelsList onClose={closePanel} />}
          {isAnimating && activePanel === 'shrooms' && <ShroomsList onClose={closePanel} />}
          {isAnimating && activePanel === 'account' && <AccountContent onClose={closePanel} />}
          {isAnimating && activePanel === 'settings' && <SettingsContent onClose={closePanel} />}
        </div>

        {/* Safe area spacer for iPhone home indicator */}
        <div className="flex-shrink-0 safe-area-bottom" />
      </div>
    </div>,
    document.body
  );
}
