'use client';

import { useState, useRef, useEffect } from 'react';
import type { ID } from '@/lib/types';
import { useStore } from '@/lib/store';
import { Modal } from '@/components/ui';

interface ColumnMenuProps {
  channelId: ID;
  columnId: ID;
  columnCount: number;
  cardCount: number;
  onRename: () => void;
  onOpenSettings: () => void;
  onFocus: () => void;
  hasInstructions?: boolean;
  isFocused?: boolean;
}

export function ColumnMenu({
  channelId,
  columnId,
  columnCount,
  cardCount,
  onRename,
  onOpenSettings,
  onFocus,
  hasInstructions,
  isFocused,
}: ColumnMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showDeleteCardsConfirm, setShowDeleteCardsConfirm] = useState(false);
  const [showDeleteColumnConfirm, setShowDeleteColumnConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  const deleteColumn = useStore((s) => s.deleteColumn);
  const deleteAllCardsInColumn = useStore((s) => s.deleteAllCardsInColumn);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const handleDeleteAllCards = () => {
    if (cardCount === 0) return;
    setIsOpen(false);
    if (cardCount === 1) {
      // Single card — no extra confirmation needed
      if (confirm('Delete the card in this column?')) {
        deleteAllCardsInColumn(channelId, columnId);
      }
    } else {
      setDeleteConfirmText('');
      setShowDeleteCardsConfirm(true);
    }
  };

  const handleConfirmDeleteAllCards = () => {
    deleteAllCardsInColumn(channelId, columnId);
    setShowDeleteCardsConfirm(false);
    setDeleteConfirmText('');
  };

  const handleDeleteColumn = () => {
    if (columnCount <= 1) return;
    setIsOpen(false);
    setDeleteConfirmText('');
    setShowDeleteColumnConfirm(true);
  };

  const handleConfirmDeleteColumn = () => {
    deleteColumn(channelId, columnId);
    setShowDeleteColumnConfirm(false);
    setDeleteConfirmText('');
  };

  const isDeleteConfirmed = deleteConfirmText === 'DELETE';

  return (
    <>
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="rounded p-1 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-600 dark:hover:bg-neutral-700 dark:hover:text-neutral-300"
        >
          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
          </svg>
        </button>

        {isOpen && (
          <div className="absolute right-0 top-full z-20 mt-1 w-44 rounded-md bg-white py-1 shadow-lg ring-1 ring-black/5 dark:bg-neutral-800 dark:ring-white/10">
            <button
              onClick={() => {
                onRename();
                setIsOpen(false);
              }}
              className="block w-full px-3 py-1.5 text-left text-sm text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-700"
            >
              Rename
            </button>
            <button
              onClick={() => {
                onOpenSettings();
                setIsOpen(false);
              }}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-sm text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-700"
            >
              Column instructions
              {hasInstructions && (
                <span className="w-2 h-2 bg-violet-500 rounded-full" />
              )}
            </button>
            <button
              onClick={() => {
                onFocus();
                setIsOpen(false);
              }}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-sm text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-700"
            >
              {isFocused ? (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
                  </svg>
                  Exit focus mode
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                  </svg>
                  Focus on column
                </>
              )}
            </button>
            <hr className="my-1 border-neutral-200 dark:border-neutral-700" />
            <button
              onClick={handleDeleteAllCards}
              disabled={cardCount === 0}
              className="block w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950"
            >
              Delete all cards {cardCount > 0 && `(${cardCount})`}
            </button>
            <button
              onClick={handleDeleteColumn}
              disabled={columnCount <= 1}
              className="block w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950"
            >
              Delete column
            </button>
          </div>
        )}
      </div>

      {/* Delete all cards confirmation */}
      <Modal
        isOpen={showDeleteCardsConfirm}
        onClose={() => { setShowDeleteCardsConfirm(false); setDeleteConfirmText(''); }}
        size="sm"
      >
        <div className="p-6">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
            <svg className="h-6 w-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </div>
          <h3 className="mb-2 text-lg font-semibold text-neutral-900 dark:text-white text-center">
            Delete all {cardCount} cards?
          </h3>
          <p className="mb-4 text-sm text-neutral-500 dark:text-neutral-400 text-center">
            This will permanently delete all cards in this column. This action cannot be undone.
          </p>
          <p className="mb-2 text-sm text-neutral-600 dark:text-neutral-300">
            Type <span className="font-mono font-semibold">DELETE</span> to confirm:
          </p>
          <input
            type="text"
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
            placeholder="DELETE"
            className="w-full rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-neutral-900 dark:text-white placeholder-neutral-400 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && isDeleteConfirmed) handleConfirmDeleteAllCards();
            }}
          />
          <div className="flex gap-3 justify-end mt-4">
            <button
              onClick={() => { setShowDeleteCardsConfirm(false); setDeleteConfirmText(''); }}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmDeleteAllCards}
              disabled={!isDeleteConfirmed}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Delete all cards
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete column confirmation */}
      <Modal
        isOpen={showDeleteColumnConfirm}
        onClose={() => { setShowDeleteColumnConfirm(false); setDeleteConfirmText(''); }}
        size="sm"
      >
        <div className="p-6">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
            <svg className="h-6 w-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </div>
          <h3 className="mb-2 text-lg font-semibold text-neutral-900 dark:text-white text-center">
            Delete this column?
          </h3>
          <p className="mb-4 text-sm text-neutral-500 dark:text-neutral-400 text-center">
            Cards will be moved to Inbox. This action cannot be undone.
          </p>
          <p className="mb-2 text-sm text-neutral-600 dark:text-neutral-300">
            Type <span className="font-mono font-semibold">DELETE</span> to confirm:
          </p>
          <input
            type="text"
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
            placeholder="DELETE"
            className="w-full rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-neutral-900 dark:text-white placeholder-neutral-400 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && isDeleteConfirmed) handleConfirmDeleteColumn();
            }}
          />
          <div className="flex gap-3 justify-end mt-4">
            <button
              onClick={() => { setShowDeleteColumnConfirm(false); setDeleteConfirmText(''); }}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmDeleteColumn}
              disabled={!isDeleteConfirmed}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Delete column
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
