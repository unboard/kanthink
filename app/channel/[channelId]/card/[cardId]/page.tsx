'use client';

import { Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useStore } from '@/lib/store';
import { useServerSync } from '@/components/providers/ServerSyncProvider';
import { CardDetailDrawer } from '@/components/board/CardDetailDrawer';

function CardContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const channelId = params.channelId as string;
  const cardId = params.cardId as string;
  const taskId = searchParams.get('task') || undefined;
  const card = useStore((s) => s.cards[cardId]);
  const hasHydrated = useStore((s) => s._hasHydrated);
  const { isLoading: isServerLoading } = useServerSync();

  const navigateBack = () => router.push(`/channel/${channelId}`);

  if (!hasHydrated) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-violet-500" />
      </div>
    );
  }

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

  if (isServerLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-violet-500" />
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-neutral-500">Card not found</p>
    </div>
  );
}

export default function CardPage() {
  return (
    <Suspense fallback={
      <div className="flex h-full items-center justify-center">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-violet-500" />
      </div>
    }>
      <CardContent />
    </Suspense>
  );
}
