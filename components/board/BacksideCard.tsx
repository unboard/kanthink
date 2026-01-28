'use client';

import type { Card as CardType } from '@/lib/types';
import { useStore } from '@/lib/store';

interface BacksideCardProps {
  card: CardType;
}

export function BacksideCard({ card }: BacksideCardProps) {
  const unarchiveCard = useStore((s) => s.unarchiveCard);
  const deleteCard = useStore((s) => s.deleteCard);

  const handleRestore = () => {
    unarchiveCard(card.id);
  };

  const handleDelete = () => {
    deleteCard(card.id);
  };

  // Use summary or first message for preview
  const messages = card.messages ?? [];
  const contentPreview = card.summary
    || (messages.length > 0 ? messages[0].content.slice(0, 100) : '');

  return (
    <div className="group relative rounded-md bg-neutral-200/50 dark:bg-neutral-700/30 p-2.5 border border-dashed border-neutral-300 dark:border-neutral-600">
      {/* Quick action buttons */}
      <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={handleRestore}
          className="p-1 rounded text-neutral-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950"
          title="Unarchive card"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
          </svg>
        </button>
        <button
          onClick={handleDelete}
          className="p-1 rounded text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950"
          title="Delete card"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>

      <div className="flex items-start gap-2">
        <svg className="w-3.5 h-3.5 mt-0.5 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
        </svg>
        <div className="min-w-0">
          <h4 className="text-xs font-medium text-neutral-500 dark:text-neutral-400 pr-12 line-through decoration-neutral-400">
            {card.title}
          </h4>
          {contentPreview && (
            <p className="mt-0.5 text-xs text-neutral-400 line-clamp-1">
              {contentPreview}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
