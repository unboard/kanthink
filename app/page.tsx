'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import { Button } from '@/components/ui';
import { StoryWelcomeOverlayV3 } from '@/app/prototypes/overlays/StoryWelcomeOverlayV3';
import { GuidedQuestionnaireOverlay, type GuideResultData } from '@/app/prototypes/overlays/GuidedQuestionnaireOverlay';

const WELCOME_SEEN_KEY = 'kanthink-welcome-seen';

export default function Home() {
  const router = useRouter();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [hasCheckedWelcome, setHasCheckedWelcome] = useState(false);

  const createChannel = useStore((s) => s.createChannel);
  const createChannelWithStructure = useStore((s) => s.createChannelWithStructure);

  // Check if user has seen welcome on mount
  useEffect(() => {
    const hasSeenWelcome = localStorage.getItem(WELCOME_SEEN_KEY);
    if (!hasSeenWelcome) {
      setShowWelcome(true);
    }
    setHasCheckedWelcome(true);
  }, []);

  const handleWelcomeClose = () => {
    localStorage.setItem(WELCOME_SEEN_KEY, 'true');
    setShowWelcome(false);
  };

  const handleWelcomeCreate = () => {
    localStorage.setItem(WELCOME_SEEN_KEY, 'true');
    setShowWelcome(false);
    setIsCreateOpen(true);
  };

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
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white">
          Welcome to Kanthink
        </h1>
        <p className="mt-2 text-neutral-500 dark:text-neutral-400">
          Create a channel to get started
        </p>
        <Button
          className="mt-4"
          onClick={() => setIsCreateOpen(true)}
        >
          Create channel
        </Button>
      </div>

      <GuidedQuestionnaireOverlay
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreate={handleCreateChannel}
      />

      <StoryWelcomeOverlayV3
        isOpen={showWelcome}
        onClose={handleWelcomeClose}
        onCreate={handleWelcomeCreate}
      />
    </div>
  );
}
