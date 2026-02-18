'use client';

import { useEffect, useCallback, useRef } from 'react';
import { useStore } from '@/lib/store';
import { useFeedStore } from '@/lib/feedStore';
import { FeedFilterTabs } from '@/components/feed/FeedFilterTabs';
import { FeedCardList } from '@/components/feed/FeedCardList';
import { FeedCardDetailDrawer } from '@/components/feed/FeedCardDetailDrawer';
import { SaveToChannelSheet } from '@/components/feed/SaveToChannelSheet';

async function generateFeed(
  channels: { id: string; name: string; description: string; aiInstructions: string }[],
  channelFilter: string | undefined,
  count: number,
  excludeTitles: string[]
) {
  const response = await fetch('/api/feed/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channels, channelFilter, count, excludeTitles }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to generate feed');
  }

  return response.json();
}

export default function FeedPage() {
  const channels = useStore((s) => s.channels);
  const channelOrder = useStore((s) => s.channelOrder);

  const activeFilter = useFeedStore((s) => s.activeFilter);
  const isGenerating = useFeedStore((s) => s.isGenerating);
  const isLoadingMore = useFeedStore((s) => s.isLoadingMore);
  const setFeedCards = useFeedStore((s) => s.setFeedCards);
  const appendFeedCards = useFeedStore((s) => s.appendFeedCards);
  const setIsGenerating = useFeedStore((s) => s.setIsGenerating);
  const setIsLoadingMore = useFeedStore((s) => s.setIsLoadingMore);
  const shownCardIds = useFeedStore((s) => s.shownCardIds);
  const feedCardOrder = useFeedStore((s) => s.feedCardOrder);

  // Track filter changes to avoid stale closures
  const filterRef = useRef(activeFilter);
  filterRef.current = activeFilter;

  const getChannelInfos = useCallback(() => {
    return channelOrder
      .map((id) => channels[id])
      .filter((ch) => ch && ch.status !== 'archived')
      .map((ch) => ({
        id: ch.id,
        name: ch.name,
        description: ch.description || '',
        aiInstructions: ch.aiInstructions || '',
      }));
  }, [channels, channelOrder]);

  const hasChannels = channelOrder.some((id) => channels[id]?.status !== 'archived');

  // Initial load
  useEffect(() => {
    if (!hasChannels) return;

    const channelInfos = getChannelInfos();
    if (channelInfos.length === 0) return;

    setIsGenerating(true);
    const channelFilter = activeFilter === 'all' ? undefined : activeFilter;

    generateFeed(channelInfos, channelFilter, 15, [])
      .then((data) => {
        // Only apply if filter hasn't changed
        if (filterRef.current === activeFilter) {
          setFeedCards(data.cards || []);
        }
      })
      .catch((err) => {
        console.error('Feed generation error:', err);
        if (filterRef.current === activeFilter) {
          setFeedCards([]);
        }
      })
      .finally(() => {
        if (filterRef.current === activeFilter) {
          setIsGenerating(false);
        }
      });
  }, [activeFilter, hasChannels]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load more (infinite scroll)
  const handleLoadMore = useCallback(() => {
    if (isGenerating || isLoadingMore || !hasChannels) return;

    const channelInfos = getChannelInfos();
    if (channelInfos.length === 0) return;

    setIsLoadingMore(true);
    const channelFilter = filterRef.current === 'all' ? undefined : filterRef.current;
    const currentShownCardIds = useFeedStore.getState().shownCardIds;

    generateFeed(channelInfos, channelFilter, 10, currentShownCardIds)
      .then((data) => {
        appendFeedCards(data.cards || []);
      })
      .catch((err) => {
        console.error('Feed load more error:', err);
      })
      .finally(() => {
        setIsLoadingMore(false);
      });
  }, [isGenerating, isLoadingMore, hasChannels, getChannelInfos, setIsLoadingMore, appendFeedCards]);

  return (
    <main className="h-full overflow-y-auto">
      <FeedFilterTabs />

      <div className="max-w-2xl mx-auto">
        <FeedCardList onLoadMore={handleLoadMore} hasChannels={hasChannels} />
      </div>

      <FeedCardDetailDrawer />
      <SaveToChannelSheet />
    </main>
  );
}
