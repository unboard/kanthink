'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Channel, ChannelChatThread as ThreadType } from '@/lib/types';
import { Drawer } from '@/components/ui/Drawer';
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

type DrawerView = 'chat' | 'history';

interface ChannelChatDrawerProps {
  channel: Channel;
  isOpen: boolean;
  onClose: () => void;
}

export function ChannelChatDrawer({ channel, isOpen, onClose }: ChannelChatDrawerProps) {
  const [view, setView] = useState<DrawerView>('chat');
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [activeThread, setActiveThread] = useState<ThreadType | null>(null);
  const [isLoadingThreads, setIsLoadingThreads] = useState(false);
  const [isLoadingThread, setIsLoadingThread] = useState(false);
  const creatingThread = useRef(false);

  // When drawer opens: create a fresh thread and show chat immediately
  useEffect(() => {
    if (!isOpen) return;
    // Fetch history in background
    fetchThreads();
    // Start a new chat
    createAndSelectThread();
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

  // Create a new thread and select it
  const createAndSelectThread = async () => {
    if (creatingThread.current) return;
    creatingThread.current = true;

    try {
      const res = await fetch('/api/channel-chat/threads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: channel.id }),
      });

      if (res.ok) {
        const newThread = await res.json();
        const summary: ThreadSummary = {
          id: newThread.id,
          channelId: newThread.channelId,
          title: newThread.title,
          messageCount: 0,
          createdAt: newThread.createdAt,
          updatedAt: newThread.updatedAt,
        };
        setThreads((prev) => [summary, ...prev]);
        setActiveThreadId(newThread.id);
        setActiveThread(newThread);
        setView('chat');
      }
    } catch {
      // Silently fail
    } finally {
      creatingThread.current = false;
    }
  };

  // Fetch full thread when selected from history
  const selectThread = useCallback(async (threadId: string) => {
    setActiveThreadId(threadId);
    setIsLoadingThread(true);
    setView('chat');

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
  }, []);

  // Delete thread
  const handleDeleteThread = async (threadId: string) => {
    try {
      await fetch(`/api/channel-chat/threads?threadId=${threadId}`, { method: 'DELETE' });
      setThreads((prev) => prev.filter((t) => t.id !== threadId));
      if (activeThreadId === threadId) {
        // If we deleted the active thread, create a new one
        setActiveThreadId(null);
        setActiveThread(null);
        createAndSelectThread();
      }
    } catch {
      // Silently fail
    }
  };

  // Handle new conversation from history view
  const handleNewThread = () => {
    createAndSelectThread();
  };

  // Handle thread updates from the chat component
  const handleThreadUpdate = useCallback((updated: ThreadType) => {
    setActiveThread(updated);
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

  // Reset state when drawer closes
  useEffect(() => {
    if (!isOpen) {
      setActiveThreadId(null);
      setActiveThread(null);
      setView('chat');
    }
  }, [isOpen]);

  return (
    <Drawer isOpen={isOpen} onClose={onClose} width="lg" hideCloseButton>
      <div className="flex flex-col h-full">
        {view === 'chat' ? (
          /* ── Chat view ── */
          <>
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
                onThreadUpdate={handleThreadUpdate}
                headerActions={
                  <div className="flex items-center gap-1">
                    {/* History button */}
                    <button
                      onClick={() => setView('history')}
                      className="p-1.5 rounded-md text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 dark:hover:text-neutral-300 dark:hover:bg-neutral-800 transition-colors"
                      title="Conversation history"
                    >
                      <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </button>
                    {/* Close button */}
                    <button
                      onClick={onClose}
                      className="p-1.5 rounded-md text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 dark:hover:text-neutral-300 dark:hover:bg-neutral-800 transition-colors"
                      title="Close"
                    >
                      <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                }
              />
            ) : null}
          </>
        ) : (
          /* ── History view ── */
          <>
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-neutral-700">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setView('chat')}
                  className="p-1 text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
                  title="Back to chat"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
                  Conversations
                </h2>
              </div>
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
          </>
        )}
      </div>
    </Drawer>
  );
}
