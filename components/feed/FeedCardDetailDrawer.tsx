'use client';

import { useState } from 'react';
import { Drawer } from '@/components/ui/Drawer';
import { useFeedStore } from '@/lib/feedStore';
import type { FeedCard } from '@/lib/types';

function TypeBadge({ type }: { type: FeedCard['type'] }) {
  const config = {
    appetizer: { label: 'Quick Bite', className: 'bg-amber-500/20 text-amber-400' },
    main_course: { label: 'Deep Dive', className: 'bg-blue-500/20 text-blue-400' },
    dessert: { label: 'Connection', className: 'bg-pink-500/20 text-pink-400' },
  };
  const { label, className } = config[type];
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${className}`}>
      {label}
    </span>
  );
}

export function FeedCardDetailDrawer() {
  const selectedFeedCardId = useFeedStore((s) => s.selectedFeedCardId);
  const feedCards = useFeedStore((s) => s.feedCards);
  const selectFeedCard = useFeedStore((s) => s.selectFeedCard);
  const setSavingFeedCard = useFeedStore((s) => s.setSavingFeedCard);
  const [imageError, setImageError] = useState(false);

  const card = selectedFeedCardId ? feedCards[selectedFeedCardId] : null;
  const isOpen = !!card;

  const handleClose = () => selectFeedCard(null);
  const handleSave = () => {
    if (card) setSavingFeedCard(card.id);
  };

  if (!card) return null;

  return (
    <Drawer isOpen={isOpen} onClose={handleClose} width="lg" floating>
      <div className="flex flex-col min-h-full">
        {/* Cover image */}
        {card.coverImageUrl && !imageError ? (
          <div className="relative w-full h-56 overflow-hidden shrink-0">
            <img
              src={card.coverImageUrl}
              alt=""
              onError={() => setImageError(true)}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-neutral-900 via-transparent to-transparent" />
          </div>
        ) : card.type === 'dessert' ? (
          <div className="w-full h-24 shrink-0 bg-gradient-to-br from-violet-600/30 via-pink-600/20 to-indigo-600/30" />
        ) : card.type === 'main_course' ? (
          <div className="w-full h-24 shrink-0 bg-gradient-to-br from-indigo-900/40 to-slate-900/40" />
        ) : null}

        {/* Content */}
        <div className="flex-1 p-6">
          {/* Type + source */}
          <div className="flex items-center gap-2 mb-3">
            <TypeBadge type={card.type} />
            <span className="text-xs text-neutral-500">{card.sourceChannelName}</span>
          </div>

          {/* Title */}
          <h2 className="text-2xl font-bold text-neutral-100 mb-4">{card.title}</h2>

          {/* Full content */}
          <div
            className="prose prose-invert prose-sm max-w-none
              prose-headings:text-neutral-200 prose-headings:font-semibold
              prose-p:text-neutral-300 prose-p:leading-relaxed
              prose-a:text-violet-400 prose-a:no-underline hover:prose-a:underline
              prose-strong:text-neutral-200
              prose-ul:text-neutral-300 prose-ol:text-neutral-300
              prose-li:marker:text-neutral-500"
            dangerouslySetInnerHTML={{ __html: card.content }}
          />

          {/* Sources section */}
          {card.sources.length > 0 && (
            <div className="mt-8 pt-4 border-t border-neutral-800">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-3">Sources</h4>
              <div className="flex flex-col gap-2">
                {card.sources.map((source, i) => (
                  <a
                    key={i}
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-2 p-2 rounded-lg bg-neutral-800/50 hover:bg-neutral-800 transition-colors group"
                  >
                    <img
                      src={`https://www.google.com/s2/favicons?domain=${new URL(source.url).hostname}&sz=16`}
                      alt=""
                      className="w-4 h-4 shrink-0 rounded-sm"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                    <span className="text-sm text-neutral-300 group-hover:text-violet-400 truncate">
                      {source.title}
                    </span>
                    <svg className="w-3.5 h-3.5 shrink-0 text-neutral-600 group-hover:text-violet-400 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Bottom action bar */}
        <div className="sticky bottom-0 p-4 border-t border-neutral-800 bg-neutral-900/95 backdrop-blur-sm">
          <button
            onClick={handleSave}
            className="w-full py-2.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
            Save to Channel
          </button>
        </div>
      </div>
    </Drawer>
  );
}
