'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import type { Card, ID } from '@/lib/types';

interface SearchResult {
  card: Card;
  channelName: string;
  columnName: string;
  score: number;
}

function scoreCard(card: Card, query: string): number {
  const q = query.toLowerCase();
  const title = card.title.toLowerCase();
  if (title === q) return 100;
  if (title.startsWith(q)) return 80;
  if (title.includes(q)) return 60;
  // Check first message content
  const firstMsg = card.messages?.[0]?.content?.toLowerCase() ?? '';
  if (firstMsg.includes(q)) return 30;
  // Check summary
  if (card.summary?.toLowerCase().includes(q)) return 20;
  return 0;
}

export function CardSearch() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const cards = useStore((s) => s.cards);
  const channels = useStore((s) => s.channels);

  // Listen for external open requests (e.g. from nav search button)
  useEffect(() => {
    const handleOpenSearch = () => {
      setIsOpen(true);
      setQuery('');
      setSelectedIndex(0);
    };
    window.addEventListener('openCardSearch', handleOpenSearch);
    return () => window.removeEventListener('openCardSearch', handleOpenSearch);
  }, []);

  // Global Cmd/Ctrl+K listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(true);
        setQuery('');
        setSelectedIndex(0);
      }
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Search results
  const results: SearchResult[] = query.length >= 2
    ? Object.values(cards)
        .map((card) => {
          const score = scoreCard(card, query);
          const channel = channels[card.channelId];
          const column = channel?.columns?.find((c) => c.cardIds?.includes(card.id));
          return {
            card,
            channelName: channel?.name ?? 'Unknown',
            columnName: column?.name ?? '',
            score,
          };
        })
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 10)
    : [];

  const handleSelect = useCallback((result: SearchResult) => {
    setIsOpen(false);
    router.push(`/channel/${result.card.channelId}/card/${result.card.id}`);
  }, [router]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      handleSelect(results[selectedIndex]);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setIsOpen(false)} />

      {/* Search panel */}
      <div className="relative w-full max-w-lg mx-4 bg-white dark:bg-neutral-900 rounded-xl shadow-2xl border border-neutral-200 dark:border-neutral-700 overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-neutral-200 dark:border-neutral-700">
          <svg className="w-5 h-5 text-neutral-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
            onKeyDown={handleKeyDown}
            placeholder="Search cards..."
            className="flex-1 bg-transparent text-sm text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none"
          />
          <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-[10px] font-mono text-neutral-400 border border-neutral-200 dark:border-neutral-700">
            esc
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto">
          {query.length >= 2 && results.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-neutral-400">
              No cards found for &ldquo;{query}&rdquo;
            </div>
          )}
          {results.map((result, i) => (
            <button
              key={result.card.id}
              onClick={() => handleSelect(result)}
              className={`w-full flex items-start gap-3 px-4 py-3 text-left transition-colors ${
                i === selectedIndex
                  ? 'bg-violet-50 dark:bg-violet-900/20'
                  : 'hover:bg-neutral-50 dark:hover:bg-neutral-800'
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-neutral-900 dark:text-white truncate">
                  {result.card.title}
                </div>
                <div className="text-xs text-neutral-400 mt-0.5">
                  {result.channelName}
                  {result.columnName && <> &middot; {result.columnName}</>}
                </div>
              </div>
              <svg className="w-4 h-4 text-neutral-300 dark:text-neutral-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ))}
        </div>

        {/* Footer hint */}
        {query.length < 2 && (
          <div className="px-4 py-3 text-xs text-neutral-400 border-t border-neutral-200 dark:border-neutral-700">
            Type at least 2 characters to search across all channels
          </div>
        )}
      </div>
    </div>
  );
}
