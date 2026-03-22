'use client';

import { useState, useEffect, useCallback } from 'react';

const AGENT_ID = 'kan-bugs-agent';
const AGENT_NAME = 'Kan';
const AGENT_IMAGE = 'https://res.cloudinary.com/dcht3dytz/image/upload/f_png,w_64,h_64/v1769532115/kanthink-icon_pbne7q.svg';

// Duration to show the status bar after the last agent event
const DISMISS_DELAY = 8000;

function getActionDescription(event: Record<string, unknown>): string {
  const type = event.type as string;
  switch (type) {
    case 'card:update':
      if (event.updates && (event.updates as Record<string, unknown>).messages) return 'Adding a note...';
      if (event.updates && (event.updates as Record<string, unknown>).tags) return 'Updating tags...';
      return 'Updating a card...';
    case 'card:move':
      return 'Moving a card...';
    case 'card:create':
      return 'Creating a card...';
    case 'card:delete':
      return 'Removing a card...';
    default:
      return 'Working...';
  }
}

interface AgentStatusBarProps {
  channelId: string;
}

export function AgentStatusBar({ channelId }: AgentStatusBarProps) {
  const [status, setStatus] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  const handlePusherEvent = useCallback((data: unknown) => {
    const payload = data as { senderId?: string; event?: Record<string, unknown> };
    if (payload?.senderId === AGENT_ID && payload?.event) {
      const description = getActionDescription(payload.event);
      setStatus(description);
      setVisible(true);
    }
  }, []);

  // Auto-dismiss after delay
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => {
      setVisible(false);
      setStatus(null);
    }, DISMISS_DELAY);
    return () => clearTimeout(timer);
  }, [visible, status]);

  // Listen for Pusher events via the store's broadcast handler
  // The ServerSyncProvider already processes Pusher events and applies them to the store.
  // We intercept the raw Pusher events by subscribing to the channel's sync event.
  useEffect(() => {
    // Dynamic import to avoid SSR issues
    let cleanup: (() => void) | null = null;

    const setupListener = async () => {
      try {
        const { onChannelEvent } = await import('@/lib/sync/pusherClient');
        cleanup = onChannelEvent(channelId, (payload: unknown) => {
          handlePusherEvent(payload);
        });
      } catch {
        // Pusher not available — silent fail
      }
    };

    setupListener();
    return () => { cleanup?.(); };
  }, [channelId, handlePusherEvent]);

  if (!visible || !status) return null;

  return (
    <div className="mx-4 sm:mx-6 mb-2 flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800 animate-in fade-in duration-200">
      <img
        src={AGENT_IMAGE}
        alt={AGENT_NAME}
        className="w-5 h-5 rounded-full animate-pulse"
      />
      <span className="text-xs font-medium text-violet-700 dark:text-violet-300">
        {AGENT_NAME}
      </span>
      <span className="text-xs text-violet-500 dark:text-violet-400">
        {status}
      </span>
    </div>
  );
}
