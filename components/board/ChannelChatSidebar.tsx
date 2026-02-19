'use client';

import { useState } from 'react';
import { KanthinkIcon } from '@/components/icons/KanthinkIcon';

interface ThreadSummary {
  id: string;
  title: string;
  updatedAt: string;
  messageCount: number;
}

interface ChannelChatSidebarProps {
  threads: ThreadSummary[];
  activeThreadId: string | null;
  onSelectThread: (threadId: string) => void;
  onNewThread: () => void;
  onDeleteThread: (threadId: string) => void;
  isLoading: boolean;
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function ChannelChatSidebar({
  threads,
  activeThreadId,
  onSelectThread,
  onNewThread,
  onDeleteThread,
  isLoading,
}: ChannelChatSidebarProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  return (
    <div className="flex flex-col h-full">
      {/* New conversation button */}
      <div className="p-3 border-b border-neutral-200 dark:border-neutral-700">
        <button
          onClick={onNewThread}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/30 transition-colors text-sm font-medium"
        >
          <KanthinkIcon size={16} className="text-violet-500" />
          New conversation
        </button>
      </div>

      {/* Thread list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse">
                <div className="h-4 bg-neutral-200 dark:bg-neutral-700 rounded w-3/4 mb-1" />
                <div className="h-3 bg-neutral-100 dark:bg-neutral-800 rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : threads.length === 0 ? (
          <div className="p-6 text-center">
            <KanthinkIcon size={32} className="text-neutral-300 dark:text-neutral-600 mx-auto mb-3" />
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              No conversations yet
            </p>
            <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-1">
              Start a conversation with Kan about this channel
            </p>
          </div>
        ) : (
          <div className="py-1">
            {threads.map((thread) => (
              <div
                key={thread.id}
                className="group relative"
              >
                <button
                  onClick={() => onSelectThread(thread.id)}
                  className={`w-full text-left px-3 py-2.5 transition-colors ${
                    activeThreadId === thread.id
                      ? 'bg-violet-50 dark:bg-violet-900/20 border-l-2 border-violet-500'
                      : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/50 border-l-2 border-transparent'
                  }`}
                >
                  <div className="text-sm font-medium text-neutral-800 dark:text-neutral-200 truncate pr-6">
                    {thread.title}
                  </div>
                  <div className="text-xs text-neutral-400 dark:text-neutral-500 mt-0.5">
                    {formatRelativeTime(thread.updatedAt)}
                    {thread.messageCount > 0 && ` · ${thread.messageCount} messages`}
                  </div>
                </button>

                {/* Delete button */}
                {confirmDeleteId === thread.id ? (
                  <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); onDeleteThread(thread.id); setConfirmDeleteId(null); }}
                      className="px-2 py-1 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded hover:bg-red-100 dark:hover:bg-red-900/30"
                    >
                      Delete
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null); }}
                      className="px-2 py-1 text-xs text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(thread.id); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-neutral-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Delete thread"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
