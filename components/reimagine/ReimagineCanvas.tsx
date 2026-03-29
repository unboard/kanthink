'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import { useStore } from '@/lib/store';
import { prepare, layout } from '@chenglou/pretext';
import type { Card, Channel } from '@/lib/types';
import { FluidCard } from './FluidCard';
import { StreamView } from './StreamView';
import { ClusterView } from './ClusterView';

type ViewMode = 'stream' | 'clusters' | 'density';

// Pretext font string matching our CSS
const TITLE_FONT = '600 15px Inter, system-ui, sans-serif';
const BODY_FONT = '400 13px Inter, system-ui, sans-serif';
// TAG_FONT available for future tag measurement
// const TAG_FONT = '500 11px Inter, system-ui, sans-serif';

export interface MeasuredCard {
  card: Card;
  channel: Channel;
  columnName: string;
  titleHeight: number;
  bodyHeight: number;
  totalHeight: number;
  titleLines: number;
  bodyLines: number;
  tags: string[];
  age: number; // days since creation
  activity: number; // message count as proxy for activity
}

// Use Pretext to measure a card's text content and predict its rendered height
function measureCard(
  card: Card,
  channel: Channel,
  columnName: string,
  cardWidth: number,
): MeasuredCard {
  const padding = 24; // 12px each side
  const innerWidth = cardWidth - padding;
  const titleLineHeight = 22;
  const bodyLineHeight = 19;

  // Measure title
  const titlePrepared = prepare(card.title || 'Untitled', TITLE_FONT);
  const titleResult = layout(titlePrepared, innerWidth, titleLineHeight);

  // Measure body (first message or summary)
  const bodyText = card.summary || card.messages?.[0]?.content || '';
  const truncatedBody = bodyText.slice(0, 200); // cap for measurement
  let bodyHeight = 0;
  let bodyLines = 0;
  if (truncatedBody) {
    const bodyPrepared = prepare(truncatedBody, BODY_FONT);
    const bodyResult = layout(bodyPrepared, innerWidth, bodyLineHeight);
    // Cap at 4 lines
    bodyLines = Math.min(bodyResult.lineCount, 4);
    bodyHeight = bodyLines * bodyLineHeight;
  }

  const tags = card.tags || [];
  const tagRowHeight = tags.length > 0 ? 26 : 0; // single row of tags

  // Total: padding-top + title + gap + body + tagRow + padding-bottom
  const totalHeight = 12 + titleResult.height + (bodyHeight > 0 ? 8 + bodyHeight : 0) + (tagRowHeight > 0 ? 8 + tagRowHeight : 0) + 12;

  const now = Date.now();
  const created = new Date(card.createdAt).getTime();
  const age = Math.max(0, Math.floor((now - created) / (1000 * 60 * 60 * 24)));

  return {
    card,
    channel,
    columnName,
    titleHeight: titleResult.height,
    bodyHeight,
    totalHeight,
    titleLines: titleResult.lineCount,
    bodyLines,
    tags,
    age,
    activity: card.messages?.length || 0,
  };
}

