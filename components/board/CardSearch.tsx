'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import type { Card, ID } from '@/lib/types';

type ResultType = 'card' | 'channel' | 'task';

interface SearchResult {
  type: ResultType;
  id: string;
  title: string;
  subtitle: string;
  score: number;
  channelId?: string;
  // For backward compat
  card?: Card;
  channelName?: string;
  columnName?: string;
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
  const tasks = useStore((s) => s.tasks);

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

  // Search results — cards, channels, and tasks
  const results: SearchResult[] = query.length >= 2
    ? (() => {
        const q = query.toLowerCase();
        const all: SearchResult[] = [];

        // Search cards
        Object.values(cards).forEach((card) => {
          const score = scoreCard(card, q);
          if (score > 0) {
            const channel = channels[card.channelId];
            const column = channel?.columns?.find((c) => c.cardIds?.includes(card.id));
            all.push({
              type: 'card',
              id: card.id,
              title: card.title,
              subtitle: `${channel?.name ?? 'Unknown'}${column?.name ? ` · ${column.name}` : ''}`,
              score,
              channelId: card.channelId,
              card,
              channelName: channel?.name,
              columnName: column?.name,
            });
          }
        });

        // Search channels
        Object.values(channels).forEach((channel) => {
          const name = channel.name.toLowerCase();
          let score = 0;
          if (name === q) score = 100;
          else if (name.startsWith(q)) score = 80;
          else if (name.includes(q)) score = 60;
          else if (channel.description?.toLowerCase().includes(q)) score = 30;
          if (score > 0) {
            all.push({
              type: 'channel',
              id: channel.id,
              title: channel.name,
              subtitle: `${channel.columns.length} columns · ${channel.columns.reduce((s, c) => s + c.cardIds.length, 0)} cards`,
              score: score + 5, // Slight boost for channels
              channelId: channel.id,
            });
          }
        });

        // Search tasks
        Object.values(tasks).forEach((task) => {
          const title = task.title.toLowerCase();
          let score = 0;
          if (title === q) score = 90;
          else if (title.startsWith(q)) score = 70;
          else if (title.includes(q)) score = 50;
          if (score > 0) {
            const channel = channels[task.channelId];
            all.push({
              type: 'task',
              id: task.id,
              title: task.title,
              subtitle: `${channel?.name ?? 'Unknown'} · ${task.status}`,
              score,
              channelId: task.channelId,
            });
          }
        });

        return all.sort((a, b) => b.score - a.score).slice(0, 12);
      })()
    : [];

  const handleSelect = useCallback((result: SearchResult) => {
    setIsOpen(false);
    if (result.type === 'channel') {
      router.push(`/channel/${result.id}`);
    } else if (result.type === 'card' && result.channelId) {
      router.push(`/channel/${result.channelId}`);
    } else if (result.type === 'task' && result.channelId) {
      router.push(`/channel/${result.channelId}`);
    }
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
            placeholder="Search cards, channels, tasks..."
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
              No results found for &ldquo;{query}&rdquo;
            </div>
          )}
          {results.map((result, i) => (
            <button
              key={`${result.type}-${result.id}`}
              onClick={() => handleSelect(result)}
              className={`w-full flex items-start gap-3 px-4 py-3 text-left transition-colors ${
                i === selectedIndex
                  ? 'bg-violet-50 dark:bg-violet-900/20'
                  : 'hover:bg-neutral-50 dark:hover:bg-neutral-800'
              }`}
            >
              {/* Type icon */}
              <div className="w-5 h-5 flex-shrink-0 mt-0.5 text-neutral-400">
                {result.type === 'card' && (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                )}
                {result.type === 'channel' && (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6z" />
                  </svg>
                )}
                {result.type === 'task' && (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-neutral-900 dark:text-white truncate">
                  {result.title}
                </div>
                <div className="text-xs text-neutral-400 mt-0.5">
                  {result.subtitle}
                </div>
              </div>
              <span className="text-[10px] text-neutral-400 dark:text-neutral-500 flex-shrink-0 mt-1 capitalize">
                {result.type}
              </span>
            </button>
          ))}
        </div>

        {/* Footer hint */}
        {query.length < 2 && (
          <div className="px-4 py-3 text-xs text-neutral-400 border-t border-neutral-200 dark:border-neutral-700">
            Type to search cards, channels, and tasks
          </div>
        )}
      </div>
    </div>
  );
}
