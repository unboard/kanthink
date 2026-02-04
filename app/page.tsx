'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useStore } from '@/lib/store';
import { ChannelGrid } from '@/components/home/ChannelGrid';
import { ConversationalWelcome, type ConversationalWelcomeResultData } from '@/app/prototypes/overlays/ConversationalWelcome';
import { GuidedQuestionnaireOverlay, type GuideResultData } from '@/app/prototypes/overlays/GuidedQuestionnaireOverlay';
import { signInWithGoogle } from '@/lib/actions/auth';

const WELCOME_SEEN_KEY = 'kanthink-welcome-seen';

export default function Home() {
  const router = useRouter();
  const { data: session } = useSession();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
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

  // Handle channel creation from the conversational welcome flow
  const handleWelcomeCreate = (result: ConversationalWelcomeResultData) => {
    localStorage.setItem(WELCOME_SEEN_KEY, 'true');
    setShowWelcome(false);

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

  // Handle channel creation from the standalone questionnaire (for "Create channel" button)
  const handleCreateChannel = (result: GuideResultData) => {
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
    router.push(`/channel/${channel.id}`);
  };

  // Don't render until we've checked welcome status
  if (!hasCheckedWelcome) {
    return null;
  }

  return (
    <div className="h-full">
      <ChannelGrid onCreateChannel={() => setIsCreateOpen(true)} />

      <GuidedQuestionnaireOverlay
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreate={handleCreateChannel}
      />

      <ConversationalWelcome
        isOpen={showWelcome}
        onClose={handleWelcomeClose}
        onCreate={handleWelcomeCreate}
        isSignedIn={!!session}
        signInAction={signInWithGoogle}
        signInRedirectTo="/"
      />
    </div>
  );
}
