'use client';

import { useState } from 'react';
import type { ID, RejectionReason } from '@/lib/types';
import { useStore } from '@/lib/store';
import { REJECTION_REASONS } from '@/lib/constants';

interface CardApprovalBarProps {
  cardId: ID;
  /** Called after a decision lands, so an open drawer can close itself. */
  onDecided?: () => void;
}

/**
 * The approve/reject decision for a shroom-generated card, shown where the
 * composer normally sits.
 *
 * A card awaiting review is still a card — you can read its thread and open it
 * like any other. What it cannot do is take a reply, because answering a card
 * that might be about to be rejected has nowhere to go. So the composer is
 * replaced by the decision rather than sitting alongside it.
 */
export function CardApprovalBar({ cardId, onDecided }: CardApprovalBarProps) {
  const approveReviewCard = useStore((s) => s.approveReviewCard);
  const rejectReviewCard = useStore((s) => s.rejectReviewCard);

  const [isRejecting, setIsRejecting] = useState(false);
  const [reason, setReason] = useState<RejectionReason | undefined>();
  const [feedback, setFeedback] = useState('');

  const handleApprove = () => {
    approveReviewCard(cardId);
    onDecided?.();
  };

  const handleConfirmReject = () => {
    rejectReviewCard(cardId, reason, feedback.trim() || undefined);
    onDecided?.();
  };

  return (
    <div className="border-t border-violet-200 dark:border-violet-800/60 bg-violet-50/60 dark:bg-violet-950/30 px-4 py-3">
      <div className="flex items-center gap-2 mb-2.5">
        <span className="text-sm leading-none" aria-hidden>🍄</span>
        <p className="text-xs font-medium text-violet-800 dark:text-violet-300">
          Kan made this card — keep it?
        </p>
      </div>

      {!isRejecting ? (
        <div className="flex items-center gap-2">
          <button
            onClick={handleApprove}
            className="flex-1 text-sm font-medium px-3 py-2 rounded-lg bg-violet-600 text-white hover:bg-violet-700 transition-colors"
          >
            Approve
          </button>
          <button
            onClick={() => setIsRejecting(true)}
            className="flex-1 text-sm font-medium px-3 py-2 rounded-lg text-neutral-600 dark:text-neutral-300 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
          >
            Reject
          </button>
        </div>
      ) : (
        <div>
          <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mb-1.5">
            Why? This teaches the shroom.
          </p>
          <div className="flex flex-wrap gap-1 mb-2">
            {REJECTION_REASONS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setReason(reason === key ? undefined : key)}
                className={`text-[11px] px-2 py-0.5 rounded-full transition-colors ${
                  reason === key
                    ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 font-medium'
                    : 'bg-neutral-200/70 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-400 hover:bg-neutral-300 dark:hover:bg-neutral-600'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <input
            type="text"
            placeholder="Add a note... (optional)"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            maxLength={200}
            className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-violet-400"
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={handleConfirmReject}
              className="flex-1 text-sm font-medium px-3 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors"
            >
              Reject
            </button>
            <button
              onClick={() => setIsRejecting(false)}
              className="flex-1 text-sm font-medium px-3 py-2 rounded-lg text-neutral-600 dark:text-neutral-300 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
