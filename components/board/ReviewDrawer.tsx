'use client';

import { useState } from 'react';
import type { ID, RejectionReason, ReviewQueueState } from '@/lib/types';
import { useStore } from '@/lib/store';
import { Drawer } from '@/components/ui/Drawer';
import { Button, Modal } from '@/components/ui';

const REJECTION_REASONS: { key: RejectionReason; label: string }[] = [
  { key: 'too_similar', label: 'Too similar' },
  { key: 'not_relevant', label: 'Not relevant' },
  { key: 'too_vague', label: 'Too vague' },
  { key: 'not_for_me', label: 'Not for me' },
  { key: 'already_know', label: 'Already know this' },
];

interface ReviewDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ReviewDrawer({ isOpen, onClose }: ReviewDrawerProps) {
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  const activeReviewId = useStore((s) => s.activeReviewId);
  const pendingReviews = useStore((s) => s.pendingReviews);
  const toggleReviewCard = useStore((s) => s.toggleReviewCard);
  const acceptAllReviewCards = useStore((s) => s.acceptAllReviewCards);
  const setRejectionReason = useStore((s) => s.setRejectionReason);
  const setRejectionFeedback = useStore((s) => s.setRejectionFeedback);
  const toggleReviewCardExpanded = useStore((s) => s.toggleReviewCardExpanded);
  const commitReviewQueue = useStore((s) => s.commitReviewQueue);
  const discardReview = useStore((s) => s.discardReview);
  const closeReviewQueue = useStore((s) => s.closeReviewQueue);

  const review: ReviewQueueState | null = activeReviewId ? pendingReviews[activeReviewId] ?? null : null;

  if (!review) return null;

  const acceptedCount = review.cards.filter(c => c.accepted).length;
  const totalCount = review.cards.length;

  const handleClose = () => {
    // If there are any cards, show discard confirmation
    if (totalCount > 0) {
      setShowDiscardConfirm(true);
    } else {
      closeReviewQueue();
      onClose();
    }
  };

  const handleDiscard = () => {
    setShowDiscardConfirm(false);
    discardReview(review.instructionCardId);
    onClose();
  };

  const handleBackToReview = () => {
    setShowDiscardConfirm(false);
  };

  const handleCommit = () => {
    commitReviewQueue(review.instructionCardId);
    onClose();
  };

  return (
    <>
      <Drawer isOpen={isOpen} onClose={handleClose} width="lg" hideCloseButton>
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-neutral-900 dark:text-white">
                Review {totalCount} card{totalCount !== 1 ? 's' : ''} from &ldquo;{review.instructionTitle}&rdquo;
              </h2>
              <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
                &rarr; {review.targetColumnName}
              </p>
            </div>
            <button
              onClick={handleClose}
              className="flex-shrink-0 p-1.5 rounded-md text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 dark:hover:text-neutral-300 dark:hover:bg-neutral-800"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Accept All button */}
          {acceptedCount < totalCount && (
            <div className="px-5 pb-2">
              <button
                onClick={() => acceptAllReviewCards(review.instructionCardId)}
                className="text-sm text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 font-medium"
              >
                Accept All
              </button>
            </div>
          )}

