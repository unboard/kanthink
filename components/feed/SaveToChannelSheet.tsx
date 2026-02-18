'use client';

import { useState } from 'react';
import { useStore } from '@/lib/store';
import { useFeedStore } from '@/lib/feedStore';
import { useToastStore } from '@/lib/toastStore';

export function SaveToChannelSheet() {
  const savingFeedCardId = useFeedStore((s) => s.savingFeedCardId);
  const feedCards = useFeedStore((s) => s.feedCards);
  const setSavingFeedCard = useFeedStore((s) => s.setSavingFeedCard);
  const selectFeedCard = useFeedStore((s) => s.selectFeedCard);

  const channels = useStore((s) => s.channels);
  const channelOrder = useStore((s) => s.channelOrder);
  const createCard = useStore((s) => s.createCard);
  const addToast = useToastStore((s) => s.addToast);

  const [step, setStep] = useState<1 | 2>(1);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);

  const card = savingFeedCardId ? feedCards[savingFeedCardId] : null;
  const isOpen = !!card;

  const activeChannels = channelOrder
    .map((id) => channels[id])
    .filter((ch) => ch && ch.status !== 'archived');

  const selectedChannel = selectedChannelId ? channels[selectedChannelId] : null;

  const handleClose = () => {
    setSavingFeedCard(null);
    setStep(1);
    setSelectedChannelId(null);
  };

  const handleSelectChannel = (channelId: string) => {
    setSelectedChannelId(channelId);
    setStep(2);
  };

  const handleSelectColumn = (columnId: string) => {
    if (!card || !selectedChannelId) return;

    // Create the card in the selected channel/column
    createCard(
      selectedChannelId,
      columnId,
      {
        title: card.title,
        initialMessage: card.content,
      },
      'ai'
    );

    addToast(`Saved "${card.title}" to ${selectedChannel?.name || 'channel'}`, 'success');

    // Close everything
    handleClose();
    selectFeedCard(null);
  };

  const handleBack = () => {
    setStep(1);
    setSelectedChannelId(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div className="relative w-full sm:max-w-md max-h-[70vh] bg-neutral-900 rounded-t-2xl sm:rounded-2xl border border-neutral-800 overflow-hidden animate-slide-up sm:animate-none flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800 shrink-0">
          <div className="flex items-center gap-2">
            {step === 2 && (
              <button
                onClick={handleBack}
                className="p-1 rounded-md text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            <h3 className="text-sm font-semibold text-neutral-200">
              {step === 1 ? 'Save to Channel' : `Select Column`}
            </h3>
          </div>
          <button
            onClick={handleClose}
            className="p-1 rounded-md text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-2">
          {step === 1 ? (
            // Step 1: Pick channel
            <div className="flex flex-col gap-0.5">
              {activeChannels.map((ch) => {
                const isSuggested = card && ch.id === card.sourceChannelId;
                return (
                  <button
                    key={ch.id}
                    onClick={() => handleSelectChannel(ch.id)}
                    className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-left hover:bg-neutral-800 transition-colors group"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-neutral-200 group-hover:text-white">
                          {ch.name}
                        </span>
                        {isSuggested && (
                          <span className="text-[10px] font-medium text-violet-400 bg-violet-500/10 px-1.5 py-0.5 rounded">
                            Suggested
                          </span>
                        )}
                      </div>
                      {ch.description && (
                        <p className="text-xs text-neutral-500 truncate mt-0.5">{ch.description}</p>
                      )}
                    </div>
                    <svg className="w-4 h-4 text-neutral-600 group-hover:text-neutral-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                );
              })}
              {activeChannels.length === 0 && (
                <p className="text-sm text-neutral-500 text-center py-6">No channels available</p>
              )}
            </div>
          ) : (
            // Step 2: Pick column
            selectedChannel && (
              <div className="flex flex-col gap-0.5">
                {selectedChannel.columns.map((col) => {
                  const isAiTarget = col.isAiTarget;
                  return (
                    <button
                      key={col.id}
                      onClick={() => handleSelectColumn(col.id)}
                      className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-left hover:bg-neutral-800 transition-colors group"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-neutral-200 group-hover:text-white">
                            {col.name}
                          </span>
                          {isAiTarget && (
                            <span className="text-[10px] font-medium text-violet-400 bg-violet-500/10 px-1.5 py-0.5 rounded">
                              AI target
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-neutral-500 mt-0.5">
                          {col.cardIds.length} card{col.cardIds.length !== 1 ? 's' : ''}
                        </p>
                      </div>
                      <svg className="w-4 h-4 text-neutral-600 group-hover:text-violet-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                    </button>
                  );
                })}
              </div>
            )
          )}
        </div>

        {/* Safe area padding for mobile */}
        <div className="safe-area-bottom" />
      </div>
    </div>
  );
}
