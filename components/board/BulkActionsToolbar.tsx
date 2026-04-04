'use client';

import { useState, useRef, useEffect } from 'react';
import type { Channel, ID } from '@/lib/types';
import { useStore } from '@/lib/store';
import { useSelectionStore } from '@/lib/selectionStore';
import { getTagStyles } from './TagPicker';

interface BulkActionsToolbarProps {
  channel: Channel;
}

export function BulkActionsToolbar({ channel }: BulkActionsToolbarProps) {
  const selectedCardIds = useSelectionStore((s) => s.selectedCardIds);
  const clearSelection = useSelectionStore((s) => s.clearSelection);
  const isSelectionMode = useSelectionStore((s) => s.isSelectionMode);

  const moveCard = useStore((s) => s.moveCard);
  const archiveCard = useStore((s) => s.archiveCard);
  const deleteCard = useStore((s) => s.deleteCard);
  const addTagToCard = useStore((s) => s.addTagToCard);
  const removeTagFromCard = useStore((s) => s.removeTagFromCard);
  const mergeCards = useStore((s) => s.mergeCards);
  const cards = useStore((s) => s.cards);

  const [showMovePicker, setShowMovePicker] = useState(false);
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const moveRef = useRef<HTMLDivElement>(null);
  const tagRef = useRef<HTMLDivElement>(null);

  const count = selectedCardIds.size;

  // Close popups on click outside
  useEffect(() => {
    if (!showMovePicker && !showTagPicker) return;
    const handle = (e: MouseEvent) => {
      if (showMovePicker && moveRef.current && !moveRef.current.contains(e.target as Node)) {
        setShowMovePicker(false);
      }
      if (showTagPicker && tagRef.current && !tagRef.current.contains(e.target as Node)) {
        setShowTagPicker(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [showMovePicker, showTagPicker]);

  if (!isSelectionMode) return null;

  const columns = channel.columns ?? [];
  const tagDefs = channel.tagDefinitions ?? [];

  const handleMoveAll = (toColumnId: ID) => {
    const ids = Array.from(selectedCardIds);
    ids.forEach((cardId, i) => {
      moveCard(cardId, toColumnId, i);
    });
    setShowMovePicker(false);
    clearSelection();
  };

  const handleTagAll = (tagName: string) => {
    const ids = Array.from(selectedCardIds);
    const cards = useStore.getState().cards;
    ids.forEach((cardId) => {
      const card = cards[cardId];
      if (card && !(card.tags ?? []).includes(tagName)) {
        addTagToCard(cardId, tagName);
      }
    });
    setShowTagPicker(false);
    clearSelection();
  };

  const handleArchiveAll = () => {
    const ids = Array.from(selectedCardIds);
    ids.forEach((cardId) => archiveCard(cardId));
    clearSelection();
  };

  const handleDeleteAll = () => {
    const ids = Array.from(selectedCardIds);
    ids.forEach((cardId) => deleteCard(cardId));
    clearSelection();
    setShowDeleteConfirm(false);
  };

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 px-2 py-1.5 rounded-xl bg-neutral-900 dark:bg-neutral-100 shadow-2xl shadow-black/25 text-white dark:text-neutral-900 text-sm animate-in slide-in-from-bottom-4 fade-in duration-200">
      {/* Count + clear */}
      <button
        onClick={clearSelection}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-white/10 dark:hover:bg-black/10 transition-colors"
        title="Clear selection"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
        <span className="font-medium">{count} selected</span>
      </button>

      <div className="w-px h-5 bg-white/20 dark:bg-black/20 mx-1" />

      {/* Move */}
      <div className="relative" ref={moveRef}>
        <button
          onClick={() => { setShowMovePicker(!showMovePicker); setShowTagPicker(false); }}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-white/10 dark:hover:bg-black/10 transition-colors"
          title="Move to column"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
          Move
        </button>
        {showMovePicker && (
          <div className="absolute bottom-full mb-2 left-0 w-48 bg-white dark:bg-neutral-800 rounded-lg shadow-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden text-neutral-700 dark:text-neutral-200">
            {columns.map((col) => (
              <button
                key={col.id}
                onClick={() => handleMoveAll(col.id)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-700/50 transition-colors truncate"
              >
                {col.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Tag */}
      <div className="relative" ref={tagRef}>
        <button
          onClick={() => { setShowTagPicker(!showTagPicker); setShowMovePicker(false); }}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-white/10 dark:hover:bg-black/10 transition-colors"
          title="Add tag"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
          </svg>
          Tag
        </button>
        {showTagPicker && (
          <div className="absolute bottom-full mb-2 left-0 w-48 bg-white dark:bg-neutral-800 rounded-lg shadow-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden text-neutral-700 dark:text-neutral-200">
            {tagDefs.length === 0 ? (
              <div className="px-3 py-2 text-xs text-neutral-400">No tags defined</div>
            ) : (
              tagDefs.map((tag) => {
                const styles = getTagStyles(tag.color);
                return (
                  <button
                    key={tag.id}
                    onClick={() => handleTagAll(tag.name)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-700/50 transition-colors flex items-center gap-2"
                  >
                    <span
                      className={`w-3 h-3 rounded-sm flex-shrink-0 ${styles.className ?? ''}`}
                      style={styles.style}
                    />
                    <span className="truncate">{tag.name}</span>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Merge */}
      {count >= 2 && (
        <>
          <button
            onClick={async () => {
              if (isMerging) return;
              setIsMerging(true);
              const ids = Array.from(selectedCardIds);
              const primaryId = ids[0];
              const mergeIds = ids.slice(1);

              // Generate AI title from card titles
              let aiTitle: string | undefined;
              try {
                const titles = ids.map(id => cards[id]?.title).filter(Boolean);
                const res = await fetch('/api/channels/actions/generate', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    type: 'chat',
                    channelName: channel.name,
                    channelDescription: '',
                    prompt: `These cards are being merged into one. Generate a single concise title (1-8 words) that captures the combined topic. Card titles: ${titles.join(', ')}. Return ONLY the title text, nothing else.`,
                    cards: [],
                  }),
                });
                if (res.ok) {
                  const data = await res.json();
                  aiTitle = data.content?.trim().replace(/^["']|["']$/g, '');
                }
              } catch { /* use primary title as fallback */ }

              mergeCards(primaryId, mergeIds, aiTitle);
              clearSelection();
              setIsMerging(false);
            }}
            disabled={isMerging}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-violet-500/20 text-violet-400 transition-colors disabled:opacity-50"
            title="Merge selected cards"
          >
            {isMerging ? (
              <div className="w-4 h-4 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" />
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
              </svg>
            )}
            {isMerging ? 'Merging...' : 'Merge'}
          </button>
          <div className="w-px h-5 bg-white/20 dark:bg-black/20 mx-1" />
        </>
      )}

      {/* Archive */}
      <button
        onClick={handleArchiveAll}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-white/10 dark:hover:bg-black/10 transition-colors"
        title="Archive selected"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
        </svg>
        Archive
      </button>

      <div className="w-px h-5 bg-white/20 dark:bg-black/20 mx-1" />

      {/* Delete */}
      {showDeleteConfirm ? (
        <div className="flex items-center gap-1">
          <span className="text-xs text-red-400 px-1">Delete {count}?</span>
          <button
            onClick={handleDeleteAll}
            className="px-2 py-1 rounded-md text-xs font-medium bg-red-600 text-white hover:bg-red-700 transition-colors"
          >
            Yes
          </button>
          <button
            onClick={() => setShowDeleteConfirm(false)}
            className="px-2 py-1 rounded-md text-xs font-medium hover:bg-white/10 dark:hover:bg-black/10 transition-colors"
          >
            No
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-red-500/20 text-red-400 transition-colors"
          title="Delete selected"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          Delete
        </button>
      )}
    </div>
  );
}