export function ReimagineCanvas() {
  const channels = useStore((s) => s.channels);
  const cards = useStore((s) => s.cards);
  const channelOrder = useStore((s) => s.channelOrder);
  const [viewMode, setViewMode] = useState<ViewMode>('stream');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
  const [cardWidth, setCardWidth] = useState(280);
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  // Measure all cards with Pretext (only in browser where Canvas is available)
  const measuredCards = useMemo(() => {
    if (!mounted) return [];
    const result: MeasuredCard[] = [];
    const allChannels = Object.values(channels);

    for (const channel of allChannels) {
      if (channel.status === 'archived') continue;
      for (const column of channel.columns) {
        for (const cardId of column.cardIds) {
          const card = cards[cardId];
          if (!card) continue;
          // Skip snoozed cards
          if (card.snoozedUntil && new Date(card.snoozedUntil) > new Date()) continue;

          result.push(measureCard(card, channel, column.name, cardWidth));
        }
      }
    }

    return result;
  }, [channels, cards, cardWidth, mounted]);

  // Filter by search and selected channel
  const filteredCards = useMemo(() => {
    let filtered = measuredCards;

    if (selectedChannel) {
      filtered = filtered.filter((mc) => mc.channel.id === selectedChannel);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (mc) =>
          mc.card.title.toLowerCase().includes(q) ||
          mc.card.summary?.toLowerCase().includes(q) ||
          mc.tags.some((t) => t.toLowerCase().includes(q)) ||
          mc.channel.name.toLowerCase().includes(q),
      );
    }

    return filtered;
  }, [measuredCards, searchQuery, selectedChannel]);

  // Channel list for filter pills
  const activeChannels = useMemo(() => {
    return Object.values(channels)
      .filter((ch) => ch.status !== 'archived')
      .sort((a, b) => {
        const ai = channelOrder.indexOf(a.id);
        const bi = channelOrder.indexOf(b.id);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      });
  }, [channels, channelOrder]);

  // Stats
  const totalCards = measuredCards.length;
  const totalChannels = activeChannels.length;

  return (
    <div ref={containerRef} className="h-full flex flex-col bg-[#0d0d0d] overflow-hidden">
      {/* Header */}
      <header className="shrink-0 px-6 pt-6 pb-4">
        <div className="flex items-baseline gap-3 mb-1">
          <h1 className="text-2xl font-semibold tracking-tight text-white/90">
            reimagine
          </h1>
          <span className="text-xs text-white/25 font-mono">
            {totalCards} cards across {totalChannels} channels
          </span>
        </div>
        <p className="text-sm text-white/35 max-w-xl">
          Your work, flowing naturally. No columns, no boxes — just content taking the space it needs.
        </p>
      </header>

      {/* Controls bar */}
      <div className="shrink-0 px-6 pb-4 flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter..."
            className="bg-white/5 border border-white/8 rounded-lg px-3 py-1.5 text-sm text-white/80 placeholder:text-white/20 focus:outline-none focus:border-white/20 w-48 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 text-xs"
            >
              x
            </button>
          )}
        </div>

        {/* View mode toggle */}
        <div className="flex bg-white/5 rounded-lg p-0.5 border border-white/8">
          {(['stream', 'clusters', 'density'] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-3 py-1 text-xs rounded-md transition-all ${
                viewMode === mode
                  ? 'bg-white/10 text-white/80'
                  : 'text-white/30 hover:text-white/50'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>

        {/* Card width slider */}
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-[10px] text-white/20 font-mono">density</span>
          <input
            type="range"
            min={180}
            max={400}
            value={cardWidth}
            onChange={(e) => setCardWidth(Number(e.target.value))}
            className="w-20 h-1 accent-white/30 appearance-none bg-white/10 rounded-full [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white/40"
          />
        </div>
      </div>

      {/* Channel pills */}
      <div className="shrink-0 px-6 pb-3 flex gap-1.5 overflow-x-auto scrollbar-hide">
        <button
          onClick={() => setSelectedChannel(null)}
          className={`shrink-0 px-3 py-1 text-xs rounded-full transition-all ${
            !selectedChannel
              ? 'bg-white/12 text-white/70 border border-white/15'
              : 'text-white/25 hover:text-white/40 border border-transparent'
          }`}
        >
          All
        </button>
        {activeChannels.map((ch) => (
          <button
            key={ch.id}
            onClick={() => setSelectedChannel(selectedChannel === ch.id ? null : ch.id)}
            className={`shrink-0 px-3 py-1 text-xs rounded-full transition-all ${
              selectedChannel === ch.id
                ? 'bg-white/12 text-white/70 border border-white/15'
                : 'text-white/25 hover:text-white/40 border border-transparent'
            }`}
          >
            {ch.name}
          </button>
        ))}
      </div>

      {/* Main content area */}
      <div className="flex-1 overflow-auto px-6 pb-6">
        {filteredCards.length === 0 ? (
          <div className="flex items-center justify-center h-64 text-white/20 text-sm">
            {searchQuery ? 'No cards match your filter' : 'No cards yet'}
          </div>
        ) : viewMode === 'stream' ? (
          <StreamView cards={filteredCards} cardWidth={cardWidth} />
        ) : viewMode === 'clusters' ? (
          <ClusterView cards={filteredCards} cardWidth={cardWidth} />
        ) : (
          <DensityView cards={filteredCards} cardWidth={cardWidth} />
        )}
      </div>
    </div>
  );
}

// Density view: cards sized by activity/importance, packed tightly
function DensityView({ cards, cardWidth }: { cards: MeasuredCard[]; cardWidth: number }) {
  // Sort by activity (most active first)
  const sorted = useMemo(() => {
    return [...cards].sort((a, b) => {
      // Score: activity * recency
      const scoreA = (a.activity + 1) * (1 / (a.age + 1));
      const scoreB = (b.activity + 1) * (1 / (b.age + 1));
      return scoreB - scoreA;
    });
  }, [cards]);

  return (
    <div className="flex flex-wrap gap-2 items-start">
      {sorted.map((mc, i) => {
        // Scale card width by importance rank
        const importance = Math.max(0.7, 1 - i * 0.015);
        const width = Math.round(cardWidth * importance);
        return (
          <FluidCard
            key={mc.card.id}
            measured={mc}
            width={width}
            style={{ opacity: Math.max(0.4, 1 - i * 0.008) }}
          />
        );
      })}
    </div>
  );
}
