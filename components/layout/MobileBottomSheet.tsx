'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
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
  type DragOverEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import Image from 'next/image';
import { useNav } from '@/components/providers/NavProvider';
import { useStore } from '@/lib/store';
import { useSettingsStore } from '@/lib/settingsStore';
import { Button } from '@/components/ui';
import { KanthinkIcon } from '@/components/icons/KanthinkIcon';
import { NotificationCenter } from '@/components/notifications/NotificationCenter';
import { signInWithGoogle } from '@/lib/actions/auth';
import { shrooms as marketplaceShrooms } from '@/lib/marketplace-data';
import { useChannelMembers } from '@/lib/hooks/useChannelMembers';
import type { Channel, ChannelStatus, Folder, InstructionTarget, ID, Card, Task } from '@/lib/types';

// ============================================
// STREAK UTILS
// ============================================

function parseTimestamp(ts: string | undefined | null): number {
  if (!ts) return NaN;
  const d = new Date(ts);
  let ms = d.getTime();
  if (!isNaN(ms)) return ms;
  const num = Number(ts);
  if (!isNaN(num)) {
    ms = num < 4102444800 ? num * 1000 : num;
    return ms;
  }
  return NaN;
}

function toLocalDayNum(ms: number): number {
  const d = new Date(ms);
  const local = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.floor(local.getTime() / 86400000);
}

function computeChannelStreak(
  channel: Channel,
  cards: Record<ID, Card>,
  tasks: Record<ID, Task>,
): { hot: number; cold: number } {
  const todayDayNum = toLocalDayNum(Date.now());
  const activeDayNums = new Set<number>();

  const addTs = (ts: string | undefined | null) => {
    const ms = parseTimestamp(ts);
    if (!isNaN(ms)) activeDayNums.add(toLocalDayNum(ms));
  };

  addTs(channel.updatedAt);
  addTs(channel.createdAt);

  for (const card of Object.values(cards)) {
    if (card.channelId === channel.id) addTs(card.updatedAt);
  }
  for (const task of Object.values(tasks)) {
    if (task.channelId === channel.id) addTs(task.updatedAt);
  }

  let hot = 0;
  for (let i = 0; i < 365; i++) {
    if (activeDayNums.has(todayDayNum - i)) hot++;
    else break;
  }

  let cold = 0;
  if (hot === 0 && activeDayNums.size > 0) {
    const maxDayNum = Math.max(...activeDayNums);
    cold = todayDayNum - maxDayNum;
  }

  return { hot, cold };
}

// Prefixes to distinguish item types in dnd-kit
const CHANNEL_PREFIX = 'channel:';
const FOLDER_PREFIX = 'folder:';
const HELP_FOLDER_ID = '__help__';

// ============================================
// SORTABLE CHANNEL ITEM
// ============================================

interface SortableChannelItemProps {
  channel: Channel;
  isActive: boolean;
  onNavigate: () => void;
  indented?: boolean;
  streak?: { hot: number; cold: number };
}