          {/* Card list */}
          <div className="flex-1 overflow-y-auto px-5 pb-24">
            <div className="space-y-3">
              {review.cards.map((card, index) => (
                <div
                  key={index}
                  className={`rounded-lg border transition-colors ${
                    card.accepted
                      ? 'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800/50'
                      : 'border-red-200 dark:border-red-800/50 bg-red-50/50 dark:bg-red-900/10'
                  }`}
                >
                  {/* Card header */}
                  <div className="flex items-start gap-3 p-3">
                    {/* Accept/reject indicator */}
                    <button
                      onClick={() => toggleReviewCard(review.instructionCardId, index)}
                      className={`flex-shrink-0 mt-0.5 w-5 h-5 rounded flex items-center justify-center transition-colors ${
                        card.accepted
                          ? 'bg-violet-500 text-white'
                          : 'bg-neutral-200 dark:bg-neutral-600 text-neutral-400 dark:text-neutral-500'
                      }`}
                    >
                      {card.accepted ? (
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      )}
                    </button>

                    {/* Card content */}
                    <div className="flex-1 min-w-0">
                      <button
                        onClick={() => toggleReviewCardExpanded(review.instructionCardId, index)}
                        className="text-left w-full"
                      >
                        <h3 className={`text-sm font-medium leading-snug ${
                          card.accepted
                            ? 'text-neutral-900 dark:text-white'
                            : 'text-neutral-500 dark:text-neutral-400 line-through'
                        }`}>
                          {card.title}
                        </h3>
                        {card.content && !card.expanded && (
                          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 line-clamp-2">
                            {card.content.replace(/<[^>]+>/g, '').replace(/[#*_`]/g, '').slice(0, 150)}
                          </p>
                        )}
                      </button>

                      {/* Expanded content */}
                      {card.expanded && card.content && (
                        <div
                          className="mt-2 text-sm text-neutral-700 dark:text-neutral-300 prose prose-sm dark:prose-invert max-w-none"
                          dangerouslySetInnerHTML={{ __html: card.content }}
                        />
                      )}
                    </div>

                    {/* Reject/Undo button */}
                    <div className="flex-shrink-0">
                      {card.accepted ? (
                        <button
                          onClick={() => toggleReviewCard(review.instructionCardId, index)}
                          className="text-xs text-neutral-400 hover:text-red-500 dark:text-neutral-500 dark:hover:text-red-400 px-2 py-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
                        >
                          Reject
                        </button>
                      ) : (
                        <button
                          onClick={() => toggleReviewCard(review.instructionCardId, index)}
                          className="text-xs text-violet-500 hover:text-violet-600 dark:text-violet-400 dark:hover:text-violet-300 px-2 py-1 rounded hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors"
                        >
                          Undo Reject
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Rejection feedback - shown when card is rejected */}
                  {!card.accepted && (
                    <div className="px-3 pb-3 pt-0 ml-8">
                      {/* Reason chips */}
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {REJECTION_REASONS.map(({ key, label }) => (
                          <button
                            key={key}
                            onClick={() => setRejectionReason(
                              review.instructionCardId,
                              index,
                              card.rejectionReason === key ? undefined : key
                            )}
                            className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
                              card.rejectionReason === key
                                ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 font-medium'
                                : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-600'
                            }`}
                          >
                            {card.rejectionReason === key && (
                              <span className="mr-1">&bull;</span>
                            )}
                            {label}
                          </button>
                        ))}
                      </div>

                      {/* Optional note */}
                      <input
                        type="text"
                        placeholder="Add a note... (optional)"
                        value={card.rejectionFeedback ?? ''}
                        onChange={(e) => setRejectionFeedback(review.instructionCardId, index, e.target.value)}
                        maxLength={200}
                        className="w-full text-xs px-2.5 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-violet-400"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Sticky bottom bar */}
          <div className="absolute bottom-0 left-0 right-0 border-t border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-5 py-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-neutral-500 dark:text-neutral-400">
                Accepting {acceptedCount} of {totalCount}
              </span>
              <Button
                onClick={handleCommit}
                disabled={acceptedCount === 0}
              >
                Add to {review.targetColumnName}
              </Button>
            </div>
          </div>
        </div>
      </Drawer>

      {/* Discard confirmation modal */}
      <Modal
        isOpen={showDiscardConfirm}
        onClose={handleBackToReview}
        title="Discard generated cards?"
      >
        <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
          {totalCount} generated card{totalCount !== 1 ? 's' : ''} will be lost. This can&apos;t be undone.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={handleBackToReview}>
            Back to Review
          </Button>
          <Button
            onClick={handleDiscard}
            className="!bg-red-600 !text-white hover:!bg-red-700 dark:!bg-red-600 dark:hover:!bg-red-700"
          >
            Discard
          </Button>
        </div>
      </Modal>
    </>
  );
}
