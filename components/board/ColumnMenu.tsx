'use client';

import { useState, useRef, useEffect } from 'react';
import type { ID } from '@/lib/types';
import { useStore } from '@/lib/store';

interface ColumnMenuProps {
  channelId: ID;
  columnId: ID;
  columnCount: number;
  cardCount: number;
  onRename: () => void;
  onOpenSettings: () => void;
  hasInstructions?: boolean;
}

export function ColumnMenu({
  channelId,
  columnId,
  columnCount,
  cardCount,
  onRename,
  onOpenSettings,
  hasInstructions,
}: ColumnMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
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

  const handleDelete = () => {
    if (columnCount <= 1) return;
    if (confirm('Delete this column? Cards will be moved to Inbox.')) {
      deleteColumn(channelId, columnId);
    }
    setIsOpen(false);
  };

  const handleDeleteAllCards = () => {
    if (cardCount === 0) return;
    if (confirm(`Delete all ${cardCount} cards in this column?`)) {
      deleteAllCardsInColumn(channelId, columnId);
    }
    setIsOpen(false);
  };

  return (
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
        <div className="absolute right-0 top-full z-20 mt-1 w-40 rounded-md bg-white py-1 shadow-lg ring-1 ring-black/5 dark:bg-neutral-800 dark:ring-white/10">
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
          <hr className="my-1 border-neutral-200 dark:border-neutral-700" />
          <button
            onClick={handleDeleteAllCards}
            disabled={cardCount === 0}
            className="block w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950"
          >
            Delete all cards {cardCount > 0 && `(${cardCount})`}
          </button>
          <button
            onClick={handleDelete}
            disabled={columnCount <= 1}
            className="block w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950"
          >
            Delete column
          </button>
        </div>
      )}
    </div>
  );
}
