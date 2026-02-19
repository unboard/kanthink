'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Channel, ChannelChatThread as ThreadType } from '@/lib/types';
import { Drawer } from '@/components/ui/Drawer';
import { useNav } from '@/components/providers/NavProvider';
import { ChannelChatSidebar } from './ChannelChatSidebar';
import { ChannelChatThread } from './ChannelChatThread';

interface ThreadSummary {
  id: string;
  channelId: string;
  title: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

interface ChannelChatDrawerProps {
  channel: Channel;
  isOpen: boolean;
  onClose: () => void;
}

export function ChannelChatDrawer({ channel, isOpen, onClose }: ChannelChatDrawerProps) {
  const { isMobile } = useNav();
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [activeThread, setActiveThread] = useState<ThreadType | null>(null);
  const [isLoadingThreads, setIsLoadingThreads] = useState(false);
  const [isLoadingThread, setIsLoadingThread] = useState(false);
  const [showChat, setShowChat] = useState(false); // mobile: sidebar vs chat toggle

  // Fetch thread list when drawer opens
  useEffect(() => {
    if (!isOpen) return;
    fetchThreads();
  }, [isOpen, channel.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchThreads = async () => {
    setIsLoadingThreads(true);
    try {
      const res = await fetch(`/api/channel-chat/threads?channelId=${channel.id}`);
      if (res.ok) {
        const data = await res.json();
        setThreads(data);
      }
    } catch {
      // Silently fail
    } finally {
      setIsLoadingThreads(false);
    }
  };

  // Fetch full thread when selected
  const selectThread = useCallback(async (threadId: string) => {
    setActiveThreadId(threadId);
    setIsLoadingThread(true);
    if (isMobile) setShowChat(true);

    try {
      const res = await fetch(`/api/channel-chat/threads?threadId=${threadId}`);
      if (res.ok) {
        const data = await res.json();
        setActiveThread(data);
      }
    } catch {
      // Silently fail
    } finally {
      setIsLoadingThread(false);
    }
  }, [isMobile]);

  // Create new thread
  const handleNewThread = async () => {
    try {
      const res = await fetch('/api/channel-chat/threads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: channel.id }),
      });

      if (res.ok) {
        const newThread = await res.json();
        setThreads((prev) => [
          {
            id: newThread.id,
            channelId: newThread.channelId,
            title: newThread.title,
            messageCount: 0,
            createdAt: newThread.createdAt,
            updatedAt: newThread.updatedAt,
          },
          ...prev,
        ]);
        selectThread(newThread.id);
      }
    } catch {
      // Silently fail
    }
  };

  // Delete thread
  const handleDeleteThread = async (threadId: string) => {
    try {
      await fetch(`/api/channel-chat/threads?threadId=${threadId}`, { method: 'DELETE' });
      setThreads((prev) => prev.filter((t) => t.id !== threadId));
      if (activeThreadId === threadId) {
        setActiveThreadId(null);
        setActiveThread(null);
        if (isMobile) setShowChat(false);
      }
    } catch {
      // Silently fail
    }
  };

  // Handle thread updates from the chat component
  const handleThreadUpdate = useCallback((updated: ThreadType) => {
    setActiveThread(updated);
    // Update the thread list with new title/message count
    setThreads((prev) =>
      prev.map((t) =>
        t.id === updated.id
          ? {
              ...t,
              title: updated.title,
              messageCount: updated.messages.length,
              updatedAt: updated.updatedAt,
            }
          : t,
      ),
    );
  }, []);

  // Handle mobile back
  const handleBack = () => {
    setShowChat(false);
  };

  // Reset state when drawer closes
  useEffect(() => {
    if (!isOpen) {
      setActiveThreadId(null);
      setActiveThread(null);
      setShowChat(false);
    }
  }, [isOpen]);

  return (
    <Drawer isOpen={isOpen} onClose={onClose} width="xl" hideCloseButton>
      <div className="flex h-full">
        {/* Sidebar - hidden on mobile when chat is shown */}
        {(!isMobile || !showChat) && (
          <div className={`${isMobile ? 'w-full' : 'w-64 border-r border-neutral-200 dark:border-neutral-700'} flex-shrink-0`}>
            {/* Drawer header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-neutral-700">
              <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
                Ask Kan
              </h2>
              <button
                onClick={onClose}
                className="p-1.5 rounded-md text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 dark:hover:text-neutral-300 dark:hover:bg-neutral-800 transition-colors"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <ChannelChatSidebar
              threads={threads}
              activeThreadId={activeThreadId}
              onSelectThread={selectThread}
              onNewThread={handleNewThread}
              onDeleteThread={handleDeleteThread}
              isLoading={isLoadingThreads}
            />
          </div>
        )}

        {/* Chat area - hidden on mobile when sidebar is shown */}
        {(!isMobile || showChat) && (
          <div className="flex-1 min-w-0">
            {isLoadingThread ? (
              <div className="flex items-center justify-center h-full">
                <div className="flex gap-1">
                  <div className="w-2 h-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            ) : activeThread ? (
              <ChannelChatThread
                thread={activeThread}
                channel={channel}
                onBack={isMobile ? handleBack : undefined}
                onThreadUpdate={handleThreadUpdate}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-neutral-400 dark:text-neutral-500">
                <div className="text-center">
                  <p className="text-sm">Select a conversation or start a new one</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Drawer>
  );
}
