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

  if (!hasHydrated || isServerLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-neutral-400">Loading...</p>
      </div>
    );
  }

  if (!channel) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-neutral-500">Channel not found</p>
      </div>
    );
  }

  return <Board channel={channel} />;
}
