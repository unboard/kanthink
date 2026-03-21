'use client';

import { useState, useMemo, useCallback } from 'react';
import type { ID, Card as CardType, Column as ColumnType } from '@/lib/types';
import { useStore } from '@/lib/store';
import { CardDetailDrawer } from './CardDetailDrawer';

interface CardListViewProps {
  channelId: ID;
}

type SortField = 'title' | 'column' | 'created' | 'updated';
type SortDir = 'asc' | 'desc';

export function CardListView({ channelId }: CardListViewProps) {
  const channel = useStore((s) => s.channels[channelId]);
  const allCards = useStore((s) => s.cards);
  const moveCard = useStore((s) => s.moveCard);
  const [sortField, setSortField] = useState<SortField>('column');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [filterColumn, setFilterColumn] = useState<string>('all');
  const [filterTag, setFilterTag] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [openCardId, setOpenCardId] = useState<ID | null>(null);

  // Get all cards with their column info
  const cardRows = useMemo(() => {
    if (!channel) return [];
    const rows: Array<{ card: CardType; column: ColumnType; columnIndex: number }> = [];
    channel.columns.forEach((col, colIdx) => {
      const cardIds = col.itemOrder || col.cardIds || [];
      cardIds.forEach((cardId) => {
        const card = allCards[cardId];
        if (card) {
          rows.push({ card, column: col, columnIndex: colIdx });
        }
      });
    });
    return rows;
  }, [channel, allCards]);

  // Get all unique tags
  const allTags = useMemo(() => {
    const tags = new Set<string>();
    cardRows.forEach(({ card }) => {
      card.tags?.forEach((t) => tags.add(t));
    });
    return Array.from(tags).sort();
  }, [cardRows]);

  // Filter
  const filtered = useMemo(() => {
    let rows = cardRows;
    if (filterColumn !== 'all') {
      rows = rows.filter(({ column }) => column.id === filterColumn);
    }
    if (filterTag !== 'all') {
      rows = rows.filter(({ card }) => card.tags?.includes(filterTag));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(({ card }) =>
        card.title.toLowerCase().includes(q) ||
        (card.summary || '').toLowerCase().includes(q) ||
        card.messages?.some((m) => m.content.toLowerCase().includes(q))
      );
    }
    return rows;
  }, [cardRows, filterColumn, filterTag, search]);

  // Sort
  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'title':
          cmp = a.card.title.localeCompare(b.card.title);
          break;
        case 'column':
          cmp = a.columnIndex - b.columnIndex;
          break;
        case 'created':
          cmp = new Date(a.card.createdAt).getTime() - new Date(b.card.createdAt).getTime();
          break;
        case 'updated':
          cmp = new Date(a.card.updatedAt).getTime() - new Date(b.card.updatedAt).getTime();
          break;
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });
    return arr;
  }, [filtered, sortField, sortDir]);

  const handleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  }, [sortField]);

  const handleMoveCard = useCallback((cardId: ID, targetColumnId: ID) => {
    if (!channel) return;
    const sourceCol = channel.columns.find((c) => c.cardIds.includes(cardId));
    if (sourceCol && sourceCol.id !== targetColumnId) {
      moveCard(cardId, targetColumnId, 0);
    }
  }, [channel, moveCard]);

  const openCard = allCards[openCardId || ''] || null;

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <span className="text-neutral-300 dark:text-neutral-600 ml-1">↕</span>;
    return <span className="text-violet-500 ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) {
      const epoch = parseInt(dateStr);
      if (!isNaN(epoch)) {
        const ed = new Date(epoch * 1000);
        return ed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      }
      return '—';
    }
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getTimeAgo = (dateStr: string) => {
    let d = new Date(dateStr);
    if (isNaN(d.getTime())) {
      const epoch = parseInt(dateStr);
      if (!isNaN(epoch)) d = new Date(epoch * 1000);
      else return '';
    }
    const now = Date.now();
    const diff = now - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return formatDate(dateStr);
  };

  if (!channel) return null;

  return (
    <div className="flex-1 overflow-auto px-4 sm:px-6 py-3 sm:py-4">
      {/* Filters bar */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search cards..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-sm rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500"
          />
        </div>
        {/* Column filter */}
        <select
          value={filterColumn}
          onChange={(e) => setFilterColumn(e.target.value)}
          className="text-sm rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
        >
          <option value="all">All columns</option>
          {channel.columns.map((col) => (
            <option key={col.id} value={col.id}>{col.name}</option>
          ))}
        </select>
        {/* Tag filter */}
        {allTags.length > 0 && (
          <select
            value={filterTag}
            onChange={(e) => setFilterTag(e.target.value)}
            className="text-sm rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
          >
            <option value="all">All tags</option>
            {allTags.map((tag) => (
              <option key={tag} value={tag}>{tag}</option>
            ))}
          </select>
        )}
        {/* Card count */}
        <span className="text-xs text-neutral-400 dark:text-neutral-500 ml-auto">
          {sorted.length} card{sorted.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Card list */}
      <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden bg-white dark:bg-neutral-800/50">
        {/* Header row - hidden on mobile */}
        <div className="hidden sm:grid sm:grid-cols-[1fr_140px_100px] md:grid-cols-[1fr_140px_160px_100px] border-b border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-xs font-medium text-neutral-500 dark:text-neutral-400">
          <button className="text-left px-4 py-2.5 hover:text-neutral-700 dark:hover:text-neutral-200 select-none" onClick={() => handleSort('title')}>
            Title <SortIcon field="title" />
          </button>
          <button className="text-left px-4 py-2.5 hover:text-neutral-700 dark:hover:text-neutral-200 select-none" onClick={() => handleSort('column')}>
            Column <SortIcon field="column" />
          </button>
          <div className="hidden md:block px-4 py-2.5">Tags</div>
          <button className="text-left px-4 py-2.5 hover:text-neutral-700 dark:hover:text-neutral-200 select-none" onClick={() => handleSort('updated')}>
            Updated <SortIcon field="updated" />
          </button>
        </div>

        {/* Card rows */}
        {sorted.length === 0 ? (
          <div className="text-center py-12 text-neutral-400 dark:text-neutral-500">
            {search || filterColumn !== 'all' || filterTag !== 'all'
              ? 'No cards match your filters'
              : 'No cards in this channel'}
          </div>
        ) : (
          sorted.map(({ card, column }) => (
            <div
              key={card.id}
              className={`border-b border-neutral-100 dark:border-neutral-700/50 hover:bg-neutral-50 dark:hover:bg-neutral-800/80 cursor-pointer transition-colors active:bg-neutral-100 dark:active:bg-neutral-700/50 ${
                openCardId === card.id ? 'bg-violet-50 dark:bg-violet-900/20' : ''
              }`}
              onClick={() => setOpenCardId(card.id)}
            >
              {/* Mobile layout */}
              <div className="sm:hidden px-4 py-3">
                <div className="font-medium text-neutral-900 dark:text-white text-sm leading-snug">
                  {card.title}
                </div>
                {card.summary && (
                  <div className="text-xs text-neutral-400 dark:text-neutral-500 mt-0.5 line-clamp-1">
                    {card.summary.slice(0, 100)}
                  </div>
                )}
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-400">
                    {column.name}
                  </span>
                  {card.messages && card.messages.length > 0 && (
                    <span className="flex items-center gap-0.5 text-[11px] text-neutral-400">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                      {card.messages.length}
                    </span>
                  )}
                  {(card.tags || []).slice(0, 2).map((tag) => (
                    <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-400">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              {/* Desktop layout */}
              <div className="hidden sm:grid sm:grid-cols-[1fr_140px_100px] md:grid-cols-[1fr_140px_160px_100px] items-center">
                <div className="px-4 py-3 min-w-0">
                  <div className="font-medium text-neutral-900 dark:text-white truncate text-sm">
                    {card.title}
                  </div>
                  {card.summary && (
                    <div className="text-xs text-neutral-400 dark:text-neutral-500 truncate mt-0.5">
                      {card.summary.slice(0, 100)}
                    </div>
                  )}
                </div>
                <div className="px-4 py-3">
                  <select
                    value={column.id}
                    onChange={(e) => {
                      e.stopPropagation();
                      handleMoveCard(card.id, e.target.value);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="text-xs rounded-md border border-neutral-200 dark:border-neutral-600 bg-transparent text-neutral-700 dark:text-neutral-300 px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-violet-500/30 cursor-pointer w-full"
                  >
                    {channel.columns.map((col) => (
                      <option key={col.id} value={col.id}>{col.name}</option>
                    ))}
                  </select>
                </div>
                <div className="hidden md:flex px-4 py-3 flex-wrap gap-1">
                  {(card.tags || []).slice(0, 3).map((tag) => (
                    <span key={tag} className="inline-flex text-[10px] px-1.5 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300 font-medium">
                      {tag}
                    </span>
                  ))}
                  {(card.tags || []).length > 3 && (
                    <span className="text-[10px] text-neutral-400">+{card.tags!.length - 3}</span>
                  )}
                </div>
                <div className="px-4 py-3 text-xs text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
                  {getTimeAgo(card.updatedAt)}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Card detail drawer */}
      <CardDetailDrawer
        card={openCard}
        isOpen={!!openCard}
        onClose={() => setOpenCardId(null)}
      />
    </div>
  );
}
