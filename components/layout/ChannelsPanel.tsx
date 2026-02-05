'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
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
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useStore } from '@/lib/store';
import { Button } from '@/components/ui';
import { NavPanel } from './NavPanel';
import { useNav } from '@/components/providers/NavProvider';
import { ConversationalWelcome, type ConversationalWelcomeResultData } from '@/app/prototypes/overlays/ConversationalWelcome';
import { NewChannelOverlay } from '@/components/home/NewChannelOverlay';
import type { Channel, Folder } from '@/lib/types';

// Prefixes to distinguish item types in dnd-kit
const CHANNEL_PREFIX = 'channel:';
const FOLDER_PREFIX = 'folder:';
const HELP_FOLDER_ID = '__help__';

interface DraggableChannelProps {
  channel: Channel;
  isActive: boolean;
  isOverlay?: boolean;
  onNavigate?: () => void;
}

function DraggableChannel({ channel, isActive, isOverlay, onNavigate }: DraggableChannelProps) {
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
    opacity: isDragging ? 0.3 : 1,
  };

  if (isOverlay) {
    return (
      <div className="flex items-center rounded-md bg-neutral-200 dark:bg-neutral-700 px-2 py-1.5 text-sm text-neutral-900 dark:text-white shadow-lg">
        {channel.name}
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`
        group relative flex items-center rounded-md transition-colors cursor-grab active:cursor-grabbing touch-manipulation
        ${isDragging ? 'touch-none' : ''}
        ${isActive ? 'bg-neutral-200 dark:bg-neutral-800' : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'}
      `}
    >
      <Link
        href={`/channel/${channel.id}`}
        onClick={(e) => {
          e.stopPropagation();
          onNavigate?.();
        }}
        className={`
          flex-1 block py-1.5 px-2 text-sm transition-colors truncate
          ${isActive ? 'text-neutral-900 dark:text-white' : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'}
        `}
      >
        {channel.name}
      </Link>
    </div>
  );
}

interface DraggableFolderProps {
  folder: Folder;
  channels: Record<string, Channel>;
  pathname: string;
  onToggle: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  isOver?: boolean;
  isOverlay?: boolean;
  onNavigate?: () => void;
}

// Non-draggable Help folder component
interface HelpFolderSectionProps {
  folder: Folder;
  channels: Record<string, Channel>;
  pathname: string;
  onNavigate?: () => void;
}

