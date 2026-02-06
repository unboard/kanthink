'use client';

import { useParams } from 'next/navigation';
import { useStore } from '@/lib/store';
import { useServerSync } from '@/components/providers/ServerSyncProvider';
import { Board } from '@/components/board/Board';

export default function ChannelPage() {
  const params = useParams();
  const channelId = params.channelId as string;
  const channel = useStore((s) => s.channels[channelId]);
  const hasHydrated = useStore((s) => s._hasHydrated);
  const { isLoading: isServerLoading } = useServerSync();

  // Wait for store hydration first
  if (!hasHydrated) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-violet-500"></div>
      </div>
    );
  }

  // If we have the channel, render it immediately (don't wait for server sync)
  // This prevents flash when channel is already in localStorage
  if (channel) {
    return <Board channel={channel} />;
  }

  // No channel yet - if still loading from server, show spinner
  if (isServerLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-violet-500"></div>
      </div>
    );
  }

  // Done loading and channel doesn't exist
  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-neutral-500">Channel not found</p>
    </div>
  );
}
