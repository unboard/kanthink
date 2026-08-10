'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useSession, signIn } from 'next-auth/react';
import { useStore } from '@/lib/store';
import { useServerSync } from '@/components/providers/ServerSyncProvider';
import { useMissingResource } from '@/lib/hooks/useMissingResource';
import { CardDetailDrawer } from '@/components/board/CardDetailDrawer';
import { DeadEnd } from '@/components/ui/DeadEnd';

function Spinner() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-violet-500" />
    </div>
  );
}

function CardContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status: sessionStatus } = useSession();
  const channelId = params.channelId as string;
  const cardId = params.cardId as string;
  const taskId = searchParams.get('task') || undefined;
  const card = useStore((s) => s.cards[cardId]);
  const channel = useStore((s) => s.channels[channelId]);
  const hasHydrated = useStore((s) => s._hasHydrated);
  const { isLoading: isServerLoading } = useServerSync();

  const navigateBack = useCallback(() => router.push(`/channel/${channelId}`), [router, channelId]);

  // Deleting the card you're reading empties this page under you. That's a
  // navigation, not a 404 — so remember we had it and leave, rather than
  // flashing a dead end at someone who just pressed Delete.
  const [hadCard, setHadCard] = useState(false);
  if (card && !hadCard) setHadCard(true);

  useEffect(() => {
    if (!card && hadCard) router.replace(`/channel/${channelId}`);
  }, [card, hadCard, router, channelId]);

  const isPresent = useCallback(() => Boolean(useStore.getState().cards[cardId]), [cardId]);

  const verdict = useMissingResource({
    apiPath: `/api/channels/${channelId}/cards/${cardId}`,
    // Only ask about a card we've never seen, and only once this device has
    // finished loading what it does know.
    enabled: hasHydrated && !isServerLoading && !card && !hadCard,
    isPresent,
  });

  if (!hasHydrated) return <Spinner />;

  if (card) {
    return (
      <CardDetailDrawer
        card={card}
        isOpen
        fullPage
        onClose={navigateBack}
        onNavigateBack={navigateBack}
        initialTaskId={taskId}
      />
    );
  }

  // Gone from under us, or the first sync hasn't finished, or the server hasn't
  // answered yet — all of them are "wait", not "missing".
  if (hadCard || isServerLoading || verdict === 'checking') return <Spinner />;

  // The most useful way out is the board this card was meant to be on, when we
  // know it. Otherwise, home.
  const board = channel
    ? { label: `Back to ${channel.name}`, href: `/channel/${channelId}` }
    : { label: 'Go to your boards', href: '/' };
  const home = channel ? [{ label: 'Go to your boards', href: '/' }] : [];

  if (verdict === 'noAccess') {
    const signedIn = sessionStatus === 'authenticated';
    return (
      <DeadEnd
        fill
        eyebrow="no access · not yours to read"
        title={signedIn ? "This card isn't shared with you." : 'Sign in to see this card.'}
        body={
          signedIn
            ? 'It exists, but on a board this account cannot open. Ask whoever sent the link to share the channel.'
            : "You're signed out, so Kanthink can't tell whether this card is yours."
        }
        actions={
          signedIn
            ? [{ label: 'Go to your boards', href: '/', primary: true }]
            : [
                {
                  label: 'Sign in',
                  primary: true,
                  onClick: () => signIn('google', { callbackUrl: `/channel/${channelId}/card/${cardId}` }),
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
        body="This card may be perfectly fine — we just can't confirm it from here. Check your connection and try again."
        actions={[{ label: 'Try again', onClick: () => window.location.reload(), primary: true }, board]}
      />
    );
  }

  if (verdict === 'stale') {
    return (
      <DeadEnd
        fill
        eyebrow="out of date · reload needed"
        title="This card exists, but this tab is behind."
        body="The server has it and this device's copy hasn't caught up. A reload should bring it in."
        actions={[{ label: 'Reload', onClick: () => window.location.reload(), primary: true }, board]}
      />
    );
  }

  return (
    <DeadEnd
      fill
      eyebrow="404 · no card here"
      title="This card isn't there anymore."
      body="It may have been deleted, or the link may be older than the board. Everything else is where you left it."
      actions={[{ ...board, primary: true }, ...home]}
    />
  );
}

export default function CardPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <CardContent />
    </Suspense>
  );
}
