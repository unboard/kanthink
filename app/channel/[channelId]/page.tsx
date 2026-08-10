'use client';

import { useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useSession, signIn } from 'next-auth/react';
import { useStore } from '@/lib/store';
import { useServerSync } from '@/components/providers/ServerSyncProvider';
import { useMissingResource } from '@/lib/hooks/useMissingResource';
import { Board } from '@/components/board/Board';
import { DeadEnd } from '@/components/ui/DeadEnd';

function Spinner() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-violet-500"></div>
    </div>
  );
}

export default function ChannelPage() {
  const params = useParams();
  const channelId = params.channelId as string;
  const { status: sessionStatus } = useSession();
  const channel = useStore((s) => s.channels[channelId]);
  const hasHydrated = useStore((s) => s._hasHydrated);
  const { isLoading: isServerLoading, error, refetch } = useServerSync();

  const isPresent = useCallback(() => Boolean(useStore.getState().channels[channelId]), [channelId]);

  const verdict = useMissingResource({
    apiPath: `/api/channels/${channelId}`,
    enabled: hasHydrated && !isServerLoading && !error && !channel,
    isPresent,
  });

  // Wait for store hydration first
  if (!hasHydrated) return <Spinner />;

  // If we have the channel, render it immediately (don't wait for server sync)
  // This prevents flash when channel is already in localStorage
  if (channel) return <Board channel={channel} />;

  // No channel yet - if still loading from server, show spinner
  if (isServerLoading) return <Spinner />;

  // If there was an error loading data, show retry option
  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <p className="text-neutral-500 mb-3">Failed to load channel</p>
          <button
            onClick={() => refetch()}
            className="px-4 py-2 text-sm bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Absent from this device's snapshot isn't the same as absent from the
  // database — wait for the server's answer before calling it a 404.
  if (verdict === 'checking') return <Spinner />;

  if (verdict === 'noAccess') {
    const signedIn = sessionStatus === 'authenticated';
    return (
      <DeadEnd
        fill
        eyebrow="no access · not yours to open"
        title={signedIn ? "This channel isn't shared with you." : 'Sign in to see this channel.'}
        body={
          signedIn
            ? 'It exists, but this account cannot open it. Ask whoever sent the link to share it with you.'
            : "You're signed out, so Kanthink can't tell whether this board is yours."
        }
        actions={
          signedIn
            ? [{ label: 'Go to your boards', href: '/', primary: true }]
            : [
                {
                  label: 'Sign in',
                  primary: true,
                  onClick: () => signIn('google', { callbackUrl: `/channel/${channelId}` }),
                },
                { label: 'Go to your boards', href: '/' },
              ]
        }
      />
    );
  }

  if (verdict === 'unreachable') {
    return (
      <DeadEnd
        fill
        eyebrow="offline · can't tell"
        title="Couldn't reach the server."
        body="This board may be perfectly fine — we just can't confirm it from here. Check your connection and try again."
        actions={[
          { label: 'Try again', onClick: () => window.location.reload(), primary: true },
          { label: 'Go to your boards', href: '/' },
        ]}
      />
    );
  }

  if (verdict === 'stale') {
    return (
      <DeadEnd
        fill
        eyebrow="out of date · reload needed"
        title="This board exists, but this tab is behind."
        body="The server has it and this device's copy hasn't caught up. A reload should bring it in."
        actions={[
          { label: 'Reload', onClick: () => window.location.reload(), primary: true },
          { label: 'Go to your boards', href: '/' },
        ]}
      />
    );
  }

  return (
    <DeadEnd
      fill
      eyebrow="404 · no board here"
      title="This channel isn't there anymore."
      body="It may have been deleted, or the link may be older than the board. Your other channels are where you left them."
      actions={[{ label: 'Go to your boards', href: '/', primary: true }]}
    />
  );
}
