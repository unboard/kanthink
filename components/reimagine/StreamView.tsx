'use client';

import { useMemo, useRef, useEffect, useState } from 'react';
import type { MeasuredCard } from './ReimagineCanvas';
import { FluidCard } from './FluidCard';

interface StreamViewProps {
  cards: MeasuredCard[];
  cardWidth: number;
}

interface PlacedCard {
  measured: MeasuredCard;
  x: number;
  y: number;
  width: number;
}

// Pure arithmetic masonry layout using Pretext-measured heights
// No DOM reads needed — heights are pre-calculated
function computeMasonry(
  cards: MeasuredCard[],
  cardWidth: number,
  containerWidth: number,
  gap: number,
): PlacedCard[] {
  if (containerWidth <= 0 || cards.length === 0) return [];

  const colCount = Math.max(1, Math.floor((containerWidth + gap) / (cardWidth + gap)));
  const actualGap = colCount > 1 ? (containerWidth - colCount * cardWidth) / (colCount - 1) : 0;
  const columnHeights = new Array(colCount).fill(0);

  // Sort: pinned first, then by recency
  const sorted = [...cards].sort((a, b) => {
    const aPinned = a.card.pinnedAt ? 1 : 0;
    const bPinned = b.card.pinnedAt ? 1 : 0;
    if (aPinned !== bPinned) return bPinned - aPinned;
    return new Date(b.card.updatedAt || b.card.createdAt).getTime() -
      new Date(a.card.updatedAt || a.card.createdAt).getTime();
  });

  return sorted.map((mc) => {
    // Find shortest column
    let minHeight = Infinity;
    let minCol = 0;
    for (let c = 0; c < colCount; c++) {
      if (columnHeights[c] < minHeight) {
        minHeight = columnHeights[c];
        minCol = c;
      }
    }

    const x = minCol * (cardWidth + actualGap);
    const y = columnHeights[minCol];

    // Use Pretext-measured height + gap
    columnHeights[minCol] = y + mc.totalHeight + gap;

    return { measured: mc, x, y, width: cardWidth };
  });
}

export function StreamView({ cards, cardWidth }: StreamViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    setContainerWidth(el.clientWidth);

    return () => observer.disconnect();
  }, []);

  const gap = 10;
  const placed = useMemo(
    () => computeMasonry(cards, cardWidth, containerWidth, gap),
    [cards, cardWidth, containerWidth],
  );

  // Total height of the masonry layout
  const totalHeight = useMemo(() => {
    if (placed.length === 0) return 0;
    return Math.max(...placed.map((p) => p.y + p.measured.totalHeight)) + gap;
  }, [placed]);

  return (
    <div ref={containerRef} className="relative w-full" style={{ minHeight: totalHeight }}>
      {placed.map((p) => (
        <div
          key={p.measured.card.id}
          className="absolute transition-all duration-300 ease-out"
          style={{
            left: p.x,
            top: p.y,
            width: p.width,
          }}
        >
          <FluidCard measured={p.measured} width={p.width} />
        </div>
      ))}
    </div>
  );
}
