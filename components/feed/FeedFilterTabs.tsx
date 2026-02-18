'use client';

import { useStore } from '@/lib/store';
import { useFeedStore } from '@/lib/feedStore';

export function FeedFilterTabs() {
  const channels = useStore((s) => s.channels);
  const channelOrder = useStore((s) => s.channelOrder);
  const activeFilter = useFeedStore((s) => s.activeFilter);
  const setActiveFilter = useFeedStore((s) => s.setActiveFilter);
  const isGenerating = useFeedStore((s) => s.isGenerating);

  const activeChannels = channelOrder
    .map((id) => channels[id])
    .filter((ch) => ch && ch.status !== 'archived');

  return (
    <div className="sticky top-0 z-10 bg-neutral-900/80 backdrop-blur-md border-b border-neutral-800">
      <div className="max-w-2xl mx-auto px-4">
        <div className="flex gap-1 py-2 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setActiveFilter('all')}
            disabled={isGenerating}
            className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              activeFilter === 'all'
                ? 'bg-violet-600 text-white'
                : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700'
            } ${isGenerating ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            For You
          </button>
          {activeChannels.map((ch) => (
            <button
              key={ch.id}
              onClick={() => setActiveFilter(ch.id)}
              disabled={isGenerating}
              className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                activeFilter === ch.id
                  ? 'bg-violet-600 text-white'
                  : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700'
              } ${isGenerating ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {ch.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
