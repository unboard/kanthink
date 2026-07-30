'use client';

import { useState, useRef, useEffect } from 'react';
import type { ID, Card, ColumnSortOrder } from '@/lib/types';
import { useStore } from '@/lib/store';
import { Modal } from '@/components/ui';
import { MobileMenuDrawer, useIsMobile } from './MobileMenuDrawer';
import { ShroomPicker } from './ShroomPicker';
import { useShroomRun } from './ShroomRunContext';
import { COLUMN_SORT_LABELS, COLUMN_SORT_OPTIONS, sortCardsBy } from '@/lib/columnSort';

interface ColumnMenuProps {
  channelId: ID;
  columnId: ID;
  sortOrder?: ColumnSortOrder;
  columnCount: number;
  cardCount: number;
  columnCardIds: ID[];
  completedTaskCount?: number;
  onRename: () => void;
  onOpenSettings: () => void;
  onFocus: () => void;
  onHideCompletedTasks?: () => void;
  onCollapse?: () => void;
  isCollapsed?: boolean;
  hasInstructions?: boolean;
  isFocused?: boolean;
}

export function ColumnMenu({
  channelId,
  columnId,
  sortOrder = 'manual',
  columnCount,
  cardCount,
  columnCardIds,
  completedTaskCount = 0,
  onRename,
  onOpenSettings,
  onFocus,
  onHideCompletedTasks,
  onCollapse,
  isCollapsed,
  hasInstructions,
  isFocused,
}: ColumnMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showSortSubmenu, setShowSortSubmenu] = useState(false);
  const [showDeleteCardsConfirm, setShowDeleteCardsConfirm] = useState(false);
  const [showDeleteColumnConfirm, setShowDeleteColumnConfirm] = useState(false);
  const [showArchiveCardsConfirm, setShowArchiveCardsConfirm] = useState(false);
  const [showShroomPicker, setShowShroomPicker] = useState(false);
  const { shrooms } = useShroomRun();
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  const deleteColumn = useStore((s) => s.deleteColumn);
  const deleteAllCardsInColumn = useStore((s) => s.deleteAllCardsInColumn);
  const archiveCard = useStore((s) => s.archiveCard);
  const sortColumnCards = useStore((s) => s.sortColumnCards);
  const updateColumn = useStore((s) => s.updateColumn);
  const allCards = useStore((s) => s.cards);
  const isMobile = useIsMobile();

  // Close on click outside (desktop only — the MobileMenuDrawer is portaled to
  // document.body, so menuRef.contains(target) is always false for taps inside it.
  // On mobile that race fires setIsOpen(false) on mousedown, which unmounts the sheet
  // before the button's click event lands: tapping "Sort cards" closed the menu instead
  // of opening the submenu, and tapping a sort option silently no-oped. The drawer has
  // its own backdrop for outside taps, so this listener isn't needed on mobile.
  useEffect(() => {
    if (!isOpen || isMobile) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setShowSortSubmenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, isMobile]);

  // Applying a sort both reorders now AND persists the choice on the column, so new
  // cards keep landing in the right place on every device instead of the order
  // drifting back the next time something is added.
  const handleSort = (option: ColumnSortOrder) => {
    updateColumn(channelId, columnId, { sortOrder: option });
    if (option !== 'manual') {
      const cards: Card[] = columnCardIds.map((id) => allCards[id]).filter(Boolean);
      const sorted = sortCardsBy(cards, option);
      sortColumnCards(channelId, columnId, sorted.map((c) => c.id));
    }
    setIsOpen(false);
    setShowSortSubmenu(false);
  };

  const sortOptionRows = COLUMN_SORT_OPTIONS.map((option) => ({
    option,
    label: COLUMN_SORT_LABELS[option],
    isActive: sortOrder === option,
  }));

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

        {isOpen && !isMobile && (
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
              Column description
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
            {/* Collapse */}
            {onCollapse && (
              <button
                onClick={() => {
                  onCollapse();
                  setIsOpen(false);
                }}
                className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-sm text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-700"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={isCollapsed ? "M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" : "M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25"} />
                </svg>
                {isCollapsed ? 'Expand column' : 'Collapse column'}
              </button>
            )}
            {/* Sort submenu */}
            <div className="relative">
              <button
                onClick={() => setShowSortSubmenu(!showSortSubmenu)}
                disabled={cardCount < 2}
                className="flex items-center justify-between w-full px-3 py-1.5 text-left text-sm text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
                  </svg>
                  Sort cards
                  {sortOrder !== 'manual' && (
                    <span className="w-1.5 h-1.5 bg-violet-500 rounded-full" />
                  )}
                </span>
                <svg className="w-3 h-3 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
              {showSortSubmenu && (
                <div className="absolute left-full top-0 ml-1 w-56 rounded-md bg-white py-1 shadow-lg ring-1 ring-black/5 dark:bg-neutral-800 dark:ring-white/10">
                  {sortOptionRows.map(({ option, label, isActive }) => (
                    <button
                      key={option}
                      onClick={() => handleSort(option)}
                      className={`flex items-center justify-between gap-2 w-full px-3 py-1.5 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-700 ${
                        isActive
                          ? 'text-violet-600 dark:text-violet-300 font-medium'
                          : 'text-neutral-700 dark:text-neutral-300'
                      }`}
                    >
                      {label}
                      {isActive && (
                        <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                  ))}
                  <p className="px-3 pt-1.5 pb-1 text-[10.5px] leading-snug text-neutral-400 dark:text-neutral-500">
                    Sticky — new cards follow this order.
                  </p>
                </div>
              )}
            </div>
            <button
              onClick={() => {
                onHideCompletedTasks?.();
                setIsOpen(false);
              }}
              disabled={completedTaskCount === 0}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-sm text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Hide completed tasks{completedTaskCount > 0 ? ` (${completedTaskCount})` : ''}
            </button>
            {shrooms.length > 0 && (
              <>
                <hr className="my-1 border-neutral-200 dark:border-neutral-700" />
                <button
                  onClick={() => {
                    setIsOpen(false);
                    setShowShroomPicker(true);
                  }}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-sm text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-700"
                >
                  <span className="w-4 h-4 text-sm leading-none flex items-center justify-center">🍄</span>
                  Run shroom on this column
                </button>
              </>
            )}
            <hr className="my-1 border-neutral-200 dark:border-neutral-700" />
            <button
              onClick={() => {
                if (cardCount === 0) return;
                setIsOpen(false);
                setShowArchiveCardsConfirm(true);
              }}
              disabled={cardCount === 0}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-sm text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
              </svg>
              Archive all cards {cardCount > 0 && `(${cardCount})`}
            </button>
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
        <MobileMenuDrawer isOpen={isOpen && isMobile} onClose={() => { setIsOpen(false); setShowSortSubmenu(false); }}>
          <button onClick={() => { onRename(); setIsOpen(false); }} className="w-full flex items-center gap-3 px-3 py-3 text-left text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-lg">Rename</button>
          <button onClick={() => { onOpenSettings(); setIsOpen(false); }} className="w-full flex items-center gap-3 px-3 py-3 text-left text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-lg">
            Column description
            {hasInstructions && <span className="w-2 h-2 bg-violet-500 rounded-full ml-auto" />}
          </button>
          <button onClick={() => { onFocus(); setIsOpen(false); }} className="w-full flex items-center gap-3 px-3 py-3 text-left text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-lg">
            {isFocused ? 'Exit focus mode' : 'Focus on column'}
          </button>
          {onCollapse && (
            <button onClick={() => { onCollapse(); setIsOpen(false); }} className="w-full flex items-center gap-3 px-3 py-3 text-left text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-lg">
              {isCollapsed ? 'Expand column' : 'Collapse column'}
            </button>
          )}
          {showSortSubmenu ? (
            <>
              <button onClick={() => setShowSortSubmenu(false)} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-neutral-500 hover:bg-neutral-50 dark:hover:bg-neutral-700/50 rounded-lg">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                Back
              </button>
              {sortOptionRows.map(({ option, label, isActive }) => (
                <button
                  key={option}
                  onClick={() => handleSort(option)}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-3 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-lg ${
                    isActive ? 'text-violet-600 dark:text-violet-300 font-medium' : 'text-neutral-700 dark:text-neutral-300'
                  }`}
                >
                  {label}
                  {isActive && (
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              ))}
              <p className="px-3 pt-1 pb-2 text-[11px] leading-snug text-neutral-400 dark:text-neutral-500">
                Sticky — new cards follow this order.
              </p>
            </>
          ) : (
            <button onClick={() => setShowSortSubmenu(true)} disabled={cardCount < 2} className="w-full flex items-center justify-between px-3 py-3 text-left text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 disabled:opacity-50 rounded-lg">
              <span className="flex items-center gap-2">
                Sort cards
                {sortOrder !== 'manual' && <span className="text-xs text-violet-400">{COLUMN_SORT_LABELS[sortOrder]}</span>}
              </span>
              <svg className="w-3 h-3 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </button>
          )}
          {onHideCompletedTasks && (
            <button onClick={() => { onHideCompletedTasks(); setIsOpen(false); }} disabled={completedTaskCount === 0} className="w-full px-3 py-3 text-left text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 disabled:opacity-50 rounded-lg">
              Hide completed tasks{completedTaskCount > 0 ? ` (${completedTaskCount})` : ''}
            </button>
          )}
          <div className="h-px bg-neutral-200 dark:bg-neutral-700 my-1 mx-2" />
          <button onClick={() => { setIsOpen(false); setShowArchiveCardsConfirm(true); }} disabled={cardCount === 0} className="w-full px-3 py-3 text-left text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 disabled:opacity-50 rounded-lg">
            Archive all cards {cardCount > 0 && `(${cardCount})`}
          </button>
          <button onClick={handleDeleteAllCards} disabled={cardCount === 0} className="w-full px-3 py-3 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 disabled:opacity-50 rounded-lg">
            Delete all cards {cardCount > 0 && `(${cardCount})`}
          </button>
          <button onClick={handleDeleteColumn} disabled={columnCount <= 1} className="w-full px-3 py-3 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 disabled:opacity-50 rounded-lg">
            Delete column
          </button>
        </MobileMenuDrawer>
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
      {/* Run a shroom scoped to this column's cards */}
      <ShroomPicker
        isOpen={showShroomPicker}
        cardIds={columnCardIds}
        subtitle={`${columnCardIds.length} card${columnCardIds.length === 1 ? '' : 's'} in this column`}
        onClose={() => setShowShroomPicker(false)}
      />
      {/* Archive all cards confirmation */}
      <Modal
        isOpen={showArchiveCardsConfirm}
        onClose={() => setShowArchiveCardsConfirm(false)}
        size="sm"
      >
        <div className="p-6">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
            <svg className="h-6 w-6 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
            </svg>
          </div>
          <h3 className="mb-2 text-lg font-semibold text-neutral-900 dark:text-white text-center">
            Archive all {cardCount} cards?
          </h3>
          <p className="mb-4 text-sm text-neutral-500 dark:text-neutral-400 text-center">
            Cards will be moved to the column&apos;s archive (backside). You can restore them later by flipping the column.
          </p>
          <div className="flex gap-3 justify-end">
            <button
              onClick={() => setShowArchiveCardsConfirm(false)}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                columnCardIds.forEach((cardId) => archiveCard(cardId));
                setShowArchiveCardsConfirm(false);
              }}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-amber-600 text-white hover:bg-amber-700 transition-colors"
            >
              Archive all cards
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
