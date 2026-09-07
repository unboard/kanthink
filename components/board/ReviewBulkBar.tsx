'use client';

import { useState } from 'react';
import type { ID, RejectionReason } from '@/lib/types';
import { useStore } from '@/lib/store';
import { REJECTION_REASONS } from '@/lib/constants';

interface ReviewBulkBarProps {
  channelId: ID;
  columnId: ID;
  count: number;
}

/**
 * Approve or reject a whole shroom run at once.
 *
 * Deciding ten cards one at a time is a chore, and the chore is what stops people
 * using review mode at all — so the bulk action sits above the stack rather than
 * being buried in the column menu.
 *
 * Rejecting all asks for a reason but does not require one. The reason exists to
 * teach the shroom, and the honest answer is often "the shroom is built wrong and
 * I'm about to go fix it" — forcing a reason there would put noise into the very
 * prompts the reason feeds.
 */
export function ReviewBulkBar({ channelId, columnId, count }: ReviewBulkBarProps) {
  const approveAll = useStore((s) => s.approveAllReviewCards);
  const rejectAll = useStore((s) => s.rejectAllReviewCards);

  const [mode, setMode] = useState<'idle' | 'rejecting' | 'confirmApprove'>('idle');
  const [reason, setReason] = useState<RejectionReason | undefined>();
  const [feedback, setFeedback] = useState('');

  const reset = () => {
    setMode('idle');
    setReason(undefined);
    setFeedback('');
  };

  const handleRejectAll = () => {
    rejectAll(channelId, columnId, reason, feedback.trim() || undefined);
    reset();
  };

  const handleApproveAll = () => {
    approveAll(channelId, columnId);
    reset();
  };

  if (mode === 'rejecting') {
    return (
      <div className="mb-2 rounded-lg border border-red-300 dark:border-red-900/60 bg-red-50/70 dark:bg-red-950/30 p-2.5">
        <p className="text-xs font-medium text-red-800 dark:text-red-300 mb-1">
          Reject all {count}?
        </p>
        <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mb-1.5">
          A reason teaches the shroom. Skip it if the shroom itself needs fixing.
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
          className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-red-400"
        />
        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={handleRejectAll}
            className="flex-1 text-xs font-medium px-3 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors"
          >
            {reason || feedback.trim() ? `Reject all ${count}` : `Reject all ${count}, no reason`}
          </button>
          <button
            onClick={reset}
            className="flex-1 text-xs font-medium px-3 py-2 rounded-lg text-neutral-600 dark:text-neutral-300 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (mode === 'confirmApprove') {
    return (
      <div className="mb-2 rounded-lg border border-violet-300 dark:border-violet-800/60 bg-violet-50/70 dark:bg-violet-950/30 p-2.5">
        <p className="text-xs font-medium text-violet-800 dark:text-violet-300 mb-2">
          Approve all {count} and put them on the board?
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={handleApproveAll}
            className="flex-1 text-xs font-medium px-3 py-2 rounded-lg bg-violet-600 text-white hover:bg-violet-700 transition-colors"
          >
            Approve all {count}
          </button>
          <button
            onClick={reset}
            className="flex-1 text-xs font-medium px-3 py-2 rounded-lg text-neutral-600 dark:text-neutral-300 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-2 flex items-center gap-2">
      {/* Both confirm before acting: these are bulk, and rejecting deletes. */}
      <button
        onClick={() => setMode('confirmApprove')}
        className="flex-1 text-xs font-medium px-3 py-2 rounded-lg bg-violet-600 text-white hover:bg-violet-700 transition-colors"
      >
        Approve all {count}
      </button>
      <button
        onClick={() => setMode('rejecting')}
        className="flex-1 text-xs font-medium px-3 py-2 rounded-lg text-neutral-600 dark:text-neutral-300 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
      >
        Reject all {count}
      </button>
    </div>
  );
}
