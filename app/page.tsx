'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useStore } from '@/lib/store';
import { useServerSync } from '@/components/providers/ServerSyncProvider';
import { NewChannelOverlay } from '@/components/home/NewChannelOverlay';
import { ConversationalWelcome, type ConversationalWelcomeResultData } from '@/app/prototypes/overlays/ConversationalWelcome';
import { signInWithGoogle } from '@/lib/actions/auth';

const WELCOME_SEEN_KEY = 'kanthink-welcome-seen';

function parseTimestamp(ts: string | undefined | null): number {
  if (!ts) return 0;
  const d = new Date(ts);
  let ms = d.getTime();
  if (!isNaN(ms)) return ms;
  const num = Number(ts);
  if (!isNaN(num)) return num < 4102444800 ? num * 1000 : num;
  return 0;
}

export default function Home() {
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const { isLoading: isServerLoading } = useServerSync();
  const [showNewChannelOverlay, setShowNewChannelOverlay] = useState(false);
  const [showKanHelp, setShowKanHelp] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [hasCheckedWelcome, setHasCheckedWelcome] = useState(false);
  const [hasRedirected, setHasRedirected] = useState(false);

  const createChannel = useStore((s) => s.createChannel);
  const createChannelWithStructure = useStore((s) => s.createChannelWithStructure);
  const channels = useStore((s) => s.channels);
  const hasHydrated = useStore((s) => s._hasHydrated);

  const hasData = Object.keys(channels).length > 0;
  const isFullyLoaded = hasHydrated && (
    hasData ||
    sessionStatus === 'unauthenticated' ||
    (sessionStatus === 'authenticated' && !isServerLoading)
  );

  // Redirect to the most recently modified channel
  useEffect(() => {
    if (!isFullyLoaded || hasRedirected) return;

    const channelList = Object.values(channels)
      .filter(c => !c.isGlobalHelp && !c.isQuickSave);

    if (channelList.length > 0) {
      // Find the most recently updated channel
      const sorted = channelList.sort((a, b) =>
        parseTimestamp(b.updatedAt) - parseTimestamp(a.updatedAt)
      );
      setHasRedirected(true);
      router.replace(`/channel/${sorted[0].id}`);
      return;
    }

    // No channels — check welcome flow
    const hasSeenWelcome = localStorage.getItem(WELCOME_SEEN_KEY);
    if (!hasSeenWelcome) {
      setShowWelcome(true);
    }
    setHasCheckedWelcome(true);
  }, [isFullyLoaded, channels, hasRedirected, router]);

  const handleWelcomeClose = () => {
    localStorage.setItem(WELCOME_SEEN_KEY, 'true');
    setShowWelcome(false);
  };

  const handleConversationalCreate = (result: ConversationalWelcomeResultData) => {
    localStorage.setItem(WELCOME_SEEN_KEY, 'true');
    setShowWelcome(false);
    setShowKanHelp(false);

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

    router.push(`/channel/${channel.id}`);
  };

  // Loading state (while redirecting or loading data)
  if (!isFullyLoaded || (!hasCheckedWelcome && !hasRedirected)) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-violet-500"></div>
      </div>
    );
  }

  // If we have channels, we're redirecting — show spinner
  if (hasData) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-violet-500"></div>
      </div>
    );
  }

  // No channels — show empty state with create option
  return (
    <div className="h-full">
      <div className="relative flex h-full items-center justify-center">
        <div className="relative z-10 text-center">
          <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500/20 to-violet-500/20 backdrop-blur-sm">
            <svg className="h-8 w-8 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-white">No channels yet</h2>
          <p className="mt-2 text-white/50">Create your first channel to get started</p>
          <button
            onClick={() => setShowNewChannelOverlay(true)}
            className="mt-6 rounded-lg bg-violet-600 px-5 py-2.5 font-medium text-white transition-colors hover:bg-violet-700"
          >
            Create channel
          </button>
        </div>
      </div>

      <NewChannelOverlay
        isOpen={showNewChannelOverlay}
        onClose={() => setShowNewChannelOverlay(false)}
        onKanHelp={() => {
          setShowNewChannelOverlay(false);
          setShowKanHelp(true);
        }}
      />

      <ConversationalWelcome
        isOpen={showKanHelp}
        onClose={() => setShowKanHelp(false)}
        onCreate={handleConversationalCreate}
        isSignedIn={!!session}
        signInAction={signInWithGoogle}
        signInRedirectTo="/"
        isWelcome={false}
        existingChannelNames={Object.values(channels).map(c => c.name)}
      />

      <ConversationalWelcome
        isOpen={showWelcome}
        onClose={handleWelcomeClose}
        onCreate={handleConversationalCreate}
        isSignedIn={!!session}
        signInAction={signInWithGoogle}
        signInRedirectTo="/"
        existingChannelNames={Object.values(channels).map(c => c.name)}
      />
    </div>
  );
}
