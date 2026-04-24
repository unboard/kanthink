'use client';

import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNav } from '@/components/providers/NavProvider';
import { NewChannelOverlay } from '@/components/home/NewChannelOverlay';
import { ConversationalWelcome, type ConversationalWelcomeResultData } from '@/app/prototypes/overlays/ConversationalWelcome';
import { useStore } from '@/lib/store';

export function GlobalNewChannelOverlay() {
  const router = useRouter();
  const { showNewChannel, newChannelTargetFolderId, closeNewChannel } = useNav();
  const [showKanHelp, setShowKanHelp] = useState(false);
  const [kanHelpTargetFolderId, setKanHelpTargetFolderId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const createChannel = useStore((s) => s.createChannel);
  const createChannelWithStructure = useStore((s) => s.createChannelWithStructure);
  const moveChannelToFolder = useStore((s) => s.moveChannelToFolder);
  const channels = useStore((s) => s.channels);
  const existingChannelNames = Object.values(channels).map(c => c.name);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleKanHelpCreate = (result: ConversationalWelcomeResultData) => {
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
    if (kanHelpTargetFolderId) {
      moveChannelToFolder(channel.id, kanHelpTargetFolderId);
    }
    setKanHelpTargetFolderId(null);
    setShowKanHelp(false);
    router.push(`/channel/${channel.id}`);
  };

  if (!mounted) return null;

  const content = (
    <>
      <NewChannelOverlay
        isOpen={showNewChannel}
        onClose={closeNewChannel}
        targetFolderId={newChannelTargetFolderId}
        onKanHelp={() => {
          setKanHelpTargetFolderId(newChannelTargetFolderId);
          closeNewChannel();
          setShowKanHelp(true);
        }}
      />
      <ConversationalWelcome
        isOpen={showKanHelp}
        onClose={() => setShowKanHelp(false)}
        onCreate={handleKanHelpCreate}
        isWelcome={false}
        existingChannelNames={existingChannelNames}
      />
    </>
  );

  return createPortal(content, document.body);
}
