'use client';

import { useMemo, useRef, useEffect, useState } from 'react';
import type { MeasuredCard } from './ReimagineCanvas';
import { FluidCard } from './FluidCard';

interface ClusterViewProps {
  cards: MeasuredCard[];
  cardWidth: number;
}

interface ChannelCluster {
  channelId: string;
  channelName: string;
  description: string;
  cards: MeasuredCard[];
  totalActivity: number;
  newestAge: number;
  columnNames: string[];
}

export function ClusterView({ cards, cardWidth }: ClusterViewProps) {
  // Group cards into channel clusters
  const clusters = useMemo(() => {
    const map = new Map<string, ChannelCluster>();

    for (const mc of cards) {
      const existing = map.get(mc.channel.id);
      if (existing) {
        existing.cards.push(mc);
        existing.totalActivity += mc.activity;
        existing.newestAge = Math.min(existing.newestAge, mc.age);
        if (!existing.columnNames.includes(mc.columnName)) {
          existing.columnNames.push(mc.columnName);
        }
      } else {
        map.set(mc.channel.id, {
          channelId: mc.channel.id,
          channelName: mc.channel.name,
          description: mc.channel.description || '',
          cards: [mc],
          totalActivity: mc.activity,
          newestAge: mc.age,
          columnNames: [mc.columnName],
        });
      }
    }

    // Sort clusters: most active/recent first
    return Array.from(map.values()).sort((a, b) => {
      const scoreA = a.totalActivity / (a.newestAge + 1);
      const scoreB = b.totalActivity / (b.newestAge + 1);
      return scoreB - scoreA;
    });
  }, [cards]);

  return (
    <div className="space-y-12">
      {clusters.map((cluster) => (
        <ClusterSection
          key={cluster.channelId}
          cluster={cluster}
          cardWidth={cardWidth}
        />
      ))}
    </div>
  );
}

function ClusterSection({
  cluster,
  cardWidth,
}: {
  cluster: ChannelCluster;
  cardWidth: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setContainerWidth(entry.contentRect.width);
    });
    observer.observe(el);
    setContainerWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  // Sort cards within cluster: most recent first
  const sortedCards = useMemo(
    () =>
      [...cluster.cards].sort(
        (a, b) =>
          new Date(b.card.updatedAt || b.card.createdAt).getTime() -
          new Date(a.card.updatedAt || a.card.createdAt).getTime(),
      ),
    [cluster.cards],
  );

  // Simple flow layout within cluster
  const colCount = Math.max(1, Math.floor((containerWidth + 10) / (cardWidth + 10)));

  return (
    <section>
      {/* Editorial section header */}
      <div className="mb-4 pb-3 border-b border-white/5">
        <div className="flex items-baseline gap-3">
          <h2 className="text-lg font-semibold text-white/70 tracking-tight">
            {cluster.channelName}
          </h2>
          <span className="text-xs text-white/15 font-mono">
            {cluster.cards.length} {cluster.cards.length === 1 ? 'card' : 'cards'}
          </span>
        </div>
        {cluster.description && (
          <p className="text-xs text-white/25 mt-1 max-w-lg">
            {cluster.description}
          </p>
        )}
        {/* Column breadcrumbs */}
        <div className="flex gap-2 mt-2">
          {cluster.columnNames.map((col) => (
            <span
              key={col}
              className="text-[10px] text-white/15 bg-white/3 px-2 py-0.5 rounded"
            >
              {col}
            </span>
          ))}
        </div>
      </div>

      {/* Cards in a flow layout */}
      <div
        ref={containerRef}
        className="flex flex-wrap gap-2.5"
        style={{ alignItems: 'flex-start' }}
      >
        {sortedCards.map((mc) => (
          <FluidCard
            key={mc.card.id}
            measured={mc}
            width={cardWidth}
          />
        ))}
      </div>
    </section>
  );
}
