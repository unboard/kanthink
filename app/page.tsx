'use client';

import { useState } from 'react';
import { useStore } from '@/lib/store';
import { useServerSync } from '@/components/providers/ServerSyncProvider';
import { ConversationalWelcome, type ConversationalWelcomeResultData } from '@/app/prototypes/overlays/ConversationalWelcome';
import { OperatorHome } from '@/components/home/OperatorHome';
import { KanthinkIcon } from '@/components/icons/KanthinkIcon';
import { signInWithGoogle } from '@/lib/actions/auth';
import { useStableSessionStatus } from '@/lib/hooks/useStableSessionStatus';
import { useRouter } from 'next/navigation';

const WELCOME_SEEN_KEY = 'kanthink-welcome-seen';

function welcomeSeen() {
  try { return !!localStorage.getItem(WELCOME_SEEN_KEY); } catch { return true; }
}

/**
 * Home is the conversation with Kan. Always.
 *
 * There used to be a "No channels yet" screen for signed-out visitors, and it showed
 * to signed-in people whenever one session check failed — next-auth reports
 * "unauthenticated" on any failed refetch, including the one it does every time you
 * come back to the tab. The status here comes from useStableSessionStatus, which
 * re-checks before believing a sign-out, and the only thing a confirmed sign-out
 * gets is a way to sign in.
 */
export default function Home() {
  const router = useRouter();
  const status = useStableSessionStatus();
  const { isLoading: isServerLoading } = useServerSync();
  const [welcomeDone, setWelcomeDone] = useState(false);

  const createChannel = useStore((s) => s.createChannel);
  const createChannelWithStructure = useStore((s) => s.createChannelWithStructure);
  const channels = useStore((s) => s.channels);
  const hasHydrated = useStore((s) => s._hasHydrated);

  const hasData = Object.keys(channels).length > 0;
  // Ready once we know the real channel list: local channels exist, or the server
  // fetch for a signed-in user has finished.
  const isDataReady = hasHydrated && status === 'authenticated' && (hasData || !isServerLoading);

  // The welcome flow, for a signed-in person with no channels of their own yet.
  // Derived rather than set from an effect; this branch only renders after hydration,
  // so reading localStorage here can't mismatch the server render.
  const ownChannels = Object.values(channels).filter((c) => !c.isGlobalHelp && !c.isQuickSave)
  const showWelcome = isDataReady && !welcomeDone && ownChannels.length === 0 && !welcomeSeen()

  const handleWelcomeClose = () => {
    localStorage.setItem(WELCOME_SEEN_KEY, 'true');
    setWelcomeDone(true);
  };

  const handleConversationalCreate = (result: ConversationalWelcomeResultData) => {
    localStorage.setItem(WELCOME_SEEN_KEY, 'true');
    setWelcomeDone(true);
    const channel = result.structure && result.structure.columns.length > 0
      ? createChannelWithStructure({
          name: result.channelName,
          description: result.channelDescription,
          aiInstructions: result.instructions,
          columns: result.structure.columns,
          instructionCards: result.structure.instructionCards || [],
        })
      : createChannel({
          name: result.channelName,
          description: result.channelDescription,
          aiInstructions: result.instructions,
        });
    router.push(`/channel/${channel.id}`);
  };

  if (status === 'authenticated') {
    return (
      <>
        <OperatorHome />
        <ConversationalWelcome
          isOpen={showWelcome}
          onClose={handleWelcomeClose}
          onCreate={handleConversationalCreate}
          isSignedIn={true}
          signInAction={signInWithGoogle}
          signInRedirectTo="/"
          existingChannelNames={Object.values(channels).map((c) => c.name)}
        />
      </>
    );
  }

  if (status === 'loading' || !hasHydrated) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-violet-500" />
      </div>
    );
  }

  // Confirmed signed out: the way in, and nothing else.
  return (
    <div className="flex h-full flex-col items-center justify-center px-4 text-center">
      <div className="mb-4 inline-flex" style={{ animation: 'kan-float 5s ease-in-out infinite' }}>
        <KanthinkIcon size={48} className="text-white" />
      </div>
      <h1 className="mb-2 text-2xl font-semibold text-white">Sign in to talk to Kan</h1>
      <p className="text-sm text-neutral-500">Your channels, shrooms and conversations are waiting.</p>
      <form action={signInWithGoogle} className="mt-6">
        <input type="hidden" name="redirectTo" value="/" />
        <button type="submit" className="rounded-full bg-violet-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-violet-500">
          Continue with Google
        </button>
      </form>
    </div>
  );
}
