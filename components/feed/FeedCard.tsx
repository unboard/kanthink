'use client';

import { useState } from 'react';
import type { FeedCard as FeedCardType } from '@/lib/types';
import { useFeedStore } from '@/lib/feedStore';

interface FeedCardProps {
  card: FeedCardType;
}

function TypeChip({ type }: { type: FeedCardType['type'] }) {
  const config = {
    appetizer: { label: 'Quick Bite', className: 'bg-amber-500/20 text-amber-400' },
    main_course: { label: 'Deep Dive', className: 'bg-blue-500/20 text-blue-400' },
    dessert: { label: 'Connection', className: 'bg-pink-500/20 text-pink-400' },
  };
  const { label, className } = config[type];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${className}`}>
      {label}
    </span>
  );
}

function SourceChip({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-neutral-700/50 text-neutral-400">
      {name}
    </span>
  );
}

function getExcerpt(html: string, maxLength: number): string {
  // Strip HTML tags and get plain text excerpt
  const text = html.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ').trim();
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trimEnd() + '...';
}

export function FeedCard({ card }: FeedCardProps) {
  const selectFeedCard = useFeedStore((s) => s.selectFeedCard);
  const setSavingFeedCard = useFeedStore((s) => s.setSavingFeedCard);
  const [imageError, setImageError] = useState(false);

  const handleClick = () => selectFeedCard(card.id);
  const handleSave = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSavingFeedCard(card.id);
  };

  // Appetizer: compact card
  if (card.type === 'appetizer') {
    return (
      <div
        onClick={handleClick}
        className="feed-card-appetizer rounded-xl p-4 cursor-pointer transition-all hover:scale-[1.01] active:scale-[0.99]"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <TypeChip type="appetizer" />
              <SourceChip name={card.sourceChannelName} />
            </div>
            <h3 className="text-base font-semibold text-neutral-100 mb-1">{card.title}</h3>
            <p className="text-sm text-neutral-400 line-clamp-2">{getExcerpt(card.content, 120)}</p>
          </div>
          <button
            onClick={handleSave}
            className="shrink-0 p-1.5 rounded-lg text-neutral-500 hover:text-violet-400 hover:bg-neutral-700/50 transition-colors"
            title="Save to channel"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  // Dessert: gradient accent card
  if (card.type === 'dessert') {
    return (
      <div
        onClick={handleClick}
        className="feed-card-dessert rounded-xl p-5 cursor-pointer transition-all hover:scale-[1.01] active:scale-[0.99]"
      >
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-center gap-2">
            <TypeChip type="dessert" />
            <SourceChip name={card.sourceChannelName} />
          </div>
          <button
            onClick={handleSave}
            className="shrink-0 p-1.5 rounded-lg text-neutral-300/60 hover:text-white hover:bg-white/10 transition-colors"
            title="Save to channel"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
          </button>
        </div>
        <h3 className="text-lg font-bold text-white mb-2">{card.title}</h3>
        <p className="text-sm text-neutral-200/80 line-clamp-3">{getExcerpt(card.content, 180)}</p>
      </div>
    );
  }

  // Main course: full card with cover image
  return (
    <div
      onClick={handleClick}
      className="feed-card-main-course rounded-xl overflow-hidden cursor-pointer transition-all hover:scale-[1.01] active:scale-[0.99]"
    >
      {/* Cover image */}
      {card.coverImageUrl && !imageError ? (
        <div className="relative w-full h-48 overflow-hidden">
          <img
            src={card.coverImageUrl}
            alt=""
            loading="lazy"
            onError={() => setImageError(true)}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-neutral-900/80 to-transparent" />
        </div>
      ) : (
        <div className="w-full h-24 bg-gradient-to-br from-indigo-900/40 to-slate-900/40" />
      )}

      <div className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <TypeChip type="main_course" />
          <SourceChip name={card.sourceChannelName} />
        </div>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-bold text-neutral-100 mb-1.5">{card.title}</h3>
            <p className="text-sm text-neutral-400 line-clamp-3">{getExcerpt(card.content, 250)}</p>
          </div>
          <button
            onClick={handleSave}
            className="shrink-0 p-1.5 rounded-lg text-neutral-500 hover:text-violet-400 hover:bg-neutral-700/50 transition-colors"
            title="Save to channel"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
          </button>
        </div>

        {/* Source URL chips */}
        {card.sources.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {card.sources.slice(0, 2).map((source, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] text-neutral-500 bg-neutral-800/50 truncate max-w-[200px]"
              >
                <svg className="w-2.5 h-2.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                {source.title}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
