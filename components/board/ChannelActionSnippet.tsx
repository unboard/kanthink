'use client';

import { useState } from 'react';
import type { ChannelStoredAction, CreateCardActionData, ChannelCreateTaskActionData, Channel } from '@/lib/types';
import { useStore } from '@/lib/store';

interface ChannelActionSnippetProps {
  action: ChannelStoredAction;
  channel: Channel;
  onApprove: (actionId: string, editedData?: ChannelStoredAction['data']) => void;
  onReject: (actionId: string) => void;
}

function resolveColumnId(name: string, channel: Channel): string {
  const lower = name.toLowerCase();
  const exact = channel.columns.find((c) => c.name === name);
  if (exact) return exact.id;
  const insensitive = channel.columns.find((c) => c.name.toLowerCase() === lower);
  if (insensitive) return insensitive.id;
  const partial = channel.columns.find(
    (c) => c.name.toLowerCase().includes(lower) || lower.includes(c.name.toLowerCase()),
  );
  if (partial) return partial.id;
  return channel.columns[0]?.id || '';
}

function resolveCardId(title: string, channel: Channel): string | undefined {
  const cards = useStore.getState().cards;
  const lower = title.toLowerCase();

  // Search all cards in this channel
  for (const col of channel.columns) {
    for (const cardId of col.cardIds) {
      const card = cards[cardId];
      if (card && card.channelId === channel.id) {
        if (card.title.toLowerCase() === lower) return card.id;
      }
    }
  }
  // Partial match
  for (const col of channel.columns) {
    for (const cardId of col.cardIds) {
      const card = cards[cardId];
      if (card && card.channelId === channel.id) {
        if (card.title.toLowerCase().includes(lower) || lower.includes(card.title.toLowerCase())) {
          return card.id;
        }
      }
    }
  }
  return undefined;
}

export function ChannelActionSnippet({ action, channel, onApprove, onReject }: ChannelActionSnippetProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedData, setEditedData] = useState(action.editedData ?? action.data);

  const isPending = action.status === 'pending';
  const isApproved = action.status === 'approved';
  const isRejected = action.status === 'rejected';

  const containerStyles = isPending
    ? 'bg-neutral-50 dark:bg-neutral-800/50 border-neutral-200 dark:border-neutral-700'
    : isApproved
      ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800/50'
      : 'bg-neutral-50 dark:bg-neutral-800/30 border-neutral-200 dark:border-neutral-700 opacity-50';

  const iconColor = isApproved
    ? 'text-green-500 dark:text-green-400'
    : isRejected
      ? 'text-neutral-400 dark:text-neutral-500'
      : 'text-violet-500 dark:text-violet-400';

  const handleApprove = () => {
    onApprove(action.id, isEditing ? editedData : undefined);
    setIsEditing(false);
  };

  const handleReject = () => {
    onReject(action.id);
    setIsEditing(false);
  };

  const renderContent = () => {
    if (action.type === 'create_card') {
      const data = (isEditing ? editedData : action.data) as CreateCardActionData;
      return (
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <div className="space-y-1.5">
              <input
                type="text"
                value={data.title}
                onChange={(e) => setEditedData({ ...data, title: e.target.value })}
                className="w-full text-sm font-medium bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-600 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-violet-500"
              />
              <select
                value={data.columnName}
                onChange={(e) => setEditedData({ ...data, columnName: e.target.value })}
                className="text-xs bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-600 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-violet-500"
              >
                {channel.columns.map((col) => (
                  <option key={col.id} value={col.name}>{col.name}</option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <span className={`text-sm font-medium ${isRejected ? 'line-through text-neutral-400' : 'text-neutral-800 dark:text-neutral-200'}`}>
                {data.title}
              </span>
              <span className="ml-1.5 text-xs text-neutral-400 dark:text-neutral-500">
                → {data.columnName}
              </span>
            </div>
          )}
        </div>
      );
    }

    if (action.type === 'create_task') {
      const data = (isEditing ? editedData : action.data) as ChannelCreateTaskActionData;
      return (
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <div className="space-y-1.5">
              <input
                type="text"
                value={data.title}
                onChange={(e) => setEditedData({ ...data, title: e.target.value })}
                className="w-full text-sm font-medium bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-600 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-violet-500"
              />
            </div>
          ) : (
            <div>
              <span className={`text-sm font-medium ${isRejected ? 'line-through text-neutral-400' : 'text-neutral-800 dark:text-neutral-200'}`}>
                {data.title}
              </span>
              {data.cardTitle && (
                <span className="ml-1.5 text-xs text-neutral-400 dark:text-neutral-500">
                  on &ldquo;{data.cardTitle}&rdquo;
                </span>
              )}
            </div>
          )}
        </div>
      );
    }

    return null;
  };

  return (
    <div className={`rounded-lg border px-3 py-2.5 ${containerStyles}`}>
      <div className="flex items-start gap-2.5">
        {/* Icon */}
        <div className={`flex-shrink-0 mt-0.5 ${iconColor}`}>
          {action.type === 'create_card' ? (
            isApproved ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            )
          ) : (
            isApproved ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            )
          )}
        </div>

        {renderContent()}

        {/* Action buttons */}
        {isPending && (
          <div className="flex items-center gap-0.5 flex-shrink-0">
            {isEditing ? (
              <>
                <button
                  onClick={handleApprove}
                  className="p-1.5 text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/30 rounded-md transition-colors"
                  title="Save"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </button>
                <button
                  onClick={() => { setEditedData(action.data); setIsEditing(false); }}
                  className="p-1.5 text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-md transition-colors"
                  title="Cancel"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => { setEditedData(action.editedData ?? action.data); setIsEditing(true); }}
                  className="p-1.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-md transition-colors"
                  title="Edit"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button
                  onClick={handleReject}
                  className="p-1.5 text-neutral-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
                  title="Dismiss"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
                <button
                  onClick={handleApprove}
                  className="p-1.5 text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/30 rounded-md transition-colors"
                  title="Add"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              </>
            )}
          </div>
        )}

        {isApproved && (
          <span className="text-xs text-green-600 dark:text-green-400 font-medium flex-shrink-0 bg-green-100 dark:bg-green-900/30 px-2 py-0.5 rounded">
            Added
          </span>
        )}
        {isRejected && (
          <span className="text-xs text-neutral-500 dark:text-neutral-400 flex-shrink-0 line-through">
            Dismissed
          </span>
        )}
      </div>
    </div>
  );
}

export { resolveColumnId, resolveCardId };
