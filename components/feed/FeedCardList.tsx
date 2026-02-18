'use client';

import { useFeedStore } from '@/lib/feedStore';
import { FeedCard } from './FeedCard';
import { useInfiniteScroll } from '@/lib/hooks/useInfiniteScroll';

interface FeedCardListProps {
  onLoadMore: () => void;
  hasChannels: boolean;
}

function SkeletonCard({ height }: { height: string }) {
  return (
    <div className={`rounded-xl bg-neutral-800/50 ${height} skeleton-halftone-dots relative overflow-hidden`}>
      <div className="p-4 flex flex-col gap-3">
        <div className="flex gap-2">
          <div className="skeleton-bar h-4 w-16 rounded-full" />
          <div className="skeleton-bar h-4 w-20 rounded-full" />
        </div>
        <div className="skeleton-bar h-5 w-3/4 rounded" />
        <div className="skeleton-bar h-3 w-full rounded" />
        <div className="skeleton-bar h-3 w-2/3 rounded" />
      </div>
    </div>
  );
}

function LoadingSkeletons() {
  return (
    <div className="flex flex-col gap-4">
      <SkeletonCard height="h-28" />
      <SkeletonCard height="h-72" />
      <SkeletonCard height="h-40" />
      <SkeletonCard height="h-28" />
      <SkeletonCard height="h-72" />
      <SkeletonCard height="h-40" />
    </div>
  );
}

export function FeedCardList({ onLoadMore, hasChannels }: FeedCardListProps) {
  const feedCards = useFeedStore((s) => s.feedCards);
  const feedCardOrder = useFeedStore((s) => s.feedCardOrder);
  const isGenerating = useFeedStore((s) => s.isGenerating);
  const isLoadingMore = useFeedStore((s) => s.isLoadingMore);

  const sentinelRef = useInfiniteScroll({
    onLoadMore,
    enabled: !isGenerating && !isLoadingMore && feedCardOrder.length > 0,
  });

  // Retry: clear feed and toggle filter to re-trigger the useEffect
  const handleRetry = () => {
    const { activeFilter, setActiveFilter } = useFeedStore.getState();
    // Toggle away and back to force a re-fetch
    setActiveFilter(activeFilter === 'all' ? '__retry__' as string : 'all');
    setTimeout(() => setActiveFilter(activeFilter), 50);
  };

  // Empty state: no channels
  if (!hasChannels) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
        <div className="w-16 h-16 mb-4 rounded-2xl bg-neutral-800 flex items-center justify-center">
          <svg className="w-8 h-8 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-neutral-200 mb-2">Your feed starts with channels</h3>
        <p className="text-sm text-neutral-500 max-w-xs">
          Create a channel to tell Kan what you&apos;re interested in. Your feed will be personalized based on your channel topics.
        </p>
      </div>
    );
  }

  // Loading state: initial generation
  if (isGenerating && feedCardOrder.length === 0) {
    return (
      <div className="px-4 py-4">
        <div className="flex items-center gap-2 mb-4 justify-center">
          <div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-neutral-400">Kan is building your feed...</span>
        </div>
        <LoadingSkeletons />
      </div>
    );
  }

  // Empty state: generation complete but no cards
  if (!isGenerating && feedCardOrder.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
        <div className="w-12 h-12 mb-3 rounded-xl bg-neutral-800 flex items-center justify-center">
          <svg className="w-6 h-6 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
        <p className="text-sm text-neutral-400 mb-3">Couldn&apos;t generate feed cards this time.</p>
        <button
          onClick={handleRetry}
          className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 px-4 py-4">
      {feedCardOrder.map((id) => {
        const card = feedCards[id];
        if (!card) return null;
        return <FeedCard key={id} card={card} />;
      })}

      {/* Loading more indicator */}
      {isLoadingMore && (
        <div className="flex items-center justify-center gap-2 py-6">
          <div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-neutral-400">Loading more...</span>
        </div>
      )}

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} className="h-1" />
    </div>
  );
}