function SortableChannelItem({ channel, isActive, onNavigate, indented, streak }: SortableChannelItemProps) {
  const router = useRouter();
  const { members } = useChannelMembers(channel.id);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `${CHANNEL_PREFIX}${channel.id}` });

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
        indented ? 'ml-6' : ''
      } ${
        isDragging
          ? 'opacity-50 shadow-lg bg-white dark:bg-neutral-800 touch-none z-10'
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
      {/* Channel name + badges */}
      <div className="flex-1 min-w-0">
        <span
          className={`text-sm truncate block ${
            isActive
              ? 'text-violet-700 dark:text-violet-300 font-medium'
              : 'text-neutral-700 dark:text-neutral-300'
          }`}
        >
          {channel.name}
        </span>
      </div>

      {/* Shared badge */}
      {channel.sharedBy && (
        <span className="flex-shrink-0 flex items-center gap-0.5 rounded-full bg-violet-500/15 px-1.5 py-px text-[10px] font-medium text-violet-400">
          <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          {channel.sharedBy.name?.split(' ')[0] || 'Shared'}
        </span>
      )}

      {/* Streak */}
      {streak && (streak.hot > 0 || streak.cold > 0) && (
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {streak.hot > 0 ? (
            <>
              <svg className="w-3 h-3 text-orange-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
              </svg>
              <span className="text-[10px] font-semibold text-orange-400 tabular-nums">{streak.hot}</span>
            </>
          ) : (
            <>
              <svg className="w-3 h-3 text-blue-400/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
              <span className="text-[10px] font-medium text-blue-400/50 tabular-nums">{streak.cold}</span>
            </>
          )}
        </div>
      )}

      {/* Member avatars */}
      {members.length > 0 && (
        <div className="flex items-center -space-x-1 flex-shrink-0">
          {members.slice(0, 3).map((member) => (
            <div key={member.id} className="rounded-full ring-1 ring-neutral-800">
              {member.image ? (
                <Image
                  src={member.image}
                  alt={member.name || 'Member'}
                  width={20}
                  height={20}
                  className="rounded-full"
                />
              ) : (
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-cyan-500 text-[8px] font-bold text-white">
                  {(member.name || 'U').charAt(0).toUpperCase()}
                </div>
              )}
            </div>
          ))}
          {members.length > 3 && (
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-neutral-700 text-[8px] font-medium text-neutral-300 ring-1 ring-neutral-800">
              +{members.length - 3}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================
// HELP FOLDER ITEM (Non-draggable)
// ============================================

interface HelpFolderItemProps {
  folder: Folder;
  channels: Record<string, Channel>;
  pathname: string;
  onNavigate: () => void;
}

function HelpFolderItem({ folder, channels, pathname, onNavigate }: HelpFolderItemProps) {
  const router = useRouter();
  const [isCollapsed, setIsCollapsed] = useState(folder.isCollapsed ?? false);

  const folderChannels = folder.channelIds
    .map((id) => channels[id])
    .filter((c) => c && c.status !== 'archived');

  const handleChannelClick = (channelId: string) => {
    onNavigate();
    setTimeout(() => router.push(`/channel/${channelId}`), 50);
  };

  return (
    <div className="space-y-2">
      {/* Folder header */}
      <div className="flex items-center gap-2 p-3 rounded-xl bg-blue-50 dark:bg-blue-900/30">
        {/* Collapse/expand button */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1 -ml-1 text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300"
        >
          <svg
            className={`w-4 h-4 transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
          </svg>
        </button>

        {/* Help icon */}
        <svg className="w-4 h-4 text-blue-500 dark:text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>

        {/* Folder name */}
        <span className="flex-1 text-sm font-medium text-blue-600 dark:text-blue-400">
          {folder.name}
        </span>

        {/* Channel count */}
        <span className="text-xs text-blue-400 dark:text-blue-500">
          {folderChannels.length}
        </span>
      </div>

      {/* Folder contents */}
      {!isCollapsed && (
        <div className="space-y-2">
          {folderChannels.length === 0 ? (
            <div className="ml-6 px-3 py-2 text-xs text-neutral-400 italic">
              No help channels
            </div>
          ) : (
            folderChannels.map((channel) => (
              <div
                key={channel.id}
                onClick={() => handleChannelClick(channel.id)}
                className={`flex items-center gap-3 p-3 rounded-xl select-none ml-6 ${
                  pathname === `/channel/${channel.id}`
                    ? 'bg-violet-100 dark:bg-violet-900/40'
                    : 'bg-neutral-50 dark:bg-neutral-800/50 active:bg-neutral-100 dark:active:bg-neutral-800'
                }`}
              >
                <span
                  className={`text-sm flex-1 ${
                    pathname === `/channel/${channel.id}`
                      ? 'text-violet-700 dark:text-violet-300 font-medium'
                      : 'text-neutral-700 dark:text-neutral-300'
                  }`}
                >
                  {channel.name}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ============================================
// SORTABLE FOLDER ITEM
// ============================================

interface SortableFolderItemProps {
  folder: Folder;
  channels: Record<string, Channel>;
  pathname: string;
  onToggle: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  onNavigate: () => void;
  isOver?: boolean;
  channelStreaks?: Record<string, { hot: number; cold: number }>;
}

function SortableFolderItem({
  folder,
  channels,
  pathname,
  onToggle,
  onRename,
  onDelete,
  onNavigate,
  isOver,
  channelStreaks,
}: SortableFolderItemProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(folder.name);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `${FOLDER_PREFIX}${folder.id}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const folderChannels = folder.channelIds
    .map((id) => channels[id])
    .filter((c) => c && c.status !== 'archived');

  const handleRename = () => {
    if (editName.trim() && editName.trim() !== folder.name) {
      onRename(editName.trim());
    }
    setIsEditing(false);
  };

  // Channel IDs for sortable context within this folder
  const channelIds = folderChannels.map((c) => `${CHANNEL_PREFIX}${c.id}`);

  return (
    <div ref={setNodeRef} style={style} className="space-y-2">
      {/* Folder header */}
      <div
        {...attributes}
        {...listeners}
        className={`flex items-center gap-2 p-3 rounded-xl select-none ${
          isDragging
            ? 'opacity-50 shadow-lg bg-white dark:bg-neutral-800 touch-none'
            : 'touch-manipulation'
        } ${
          isOver
            ? 'bg-violet-100 dark:bg-violet-900/40 ring-2 ring-violet-400'
            : 'bg-neutral-100 dark:bg-neutral-800'
        }`}
      >
        {/* Collapse/expand button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          className="p-1 -ml-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
        >
          <svg
            className={`w-4 h-4 transition-transform ${folder.isCollapsed ? '' : 'rotate-90'}`}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
          </svg>
        </button>

        {/* Folder icon */}
        <svg className="w-4 h-4 text-neutral-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
        </svg>

        {/* Folder name */}
        {isEditing ? (
          <input
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') handleRename();
              if (e.key === 'Escape') setIsEditing(false);
            }}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 text-sm bg-white dark:bg-neutral-700 px-2 py-1 rounded border border-neutral-300 dark:border-neutral-600 outline-none text-neutral-900 dark:text-white"
            autoFocus
          />
        ) : (
          <span className="flex-1 text-sm font-medium text-neutral-600 dark:text-neutral-300">
            {folder.name}
          </span>
        )}

        {/* Channel count */}
        <span className="text-xs text-neutral-400">
          {folderChannels.length}
        </span>

        {/* Menu button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowMenu(!showMenu);
          }}
          className="p-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
          </svg>
        </button>

        {/* Dropdown menu */}
        {showMenu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
            <div className="absolute right-4 mt-24 z-50 w-36 rounded-xl bg-white dark:bg-neutral-800 shadow-xl border border-neutral-200 dark:border-neutral-700 py-1 overflow-hidden">
              <button
                onClick={() => { setIsEditing(true); setShowMenu(false); }}
                className="w-full px-4 py-2.5 text-left text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700"
              >
                Rename
              </button>
              <button
                onClick={() => { onDelete(); setShowMenu(false); }}
                className="w-full px-4 py-2.5 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                Delete
              </button>
            </div>
          </>
        )}
      </div>

      {/* Folder contents */}
      {!folder.isCollapsed && (
        <SortableContext items={channelIds} strategy={verticalListSortingStrategy}>
          {folderChannels.length === 0 ? (
            <div className="ml-6 px-3 py-2 text-xs text-neutral-400 italic rounded-lg border-2 border-dashed border-neutral-200 dark:border-neutral-700">
              Drag channels here
            </div>
          ) : (
            folderChannels.map((channel) => (
              <SortableChannelItem
                key={channel.id}
                channel={channel}
                isActive={pathname === `/channel/${channel.id}`}
                onNavigate={onNavigate}
                indented
                streak={channelStreaks?.[channel.id]}
              />
            ))
          )}
        </SortableContext>
      )}
    </div>
  );
}

// ============================================
// CHANNELS LIST WITH DRAG-AND-DROP
// ============================================

function ChannelsList({ onClose }: { onClose: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { openNewChannel } = useNav();
  const channels = useStore((s) => s.channels);
  const channelOrder = useStore((s) => s.channelOrder);
  const folders = useStore((s) => s.folders);
  const folderOrder = useStore((s) => s.folderOrder);
  const createFolder = useStore((s) => s.createFolder);
  const updateFolder = useStore((s) => s.updateFolder);
  const deleteFolder = useStore((s) => s.deleteFolder);
  const toggleFolderCollapse = useStore((s) => s.toggleFolderCollapse);
  const moveChannelToFolder = useStore((s) => s.moveChannelToFolder);
  const reorderChannels = useStore((s) => s.reorderChannels);
  const reorderFolders = useStore((s) => s.reorderFolders);
  const reorderChannelInFolder = useStore((s) => s.reorderChannelInFolder);
  const hasHydrated = useStore((s) => s._hasHydrated);
  const cards = useStore((s) => s.cards);
  const tasks = useStore((s) => s.tasks);

  // Compute streaks for all channels
  const channelStreaks = useMemo(() => {
    const streaks: Record<string, { hot: number; cold: number }> = {};
    for (const channel of Object.values(channels)) {
      streaks[channel.id] = computeChannelStreak(channel, cards, tasks);
    }
    return streaks;
  }, [channels, cards, tasks]);

  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  // Use MouseSensor + TouchSensor (NOT PointerSensor) per CLAUDE.md guidelines
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Separate Help folder from user folders
  const helpFolder = folders[HELP_FOLDER_ID];
  const orderedFolders = folderOrder
    .filter((id) => id !== HELP_FOLDER_ID)
    .map((id) => folders[id])
    .filter(Boolean);
  const rootChannels = channelOrder.map((id) => channels[id]).filter((c) => c && c.status !== 'archived');

  // Build all sortable IDs for the main context (excluding Help folder)
  const allSortableIds = [
    ...folderOrder.filter((id) => id !== HELP_FOLDER_ID).map((id) => `${FOLDER_PREFIX}${id}`),
    ...channelOrder.map((id) => `${CHANNEL_PREFIX}${id}`),
  ];

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragOver = (event: DragOverEvent) => {
    setOverId(event.over?.id as string | null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    setOverId(null);

    if (!over || active.id === over.id) return;

    const activeIdStr = active.id as string;
    const overIdStr = over.id as string;

    const isActiveChannel = activeIdStr.startsWith(CHANNEL_PREFIX);
    const isActiveFolder = activeIdStr.startsWith(FOLDER_PREFIX);
    const isOverChannel = overIdStr.startsWith(CHANNEL_PREFIX);
    const isOverFolder = overIdStr.startsWith(FOLDER_PREFIX);

    const activeRealId = activeIdStr.replace(CHANNEL_PREFIX, '').replace(FOLDER_PREFIX, '');
    const overRealId = overIdStr.replace(CHANNEL_PREFIX, '').replace(FOLDER_PREFIX, '');

    // Find which folder a channel is in (if any)
    const findChannelFolder = (channelId: string): string | null => {
      for (const folder of Object.values(folders)) {
        if (folder.channelIds.includes(channelId)) return folder.id;
      }
      return null;
    };

    const overChannelFolder = isOverChannel ? findChannelFolder(overRealId) : null;

    if (isActiveChannel) {
      const activeFolder = findChannelFolder(activeRealId);

      if (isOverFolder) {
        // Dropping channel onto a folder - move it into that folder
        moveChannelToFolder(activeRealId, overRealId);
      } else if (isOverChannel) {
        // Dropping channel onto another channel
        if (activeFolder === overChannelFolder) {
          // Same container - reorder
          if (activeFolder) {
            const folder = folders[activeFolder];
            const oldIndex = folder.channelIds.indexOf(activeRealId);
            const newIndex = folder.channelIds.indexOf(overRealId);
            if (oldIndex !== -1 && newIndex !== -1) {
              reorderChannelInFolder(activeFolder, oldIndex, newIndex);
            }
          } else {
            // Both in root
            const oldIndex = channelOrder.indexOf(activeRealId);
            const newIndex = channelOrder.indexOf(overRealId);
            if (oldIndex !== -1 && newIndex !== -1) {
              reorderChannels(oldIndex, newIndex);
            }
          }
        } else {
          // Different containers - move to the target's folder
          moveChannelToFolder(activeRealId, overChannelFolder);
        }
      }
    } else if (isActiveFolder && isOverFolder) {
      // Reorder folders
      const oldIndex = folderOrder.indexOf(activeRealId);
      const newIndex = folderOrder.indexOf(overRealId);
      if (oldIndex !== -1 && newIndex !== -1) {
        reorderFolders(oldIndex, newIndex);
      }
    }
  };

  // Get active item for overlay
  const activeItem = activeId
    ? activeId.startsWith(CHANNEL_PREFIX)
      ? channels[activeId.replace(CHANNEL_PREFIX, '')]
      : folders[activeId.replace(FOLDER_PREFIX, '')]
    : null;

  // Check if a folder is being hovered over by a channel
  const getHoveredFolderId = (): string | null => {
    if (!overId || !activeId?.startsWith(CHANNEL_PREFIX)) return null;
    if (overId.startsWith(FOLDER_PREFIX)) return overId.replace(FOLDER_PREFIX, '');
    return null;
  };

  const hoveredFolderId = getHoveredFolderId();

  const handleCreateFolder = () => {
    if (newFolderName.trim()) {
      createFolder(newFolderName.trim());
      setNewFolderName('');
      setIsCreatingFolder(false);
    }
  };

  if (!hasHydrated) {
    return <div className="p-6 text-neutral-500">Loading...</div>;
  }

  const hasItems = orderedFolders.length > 0 || rootChannels.length > 0;

  return (
    <>
      <div className="flex flex-col h-full">
        {/* Channel/folder list with drag-and-drop */}
        <div className="flex-1 px-4 pt-2 overflow-y-auto">
          {/* Help folder - rendered outside DndContext, always first */}
          {helpFolder && (
            <div className="mb-4">
              <HelpFolderItem
                folder={helpFolder}
                channels={channels}
                pathname={pathname}
                onNavigate={onClose}
              />
            </div>
          )}

          {hasItems ? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={allSortableIds} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {/* User Folders */}
                  {orderedFolders.map((folder) => (
                    <SortableFolderItem
                      key={folder.id}
                      folder={folder}
                      channels={channels}
                      pathname={pathname}
                      onToggle={() => toggleFolderCollapse(folder.id)}
                      onRename={(name) => updateFolder(folder.id, { name })}
                      onDelete={() => deleteFolder(folder.id)}
                      onNavigate={onClose}
                      isOver={hoveredFolderId === folder.id}
                      channelStreaks={channelStreaks}
                    />
                  ))}

                  {/* Root channels (not in folders) */}
                  {rootChannels.map((channel) => (
                    <SortableChannelItem
                      key={channel.id}
                      channel={channel}
                      isActive={pathname === `/channel/${channel.id}`}
                      onNavigate={onClose}
                      streak={channelStreaks[channel.id]}
                    />
                  ))}
                </div>
              </SortableContext>

              {/* Drag overlay */}
              <DragOverlay>
                {activeItem && 'columns' in activeItem ? (
                  // Channel overlay
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-neutral-800 shadow-xl border border-neutral-200 dark:border-neutral-700">
                    <svg className="h-5 w-5 text-neutral-400" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M7 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
                    </svg>
                    <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                      {(activeItem as Channel).name}
                    </span>
                  </div>
                ) : activeItem && 'channelIds' in activeItem ? (
                  // Folder overlay
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-white dark:bg-neutral-800 shadow-xl border border-neutral-200 dark:border-neutral-700">
                    <svg className="w-4 h-4 text-neutral-400" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                    </svg>
                    <span className="text-sm font-medium text-neutral-600 dark:text-neutral-300">
                      {(activeItem as Folder).name}
                    </span>
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          ) : !helpFolder ? (
            // Empty state - only show if no Help folder either
            <div className="flex flex-col items-center justify-center py-16">
              <div className="w-16 h-16 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center mb-3">
                <svg className="w-8 h-8 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <p className="text-base font-medium text-neutral-800 dark:text-neutral-200">No channels yet</p>
              <p className="text-sm text-neutral-500 mt-1">Create your first channel below</p>
            </div>
          ) : null}

          {/* Create folder input */}
          {isCreatingFolder && (
            <div className="mt-3 flex items-center gap-2">
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateFolder();
                  if (e.key === 'Escape') setIsCreatingFolder(false);
                }}
                onBlur={() => { if (!newFolderName.trim()) setIsCreatingFolder(false); }}
                placeholder="Folder name..."
                className="flex-1 px-3 py-2.5 text-sm bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 rounded-xl text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
                autoFocus
              />
              <button
                onClick={handleCreateFolder}
                className="px-4 py-2.5 bg-violet-600 text-white text-sm font-medium rounded-xl"
              >
                Create
              </button>
            </div>
          )}
        </div>

        {/* Sticky footer with action buttons */}
        <div className="flex-shrink-0 sticky bottom-0 bg-white dark:bg-neutral-900 border-t border-neutral-200 dark:border-neutral-800 p-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => openNewChannel()}
              className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl bg-violet-600 hover:bg-violet-500 active:bg-violet-700 text-white font-medium transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Channel
            </button>
            <button
              onClick={() => setIsCreatingFolder(true)}
              className="flex-shrink-0 w-12 h-12 flex items-center justify-center rounded-xl bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-400 transition-colors"
              title="New Folder"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function ShroomsList({ onClose }: { onClose: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const instructionCards = useStore((s) => s.instructionCards);
  const createInstructionCard = useStore((s) => s.createInstructionCard);
  const channels = useStore((s) => s.channels);
  const currentChannelId = pathname.startsWith('/channel/') ? pathname.split('/')[2] : null;
  const currentChannel = currentChannelId ? channels[currentChannelId] : null;
  const [activeTab, setActiveTab] = useState<'mine' | 'community'>('mine');
  const [communitySearch, setCommunitySearch] = useState('');
  const [addedSlugs, setAddedSlugs] = useState<Set<string>>(new Set());

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

  // Community tab filtering
  const existingTitles = useMemo(() => {
    return new Set(allShrooms.map(s => s.title));
  }, [allShrooms]);

  const filteredCommunityShrooms = useMemo(() => {
    if (!communitySearch) return marketplaceShrooms;
    const q = communitySearch.toLowerCase();
    return marketplaceShrooms.filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.tagline.toLowerCase().includes(q) ||
      s.tags.some(t => t.includes(q))
    );
  }, [communitySearch]);

  const handleAddCommunityShroom = (shroom: typeof marketplaceShrooms[0]) => {
    const target: InstructionTarget = { type: 'column', columnId: '' };
    createInstructionCard('', {
      title: shroom.name,
      instructions: shroom.instructions,
      action: shroom.action,
      target,
      scope: 'global',
    });
    setAddedSlugs(prev => new Set([...prev, shroom.slug]));
  };

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="flex-shrink-0 flex border-b border-neutral-200 dark:border-neutral-800 px-4">
        <button
          onClick={() => setActiveTab('mine')}
          className={`flex-1 py-3 text-sm font-medium text-center transition-colors border-b-2 ${
            activeTab === 'mine'
              ? 'text-violet-600 dark:text-violet-400 border-violet-600 dark:border-violet-400'
              : 'text-neutral-500 border-transparent'
          }`}
        >
          My Shrooms
        </button>
        <button
          onClick={() => setActiveTab('community')}
          className={`flex-1 py-3 text-sm font-medium text-center transition-colors border-b-2 ${
            activeTab === 'community'
              ? 'text-violet-600 dark:text-violet-400 border-violet-600 dark:border-violet-400'
              : 'text-neutral-500 border-transparent'
          }`}
        >
          Community
        </button>
      </div>

      {/* My Shrooms tab */}
      {activeTab === 'mine' && (
        <>
          <div className="flex-1 p-4 space-y-3 overflow-y-auto">
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
                    <div className="absolute top-3 right-3 flex items-center gap-1">
                      <button
                        onClick={() => handleRun(shroom)}
                        className="p-2 rounded-lg text-neutral-400 hover:text-green-600 dark:hover:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M6.5 5.5v9l7-4.5-7-4.5z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleEdit(shroom)}
                        className="p-2 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-white hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                    </div>

                    <h3 className="text-base font-semibold text-neutral-900 dark:text-white pr-20 mb-1">
                      {shroom.title}
                    </h3>

                    <p className="text-sm text-neutral-500 dark:text-neutral-400 line-clamp-2 mb-3">
                      {shroom.instructions}
                    </p>

                    {targetInfo && (
                      <div className="flex items-center gap-2 text-xs text-neutral-400 dark:text-neutral-500">
                        <span>→ {targetInfo}</span>
                        {shroom.cardCount && <span>• {shroom.cardCount} cards</span>}
                        {shroom.isGlobalResource && (
                          <span className="px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-900/50 text-violet-600 dark:text-violet-400 text-[10px] font-medium">
                            by Kanthink
                          </span>
                        )}
                        {isGlobal && !shroom.isGlobalResource && (
                          <span className="px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 text-[10px]">
                            Global
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

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
        </>
      )}

      {/* Community tab */}
      {activeTab === 'community' && (
        <div className="flex-1 p-4 space-y-3 overflow-y-auto">
          {/* Search */}
          <input
            type="text"
            placeholder="Search community shrooms..."
            value={communitySearch}
            onChange={e => setCommunitySearch(e.target.value)}
            className="w-full bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl px-4 py-3 text-sm text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:border-violet-500/40 focus:ring-1 focus:ring-violet-500/20"
          />

          {/* Community shroom list */}
          {filteredCommunityShrooms.map(shroom => {
            const alreadyAdded = existingTitles.has(shroom.name) || addedSlugs.has(shroom.slug);
            return (
              <div
                key={shroom.slug}
                className="flex items-center gap-3 p-4 rounded-2xl bg-neutral-100 dark:bg-neutral-800/80 border border-neutral-200 dark:border-neutral-700"
              >
                <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center text-xl">
                  {shroom.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-sm text-neutral-900 dark:text-white truncate block">
                    {shroom.name}
                  </span>
                  <p className="text-xs text-neutral-500 truncate mt-0.5">{shroom.tagline}</p>
                </div>
                <button
                  onClick={() => handleAddCommunityShroom(shroom)}
                  disabled={alreadyAdded}
                  className={`flex-shrink-0 px-4 py-2 rounded-xl text-xs font-medium transition-colors ${
                    alreadyAdded
                      ? 'bg-neutral-200 dark:bg-neutral-700 text-neutral-400 cursor-default'
                      : 'bg-violet-600 text-white hover:bg-violet-500 active:bg-violet-700'
                  }`}
                >
                  {alreadyAdded ? 'Added' : 'Add'}
                </button>
              </div>
            );
          })}

          {/* Browse full marketplace link */}
          <div className="pt-2 pb-4 text-center">
            <Link
              href="/marketplace"
              onClick={onClose}
              className="inline-flex items-center gap-1.5 text-sm text-violet-500 hover:text-violet-400 transition-colors"
            >
              Browse full marketplace
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </Link>
          </div>
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
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const channels = useStore((s) => s.channels);
  const updateChannel = useStore((s) => s.updateChannel);
  const deleteChannel = useStore((s) => s.deleteChannel);
  const addInstructionRevision = useStore((s) => s.addInstructionRevision);

  const isAdminUser = session?.user?.isAdmin ?? false;

  const currentChannelId = pathname.startsWith('/channel/') ? pathname.split('/')[2] : null;
  const currentChannel = currentChannelId ? channels[currentChannelId] : null;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [aiInstructions, setAiInstructions] = useState('');
  const [status, setStatus] = useState<ChannelStatus>('active');
  const [includeBacksideInAI, setIncludeBacksideInAI] = useState(false);
  const [isGlobalHelp, setIsGlobalHelp] = useState(false);
  const [coverImageUrl, setCoverImageUrl] = useState('');
  const [isGeneratingCover, setIsGeneratingCover] = useState(false);
  const [showCoverPrompt, setShowCoverPrompt] = useState(false);
  const [coverPromptText, setCoverPromptText] = useState('');
  // Mixpanel project picker
  const [dataSources, setDataSources] = useState<Array<{ id: string; provider: string; status: string }>>([]);
  const [mixpanelProjects, setMixpanelProjects] = useState<Array<{ id: number; name: string; mcpEnabled: boolean }>>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);

  // Sync form state when channel changes
  useEffect(() => {
    if (currentChannel) {
      setName(currentChannel.name);
      setDescription(currentChannel.description);
      setAiInstructions(currentChannel.aiInstructions || '');
      setStatus(currentChannel.status);
      setIncludeBacksideInAI(currentChannel.includeBacksideInAI ?? false);
      setIsGlobalHelp(currentChannel.isGlobalHelp ?? false);
      setCoverImageUrl(currentChannel.coverImageUrl || '');
      // Fetch data sources
      fetch(`/api/channels/${currentChannel.id}/data-sources`)
        .then(r => r.json())
        .then(data => {
          const sources = data.sources || [];
          setDataSources(sources);
          if (sources.find((ds: { provider: string }) => ds.provider === 'mixpanel')) {
            setIsLoadingProjects(true);
            fetch(`/api/channels/${currentChannel.id}/data-sources/projects`)
              .then(r => r.json())
              .then(projData => {
                setMixpanelProjects(projData.projects || []);
                setSelectedProjectId(projData.selectedProjectId ?? null);
              })
              .catch(() => {})
              .finally(() => setIsLoadingProjects(false));
          } else {
            setMixpanelProjects([]);
            setSelectedProjectId(null);
          }
        })
        .catch(() => {});
    }
  }, [currentChannel?.id]);

  const handleSave = () => {
    if (!currentChannel || !currentChannelId) return;

    if (aiInstructions.trim() !== (currentChannel.aiInstructions || '')) {
      addInstructionRevision(currentChannelId, aiInstructions.trim(), 'user');
    }

    updateChannel(currentChannelId, {
      name: name.trim() || currentChannel.name,
      description: description.trim(),
      status,
      includeBacksideInAI,
    });
  };

  const handleDelete = () => {
    if (!currentChannel || !currentChannelId) return;
    if (confirm('Are you sure you want to delete this channel?')) {
      deleteChannel(currentChannelId);
      onClose();
      router.push('/');
    }
  };

  const inputClass = "w-full rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 px-3 py-2.5 text-sm text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent";

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {currentChannel ? (
          <>
            {/* Channel Name */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                Channel Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={handleSave}
                className={inputClass}
              />
            </div>

            {/* Cover Image */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                Cover Image
              </label>
              {coverImageUrl ? (
                <div className="relative rounded-xl overflow-hidden aspect-[3/1] bg-neutral-800">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={coverImageUrl} alt="" className="w-full h-full object-cover" />
                  <div className="absolute bottom-2 right-2 flex gap-1.5">
                    <button
                      onClick={async () => {
                        setIsGeneratingCover(true);
                        try {
                          const res = await fetch('/api/generate-image', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ context: name || 'channel', type: 'card' }),
                          });
                          const data = await res.json();
                          if (data.url) {
                            setCoverImageUrl(data.url);
                            if (currentChannelId) updateChannel(currentChannelId, { coverImageUrl: data.url });
                          }
                        } finally { setIsGeneratingCover(false); }
                      }}
                      disabled={isGeneratingCover}
                      className="px-2.5 py-1 rounded-lg bg-white/90 text-neutral-900 text-xs font-medium active:bg-white"
                    >
                      {isGeneratingCover ? 'Generating...' : 'Regenerate'}
                    </button>
                    <button
                      onClick={() => {
                        setCoverImageUrl('');
                        if (currentChannelId) updateChannel(currentChannelId, { coverImageUrl: '' });
                      }}
                      className="px-2.5 py-1 rounded-lg bg-red-500/90 text-white text-xs font-medium active:bg-red-500"
                    >
                      Remove
                    </button>
                  </div>
                  {isGeneratingCover && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <svg className="w-6 h-6 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={async () => {
                        setIsGeneratingCover(true);
                        try {
                          const res = await fetch('/api/generate-image', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ context: name || 'channel', type: 'card' }),
                          });
                          const data = await res.json();
                          if (data.url) {
                            setCoverImageUrl(data.url);
                            if (currentChannelId) updateChannel(currentChannelId, { coverImageUrl: data.url });
                          }
                        } finally { setIsGeneratingCover(false); }
                      }}
                      disabled={isGeneratingCover}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-neutral-500 border border-dashed border-neutral-300 dark:border-neutral-700 rounded-md active:border-violet-400 active:text-violet-400"
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
                      {isGeneratingCover ? 'Generating...' : 'Generate'}
                    </button>
                    <button
                      onClick={() => setShowCoverPrompt(!showCoverPrompt)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-neutral-500 border border-dashed border-neutral-300 dark:border-neutral-700 rounded-md active:border-violet-400 active:text-violet-400"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                      Custom prompt
                    </button>
                    <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-neutral-500 border border-dashed border-neutral-300 dark:border-neutral-700 rounded-md active:border-violet-400 active:text-violet-400 cursor-pointer">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      Upload
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const form = new FormData();
                          form.append('file', file);
                          const res = await fetch('/api/upload-image', { method: 'POST', body: form });
                          const data = await res.json();
                          if (data.url) {
                            setCoverImageUrl(data.url);
                            if (currentChannelId) updateChannel(currentChannelId, { coverImageUrl: data.url });
                          }
                        }}
                      />
                    </label>
                  </div>
                  {showCoverPrompt && (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={coverPromptText}
                        onChange={(e) => setCoverPromptText(e.target.value)}
                        placeholder="Describe the image..."
                        className={`${inputClass} text-xs`}
                      />
                      <button
                        onClick={async () => {
                          if (!coverPromptText.trim()) return;
                          setIsGeneratingCover(true);
                          try {
                            const res = await fetch('/api/generate-image', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ prompt: coverPromptText.trim() }),
                            });
                            const data = await res.json();
                            if (data.url) {
                              setCoverImageUrl(data.url);
                              if (currentChannelId) updateChannel(currentChannelId, { coverImageUrl: data.url });
                            }
                          } finally {
                            setIsGeneratingCover(false);
                            setShowCoverPrompt(false);
                            setCoverPromptText('');
                          }
                        }}
                        disabled={!coverPromptText.trim() || isGeneratingCover}
                        className="px-3 py-2.5 rounded-xl bg-violet-600 text-white text-xs font-medium active:bg-violet-500 disabled:opacity-50"
                      >
                        Go
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Description */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={handleSave}
                rows={2}
                placeholder="What is this channel about?"
                className={`${inputClass} resize-none`}
              />
            </div>

            {/* Show description on board */}
            {description && (
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={typeof window !== 'undefined' && localStorage.getItem(`channel-desc-${currentChannelId}`) === 'visible'}
                  onChange={(e) => {
                    if (currentChannelId) {
                      localStorage.setItem(`channel-desc-${currentChannelId}`, e.target.checked ? 'visible' : 'hidden');
                      window.dispatchEvent(new Event('description-banner-toggle'));
                    }
                  }}
                  className="w-4 h-4 rounded border-neutral-300 text-violet-600 focus:ring-violet-500 dark:border-neutral-600 dark:bg-neutral-800"
                />
                <span className="text-sm text-neutral-600 dark:text-neutral-400">Show description on board</span>
              </label>
            )}

            {/* Status */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value as ChannelStatus);
                  if (currentChannelId) {
                    updateChannel(currentChannelId, { status: e.target.value as ChannelStatus });
                  }
                }}
                className={inputClass}
              >
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="archived">Archived</option>
              </select>
            </div>

            {/* Data Sources */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                Data Sources
              </label>
              {dataSources.find(ds => ds.provider === 'mixpanel') ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between px-3 py-2.5 rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-green-500" />
                      <span className="text-sm font-medium text-neutral-800 dark:text-neutral-200">Mixpanel</span>
                      <span className="text-xs text-green-600 dark:text-green-400">Connected</span>
                    </div>
                    <button
                      onClick={async () => {
                        await fetch(`/api/channels/${currentChannelId}/data-sources?provider=mixpanel`, { method: 'DELETE' });
                        setDataSources(prev => prev.filter(ds => ds.provider !== 'mixpanel'));
                        setMixpanelProjects([]);
                        setSelectedProjectId(null);
                      }}
                      className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400"
                    >
                      Disconnect
                    </button>
                  </div>
                  {/* Mixpanel Project Picker */}
                  {isLoadingProjects ? (
                    <div className="text-xs text-neutral-400 px-3">Loading projects...</div>
                  ) : mixpanelProjects.length > 0 ? (
                    <div className="px-3">
                      <label className="text-xs text-neutral-500 dark:text-neutral-400 mb-1 block">Project</label>
                      <select
                        value={selectedProjectId ?? ''}
                        onChange={async (e) => {
                          const projId = parseInt(e.target.value, 10);
                          const proj = mixpanelProjects.find(p => p.id === projId);
                          if (!proj) return;
                          setSelectedProjectId(projId);
                          await fetch(`/api/channels/${currentChannelId}/data-sources/project`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ projectId: projId, projectName: proj.name }),
                          });
                        }}
                        className="w-full text-sm rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-2 py-1.5 text-neutral-800 dark:text-neutral-200"
                      >
                        <option value="">Select a project...</option>
                        {mixpanelProjects.map(p => (
                          <option key={p.id} value={p.id}>
                            {p.name}{p.mcpEnabled ? '' : ' (MCP not enabled)'}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                </div>
              ) : (
                <a
                  href={`/api/auth/mixpanel?channelId=${currentChannelId}`}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 hover:border-violet-400 transition-colors"
                >
                  <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Mixpanel</span>
                  <span className="text-xs text-neutral-400 ml-auto">Connect →</span>
                </a>
              )}
              <p className="text-xs text-neutral-500 mt-1.5">Connect data sources so AI can query them via @mention.</p>
            </div>

            {/* Include archived cards in AI */}
            <div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeBacksideInAI}
                  onChange={(e) => {
                    setIncludeBacksideInAI(e.target.checked);
                    if (currentChannelId) {
                      updateChannel(currentChannelId, { includeBacksideInAI: e.target.checked });
                    }
                  }}
                  className="w-4 h-4 rounded border-neutral-300 text-violet-600 focus:ring-violet-500 dark:border-neutral-600 dark:bg-neutral-800"
                />
                <div>
                  <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    Include archived cards in AI context
                  </span>
                  <p className="text-xs text-neutral-500">
                    Archived cards will be included in the AI prompt for better context.
                  </p>
                </div>
              </label>
            </div>

            {/* AI Instructions */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                AI Instructions
              </label>
              <textarea
                value={aiInstructions}
                onChange={(e) => setAiInstructions(e.target.value)}
                onBlur={handleSave}
                rows={4}
                placeholder="Tell the AI what kind of content to generate..."
                className={`${inputClass} resize-none`}
              />
              <p className="text-xs text-neutral-500 mt-1.5">
                These instructions guide the AI when generating cards for this channel.
              </p>
            </div>

            {/* Admin: Global Help Toggle */}
            {isAdminUser && (
              <div className="border-t border-neutral-200 dark:border-neutral-800 pt-4">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isGlobalHelp}
                    onChange={(e) => {
                      setIsGlobalHelp(e.target.checked);
                      if (currentChannelId) {
                        updateChannel(currentChannelId, { isGlobalHelp: e.target.checked });
                      }
                    }}
                    className="mt-1 w-4 h-4 rounded border-neutral-300 text-blue-600 focus:ring-blue-500 dark:border-neutral-600 dark:bg-neutral-800"
                  />
                  <div>
                    <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                      Share as Help Resource
                    </span>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      This channel will appear in everyone&apos;s Help folder (read-only)
                    </p>
                  </div>
                </label>
              </div>
            )}

            {/* Delete channel — owner only */}
            {currentChannel.role === 'owner' && (
              <div className="border-t border-neutral-200 dark:border-neutral-800 pt-4">
                <button
                  onClick={handleDelete}
                  className="w-full py-2.5 rounded-xl text-sm font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 active:bg-red-100 dark:active:bg-red-950/50 transition-colors"
                >
                  Delete channel
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-12">
            <svg className="w-10 h-10 mb-3 text-neutral-300 dark:text-neutral-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400">No channel selected</p>
            <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-1">Open a channel to edit its settings</p>
          </div>
        )}
      </div>

      {/* Sticky footer — link to account settings */}
      <div className="flex-shrink-0 sticky bottom-0 bg-white dark:bg-neutral-900 border-t border-neutral-200 dark:border-neutral-800 p-4">
        <Link
          href="/settings"
          onClick={onClose}
          className="flex items-center justify-center gap-2 py-3.5 rounded-xl bg-neutral-100 dark:bg-neutral-800 active:bg-neutral-200 dark:active:bg-neutral-700 font-medium text-neutral-900 dark:text-white"
        >
          <svg className="w-5 h-5 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          Account Settings
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
  notifications: { title: 'Notifications' },
  account: { title: 'Account' },
  settings: { title: 'Settings' },
};

export function MobileBottomSheet() {
  const { activePanel, closePanel, isMobile } = useNav();
  const sheetPathname = usePathname();
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

  // Don't render on marketplace pages or when not visible
  if (sheetPathname.startsWith('/marketplace') || sheetPathname.startsWith('/public') || sheetPathname.startsWith('/play') || !isVisible) {
    return null;
  }

  // Use portal to render at document root (escapes any stacking context issues)
  // Full-screen overlay instead of bottom sheet
  return createPortal(
    <div
      className="md:hidden fixed inset-0"
      style={{ zIndex: 9999 }} // Maximum z-index to be above everything
    >
      {/* Full-screen panel - slides up from bottom */}
      <div
        className={`absolute inset-0 bg-white dark:bg-neutral-900 flex flex-col transition-transform duration-200 ease-out ${
          isAnimating ? 'translate-y-0' : 'translate-y-full'
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
          {isAnimating && activePanel === 'notifications' && <NotificationCenter onClose={closePanel} />}
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
