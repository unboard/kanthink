'use client';

import { useSession } from 'next-auth/react';
import type { Card as CardType, PollTypeData } from '@/lib/types';
import { useStore } from '@/lib/store';

interface PollWidgetProps {
  card: CardType;
}

export function PollWidget({ card }: PollWidgetProps) {
  const { data: session } = useSession();
  const updateCard = useStore((s) => s.updateCard);
  const userId = session?.user?.id;

  const data = (card.typeData as unknown as PollTypeData) || {
    question: card.title,
    options: [],
    closed: false,
  };

  const isCreator = userId === data.creatorId;
  const totalVotes = data.options.reduce((sum, opt) => sum + opt.voterIds.length, 0);

  const handleVote = (optionId: string) => {
    if (!userId || data.closed) return;

    const updatedOptions = data.options.map(opt => {
      if (opt.id === optionId) {
        const hasVoted = opt.voterIds.includes(userId);
        return {
          ...opt,
          voterIds: hasVoted
            ? opt.voterIds.filter(id => id !== userId)
            : [...opt.voterIds, userId],
        };
      }
      return {
        ...opt,
        voterIds: opt.voterIds.filter(id => id !== userId),
      };
    });

    updateCard(card.id, {
      typeData: { ...data, options: updatedOptions } as unknown as Record<string, unknown>,
    });
  };

  const userVotedOption = userId
    ? data.options.find(o => o.voterIds.includes(userId))?.id
    : null;

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-md shadow-sm p-3">
      {/* Question */}
      <h4 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200 mb-3">
        {data.question}
      </h4>

      {/* Options */}
      <div className="space-y-2">
        {data.options.map((opt) => {
          const votes = opt.voterIds.length;
          const percentage = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
          const isUserVote = opt.id === userVotedOption;

          return (
            <button
              key={opt.id}
              onClick={() => handleVote(opt.id)}
              disabled={data.closed}
              className={`
                w-full relative overflow-hidden rounded-lg border transition-all text-left
                ${isUserVote
                  ? 'border-violet-300 dark:border-violet-700 bg-violet-50 dark:bg-violet-900/20'
                  : 'border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600'
                }
                ${data.closed ? 'cursor-default' : 'cursor-pointer'}
              `}
            >
              {/* Progress bar — only visible to creator */}
              {isCreator && (
                <div
                  className="absolute inset-0 bg-violet-100 dark:bg-violet-900/20 transition-all"
                  style={{ width: `${percentage}%` }}
                />
              )}

              {/* Content */}
              <div className="relative flex items-center justify-between px-3 py-2">
                <div className="flex items-center gap-2">
                  {isUserVote && (
                    <svg className="w-3 h-3 text-violet-600 dark:text-violet-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                  <span className={`text-xs ${isUserVote ? 'font-medium text-violet-700 dark:text-violet-300' : 'text-neutral-700 dark:text-neutral-300'}`}>
                    {opt.text}
                  </span>
                </div>
                {/* Only creator sees vote counts */}
                {isCreator && (
                  <span className="text-[10px] text-neutral-400 flex-shrink-0 ml-2">
                    {votes} · {percentage}%
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <div className="mt-2 flex items-center justify-between">
        {isCreator ? (
          <span className="text-[10px] text-neutral-400">
            {totalVotes} {totalVotes === 1 ? 'vote' : 'votes'}
          </span>
        ) : (
          <span className="text-[10px] text-neutral-400">
            {userVotedOption ? 'You voted' : 'Tap to vote'}
          </span>
        )}
        {data.closed && (
          <span className="text-[10px] text-neutral-400 font-medium">Closed</span>
        )}
      </div>
    </div>
  );
}