function HelpFolderSection({ folder, channels, pathname, onNavigate }: HelpFolderSectionProps) {
  const [isCollapsed, setIsCollapsed] = useState(folder.isCollapsed ?? false);

  const folderChannels = folder.channelIds
    .map((id) => channels[id])
    .filter((c) => c && c.status !== 'archived');

  return (
    <div className="mb-2">
      <div className="group flex items-center rounded-md transition-colors bg-blue-50 dark:bg-blue-900/20">
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1 text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300"
        >
          <svg
            className={`w-3 h-3 transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
          </svg>
        </button>

        {/* Help icon */}
        <svg className="w-3.5 h-3.5 mr-1 text-blue-500 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>

        <span className="flex-1 text-sm text-blue-600 dark:text-blue-400 font-medium py-1">
          {folder.name}
        </span>
      </div>

      {!isCollapsed && (
        <div className="ml-4 mt-0.5 space-y-0.5">
          {folderChannels.length === 0 ? (
            <div className="px-2 py-1 text-xs text-neutral-400 italic">No help channels</div>
          ) : (
            folderChannels.map((channel) => (
              <div
                key={channel.id}
                className={`
                  group relative flex items-center rounded-md transition-colors
                  ${pathname === `/channel/${channel.id}` ? 'bg-neutral-200 dark:bg-neutral-800' : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'}
                `}
              >
                <Link
                  href={`/channel/${channel.id}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onNavigate?.();
                  }}
                  className={`
                    flex-1 block py-1.5 px-2 text-sm transition-colors truncate
                    ${pathname === `/channel/${channel.id}` ? 'text-neutral-900 dark:text-white' : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'}
                  `}
                >
                  {channel.name}
                </Link>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function DraggableFolder({
  folder,
  channels,
  pathname,
  onToggle,
  onRename,
  onDelete,
  isOver,
  isOverlay,
  onNavigate,
}: DraggableFolderProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(folder.name);
  const [showMenu, setShowMenu] = useState(false);

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
    opacity: isDragging ? 0.3 : 1,
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

  if (isOverlay) {
    return (
      <div className="flex items-center rounded-md bg-neutral-200 dark:bg-neutral-700 px-2 py-1.5 text-sm text-neutral-500 dark:text-neutral-300 shadow-lg">
        <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
          <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
        </svg>
        {folder.name}
      </div>
    );
  }

  // Channel IDs for sortable context within this folder
  const channelIds = folderChannels.map((c) => `${CHANNEL_PREFIX}${c.id}`);

  return (
    <div ref={setNodeRef} style={style} className="mb-1">
      <div
        className={`
          group flex items-center rounded-md transition-colors touch-manipulation
          ${isDragging ? 'touch-none' : ''}
          ${isOver ? 'bg-blue-100 dark:bg-blue-900/30' : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'}
        `}
      >
        <button
          onClick={onToggle}
          className="p-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
        >
          <svg
            className={`w-3 h-3 transition-transform ${folder.isCollapsed ? '' : 'rotate-90'}`}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
          </svg>
        </button>

        {isEditing ? (
          <input
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRename();
              if (e.key === 'Escape') setIsEditing(false);
            }}
            className="flex-1 text-sm bg-transparent border-none outline-none text-neutral-900 dark:text-white py-1"
            autoFocus
          />
        ) : (
          <span
            {...attributes}
            {...listeners}
            className="flex-1 text-sm text-neutral-500 dark:text-neutral-400 py-1 cursor-grab active:cursor-grabbing"
          >
            {folder.name}
          </span>
        )}

        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-1 mr-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-opacity"
          >
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
            </svg>
          </button>
          {showMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
              <div className="absolute right-0 top-6 z-20 w-32 rounded-md bg-white dark:bg-neutral-800 shadow-lg border border-neutral-200 dark:border-neutral-700 py-1">
                <button
                  onClick={() => { setIsEditing(true); setShowMenu(false); }}
                  className="w-full px-3 py-1.5 text-left text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700"
                >
                  Rename
                </button>
                <button
                  onClick={() => { onDelete(); setShowMenu(false); }}
                  className="w-full px-3 py-1.5 text-left text-sm text-red-600 dark:text-red-400 hover:bg-neutral-100 dark:hover:bg-neutral-700"
                >
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {!folder.isCollapsed && (
        <div className="ml-4 mt-0.5 space-y-0.5">
          <SortableContext items={channelIds} strategy={verticalListSortingStrategy}>
            {folderChannels.length === 0 ? (
              <div className="px-2 py-1 text-xs text-neutral-400 italic">Drop channels here</div>
            ) : (
              folderChannels.map((channel) => (
                <DraggableChannel
                  key={channel.id}
                  channel={channel}
                  isActive={pathname === `/channel/${channel.id}`}
                  onNavigate={onNavigate}
                />
              ))
            )}
          </SortableContext>
        </div>
      )}
    </div>
  );
}

export function ChannelsPanel() {
  const pathname = usePathname();
  const router = useRouter();
  const { closePanel } = useNav();
  const channels = useStore((s) => s.channels);
  const channelOrder = useStore((s) => s.channelOrder);
  const folders = useStore((s) => s.folders);
  const folderOrder = useStore((s) => s.folderOrder);
  const createChannel = useStore((s) => s.createChannel);
  const createChannelWithStructure = useStore((s) => s.createChannelWithStructure);
  const createFolder = useStore((s) => s.createFolder);
  const updateFolder = useStore((s) => s.updateFolder);
  const deleteFolder = useStore((s) => s.deleteFolder);
  const toggleFolderCollapse = useStore((s) => s.toggleFolderCollapse);
  const moveChannelToFolder = useStore((s) => s.moveChannelToFolder);
  const reorderChannels = useStore((s) => s.reorderChannels);
  const reorderFolders = useStore((s) => s.reorderFolders);
  const reorderChannelInFolder = useStore((s) => s.reorderChannelInFolder);
  const hasHydrated = useStore((s) => s._hasHydrated);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isKanHelpOpen, setIsKanHelpOpen] = useState(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  // CRITICAL: Use MouseSensor + TouchSensor, NOT PointerSensor
  // PointerSensor breaks mobile scroll (see CLAUDE.md)
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleCreateFolder = () => {
    if (newFolderName.trim()) {
      createFolder(newFolderName.trim());
      setNewFolderName('');
      setIsCreatingFolder(false);
    }
  };

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
    const { over } = event;
    setOverId(over?.id as string | null);
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

    // Find which folder the active channel is in (if any)
    const findChannelFolder = (channelId: string): string | null => {
      for (const folder of Object.values(folders)) {
        if (folder.channelIds.includes(channelId)) return folder.id;
      }
      return null;
    };

    // Find which folder the over channel is in (if any)
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

  // Check if a folder is being hovered over
  const getHoveredFolderId = (): string | null => {
    if (!overId || !activeId?.startsWith(CHANNEL_PREFIX)) return null;
    if (overId.startsWith(FOLDER_PREFIX)) return overId.replace(FOLDER_PREFIX, '');
    return null;
  };

  const hoveredFolderId = getHoveredFolderId();

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
    closePanel();
    router.push(`/channel/${channel.id}`);
  };

  return (
    <>
      <NavPanel panelKey="channels" title="Channels" width="sm">
        <div className="p-2">
          {!hasHydrated ? (
            <div className="px-2 py-1 text-sm text-neutral-400">Loading...</div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
            >
              {/* Help folder - rendered outside DndContext, always first */}
              {helpFolder && (
                <HelpFolderSection
                  folder={helpFolder}
                  channels={channels}
                  pathname={pathname}
                  onNavigate={closePanel}
                />
              )}

              <SortableContext items={allSortableIds} strategy={verticalListSortingStrategy}>
                <nav className="space-y-0.5">
                  {/* User Folders */}
                  {orderedFolders.map((folder) => (
                    <DraggableFolder
                      key={folder.id}
                      folder={folder}
                      channels={channels}
                      pathname={pathname}
                      onToggle={() => toggleFolderCollapse(folder.id)}
                      onRename={(name) => updateFolder(folder.id, { name })}
                      onDelete={() => deleteFolder(folder.id)}
                      isOver={hoveredFolderId === folder.id}
                      onNavigate={closePanel}
                    />
                  ))}

                  {/* Root channels */}
                  {rootChannels.map((channel) => (
                    <DraggableChannel
                      key={channel.id}
                      channel={channel}
                      isActive={pathname === `/channel/${channel.id}`}
                      onNavigate={closePanel}
                    />
                  ))}

                  {/* Empty state */}
                  {orderedFolders.length === 0 && rootChannels.length === 0 && (
                    <div className="px-2 py-1 text-sm text-neutral-400">No channels yet</div>
                  )}

                  {/* Create folder input */}
                  {isCreatingFolder && (
                    <div className="flex items-center gap-1 mt-2">
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
                        className="flex-1 px-2 py-1 text-sm bg-transparent border border-neutral-300 dark:border-neutral-600 rounded-md text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:border-neutral-500"
                        autoFocus
                      />
                    </div>
                  )}
                </nav>
              </SortableContext>

              <DragOverlay>
                {activeItem && 'name' in activeItem && 'columns' in activeItem ? (
                  <DraggableChannel channel={activeItem as Channel} isActive={false} isOverlay />
                ) : activeItem && 'channelIds' in activeItem ? (
                  <DraggableFolder
                    folder={activeItem as Folder}
                    channels={channels}
                    pathname={pathname}
                    onToggle={() => {}}
                    onRename={() => {}}
                    onDelete={() => {}}
                    isOverlay
                  />
                ) : null}
              </DragOverlay>
            </DndContext>
          )}
        </div>

        {/* Bottom action buttons */}
        <div className="sticky bottom-0 bg-neutral-50 dark:bg-neutral-900 border-t border-neutral-200 dark:border-neutral-800 p-2">
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="flex-1 justify-start"
              onClick={() => setIsCreateOpen(true)}
            >
              + Channel
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsCreatingFolder(true)}
              title="New folder"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              </svg>
            </Button>
          </div>
        </div>
      </NavPanel>

      <NewChannelOverlay
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onKanHelp={() => {
          setIsCreateOpen(false);
          setIsKanHelpOpen(true);
        }}
      />

      <ConversationalWelcome
        isOpen={isKanHelpOpen}
        onClose={() => setIsKanHelpOpen(false)}
        onCreate={handleCreateChannel}
        isWelcome={false}
      />
    </>
  );
}
