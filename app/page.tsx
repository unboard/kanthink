'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useStore } from '@/lib/store';
import { ChannelGrid } from '@/components/home/ChannelGrid';
import { NewChannelOverlay } from '@/components/home/NewChannelOverlay';
import { ConversationalWelcome, type ConversationalWelcomeResultData } from '@/app/prototypes/overlays/ConversationalWelcome';
import { signInWithGoogle } from '@/lib/actions/auth';

const WELCOME_SEEN_KEY = 'kanthink-welcome-seen';

export default function Home() {
  const router = useRouter();
  const { data: session } = useSession();
  const [showNewChannelOverlay, setShowNewChannelOverlay] = useState(false);
  const [showKanHelp, setShowKanHelp] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [hasCheckedWelcome, setHasCheckedWelcome] = useState(false);

  const createChannel = useStore((s) => s.createChannel);
  const createChannelWithStructure = useStore((s) => s.createChannelWithStructure);
  const channels = useStore((s) => s.channels);
  const hasHydrated = useStore((s) => s._hasHydrated);

  // Check if user has seen welcome on mount
  useEffect(() => {
    if (!hasHydrated) return;

    const hasSeenWelcome = localStorage.getItem(WELCOME_SEEN_KEY);
    const hasChannels = Object.keys(channels).length > 0;

    // Show welcome if never seen and no channels exist
    if (!hasSeenWelcome && !hasChannels) {
      setShowWelcome(true);
    }
    setHasCheckedWelcome(true);
  }, [hasHydrated, channels]);

  const handleWelcomeClose = () => {
    localStorage.setItem(WELCOME_SEEN_KEY, 'true');
    setShowWelcome(false);
  };

  // Handle channel creation from the conversational flows (welcome or Kan help)
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

  // Don't render until we've checked welcome status
  if (!hasCheckedWelcome) {
    return null;
  }

  return (
    <div className="h-full">
      <ChannelGrid onCreateChannel={() => setShowNewChannelOverlay(true)} />

      {/* New Channel Overlay - shows options for Quick Start, Kan Help, Templates */}
      <NewChannelOverlay
        isOpen={showNewChannelOverlay}
        onClose={() => setShowNewChannelOverlay(false)}
        onKanHelp={() => {
          setShowNewChannelOverlay(false);
          setShowKanHelp(true);
        }}
      />

      {/* Kan Help - Conversational channel creation */}
      <ConversationalWelcome
        isOpen={showKanHelp}
        onClose={() => setShowKanHelp(false)}
        onCreate={handleConversationalCreate}
        isSignedIn={!!session}
        signInAction={signInWithGoogle}
        signInRedirectTo="/"
        isWelcome={false}
      />

      {/* First-time Welcome - Full conversational welcome for new users */}
      <ConversationalWelcome
        isOpen={showWelcome}
        onClose={handleWelcomeClose}
        onCreate={handleConversationalCreate}
        isSignedIn={!!session}
        signInAction={signInWithGoogle}
        signInRedirectTo="/"
      />
    </div>
  );
}
