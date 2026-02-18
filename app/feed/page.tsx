'use client';

import { useEffect, useCallback, useRef } from 'react';
import { useStore } from '@/lib/store';
import { useFeedStore } from '@/lib/feedStore';
import { useToastStore } from '@/lib/toastStore';
import { FeedFilterTabs } from '@/components/feed/FeedFilterTabs';
import { FeedCardList } from '@/components/feed/FeedCardList';
import { FeedCardDetailDrawer } from '@/components/feed/FeedCardDetailDrawer';
import { SaveToChannelSheet } from '@/components/feed/SaveToChannelSheet';

const FETCH_TIMEOUT_MS = 55000; // 55s — just under Vercel's 60s max

async function generateFeed(
  channels: { id: string; name: string; description: string; aiInstructions: string }[],
  channelFilter: string | undefined,
  count: number,
  excludeTitles: string[],
  signal?: AbortSignal
) {
  const response = await fetch('/api/feed/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channels, channelFilter, count, excludeTitles }),
    signal,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || 'Failed to generate feed');
  }

  return data;
}

export default function FeedPage() {
  const channels = useStore((s) => s.channels);
  const channelOrder = useStore((s) => s.channelOrder);

  const activeFilter = useFeedStore((s) => s.activeFilter);
  const isGenerating = useFeedStore((s) => s.isGenerating);
  const isLoadingMore = useFeedStore((s) => s.isLoadingMore);

  const addToast = useToastStore((s) => s.addToast);

  // Use refs for callbacks to avoid stale closures
  const abortRef = useRef<AbortController | null>(null);

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

  // Initial load + re-load on filter change
  useEffect(() => {
    if (!hasChannels) return;

    const channelInfos = getChannelInfos();
    if (channelInfos.length === 0) return;

    // Abort any in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // Timeout: abort if the request takes too long
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const { setIsGenerating, setFeedCards } = useFeedStore.getState();
    setIsGenerating(true);

    const channelFilter = activeFilter === 'all' ? undefined : activeFilter;

    generateFeed(channelInfos, channelFilter, 8, [], controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setFeedCards(data.cards || []);
        }
      })
      .catch((err) => {
        if (controller.signal.aborted) return; // Ignore aborted requests
        console.error('Feed generation error:', err);
        setFeedCards([]);
        addToast('Feed generation failed. Try again.', 'warning');
      })
      .finally(() => {
        clearTimeout(timeout);
        if (!controller.signal.aborted) {
          setIsGenerating(false);
        }
      });

    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [activeFilter, hasChannels, getChannelInfos, addToast]);

  // Load more (infinite scroll)
  const handleLoadMore = useCallback(() => {
    const state = useFeedStore.getState();
    if (state.isGenerating || state.isLoadingMore || !hasChannels) return;

    const channelInfos = getChannelInfos();
    if (channelInfos.length === 0) return;

    const { setIsLoadingMore, appendFeedCards } = useFeedStore.getState();
    setIsLoadingMore(true);

    const channelFilter = state.activeFilter === 'all' ? undefined : state.activeFilter;

    generateFeed(channelInfos, channelFilter, 6, state.shownCardIds)
      .then((data) => {
        appendFeedCards(data.cards || []);
      })
      .catch((err) => {
        console.error('Feed load more error:', err);
      })
      .finally(() => {
        setIsLoadingMore(false);
      });
  }, [hasChannels, getChannelInfos]);

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
