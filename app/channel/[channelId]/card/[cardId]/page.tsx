'use client';

import { useParams, useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import { useServerSync } from '@/components/providers/ServerSyncProvider';
import { CardDetailDrawer } from '@/components/board/CardDetailDrawer';

export default function CardPage() {
  const params = useParams();
  const router = useRouter();
  const channelId = params.channelId as string;
  const cardId = params.cardId as string;
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
