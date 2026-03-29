'use client';

/**
 * Concept 2: Focus Lens
 *
 * One card takes center stage. Everything else flows around it as continuous
 * text using Pretext's layoutNextLine() with obstacle carving. Click any
 * piece of flowing text to shift focus to that card — the layout reflows
 * instantly because Pretext is pure arithmetic.
 *
 * Pretext APIs used:
 *   - prepareWithSegments() for text preparation
 *   - layoutNextLine() for line-by-line layout with variable-width slots
 *   - walkLineRanges() for headline fitting
 *   - layout() for height measurement
 */

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useStore } from '@/lib/store';
import {
  prepareWithSegments,
  layoutNextLine,
  layout,
  walkLineRanges,
  type PreparedTextWithSegments,
  type LayoutCursor,
} from '@chenglou/pretext';

// ─── Typography ───────────────────────────────────────────────────────────────
const FLOW_FONT = '16px Inter, system-ui, sans-serif';
const FLOW_LINE_HEIGHT = 24;
const FLOW_TITLE_FONT = '600 16px Inter, system-ui, sans-serif';
const MIN_SLOT_WIDTH = 40;

// ─── Types ────────────────────────────────────────────────────────────────────
type Interval = { left: number; right: number };

type FlowCard = {
  id: string;
  title: string;
  body: string;
  channel: string;
  column: string;
  updatedAt: number;
};

type PositionedLine = {
  x: number;
  y: number;
  text: string;
  cardId: string; // which card this line belongs to
};

// ─── Obstacle carving ─────────────────────────────────────────────────────────
function carveSlots(base: Interval, blocked: Interval[]): Interval[] {
  let slots = [base];
  for (const interval of blocked) {
    const next: Interval[] = [];
    for (const slot of slots) {
      if (interval.right <= slot.left || interval.left >= slot.right) {
        next.push(slot);
        continue;
      }
      if (interval.left > slot.left) next.push({ left: slot.left, right: interval.left });
      if (interval.right < slot.right) next.push({ left: interval.right, right: slot.right });
    }
    slots = next;
  }
  return slots.filter(s => s.right - s.left >= MIN_SLOT_WIDTH);
}

function rectIntervalForBand(
  rx: number, ry: number, rw: number, rh: number,
  bandTop: number, bandBottom: number,
  padding: number,
): Interval | null {
  if (bandTop >= ry + rh + padding || bandBottom <= ry - padding) return null;
  return { left: rx - padding, right: rx + rw + padding };
}

// ─── Lay out flowing text around a rectangular obstacle ───────────────────────
function layoutFlowAroundRect(
  sections: { cardId: string; prepared: PreparedTextWithSegments }[],
  regionX: number, regionY: number, regionW: number, regionH: number,
  lineHeight: number,
  obstacleX: number, obstacleY: number, obstacleW: number, obstacleH: number,
  padding: number,
): PositionedLine[] {
  const lines: PositionedLine[] = [];
  let lineTop = regionY;
  let sectionIdx = 0;
  let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 };

  while (lineTop + lineHeight <= regionY + regionH && sectionIdx < sections.length) {
    const section = sections[sectionIdx]!;
    const bandTop = lineTop;
    const bandBottom = lineTop + lineHeight;

    // Check obstacle intersection
    const blocked: Interval[] = [];
    const obstInterval = rectIntervalForBand(
      obstacleX, obstacleY, obstacleW, obstacleH,
      bandTop, bandBottom, padding,
    );
    if (obstInterval) blocked.push(obstInterval);

    const slots = carveSlots({ left: regionX, right: regionX + regionW }, blocked);

    if (slots.length === 0) {
      lineTop += lineHeight;
      continue;
    }

    // Use widest slot for simplicity, but flow on both sides when possible
    const sortedSlots = [...slots].sort((a, b) => a.left - b.left);
    let advancedLine = false;

    for (const slot of sortedSlots) {
      const slotWidth = slot.right - slot.left;
      const line = layoutNextLine(section.prepared, cursor, slotWidth);
      if (line === null) {
        // This section is exhausted — move to next
        sectionIdx++;
        if (sectionIdx < sections.length) {
          cursor = { segmentIndex: 0, graphemeIndex: 0 };
          // Don't advance lineTop — retry this line with next section
        }
        advancedLine = true;
        break;
      }
      lines.push({
        x: Math.round(slot.left),
        y: Math.round(lineTop),
        text: line.text,
        cardId: section.cardId,
      });
      cursor = line.end;
      advancedLine = true;
    }

    if (advancedLine) {
      lineTop += lineHeight;
    }
  }

  return lines;
}

// ─── Component ────────────────────────────────────────────────────────────────
export function FocusLens() {
  const channels = useStore((s) => s.channels);
  const cards = useStore((s) => s.cards);
  const [mounted, setMounted] = useState(false);
  const [focusedCardId, setFocusedCardId] = useState<string | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setMounted(true); }, []);

  // Build card list
  const flowCards = useMemo(() => {
    if (!mounted) return [];
    const result: FlowCard[] = [];
    const activeChannels = Object.values(channels).filter(ch => ch.status !== 'archived');
    for (const channel of activeChannels) {
      for (const column of channel.columns) {
        for (const cardId of column.cardIds) {
          const card = cards[cardId];
          if (!card) continue;
          if (card.snoozedUntil && new Date(card.snoozedUntil) > new Date()) continue;
          result.push({
            id: card.id,
            title: card.title || 'Untitled',
            body: card.summary || card.messages?.[0]?.content || '',
            channel: channel.name,
            column: column.name,
            updatedAt: new Date(card.updatedAt || card.createdAt).getTime(),
          });
        }
      }
    }
    result.sort((a, b) => b.updatedAt - a.updatedAt);
    return result;
  }, [channels, cards, mounted]);

  // Default focus to first card
  useEffect(() => {
    if (flowCards.length > 0 && !focusedCardId) {
      setFocusedCardId(flowCards[0]!.id);
    }
  }, [flowCards, focusedCardId]);

  const focusedCard = flowCards.find(c => c.id === focusedCardId);
  const otherCards = flowCards.filter(c => c.id !== focusedCardId);

  // Render the flowing layout using Pretext — direct DOM writes for performance
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !mounted || !focusedCard || otherCards.length === 0) return;

    const pageW = stage.clientWidth;
    const pageH = stage.clientHeight;
    const padding = 32;

    // ─── Focus card geometry (centered) ────────────────────────────
    const focusW = Math.min(360, pageW * 0.4);
    const focusH = Math.min(280, pageH * 0.4);
    const focusX = Math.round((pageW - focusW) / 2);
    const focusY = Math.round((pageH - focusH) / 2);

    // ─── Prepare text for flowing cards ────────────────────────────
    // Concatenate title + body for each card as a section
    const sections = otherCards.slice(0, 30).map(card => {
      const text = card.body
        ? `${card.title} — ${card.body.slice(0, 200)}`
        : card.title;
      return {
        cardId: card.id,
        prepared: prepareWithSegments(text, FLOW_FONT),
      };
    });

    // ─── Layout text flowing around the focus card ─────────────────
    const lines = layoutFlowAroundRect(
      sections,
      padding, 60, pageW - padding * 2, pageH - 80,
      FLOW_LINE_HEIGHT,
      focusX, focusY, focusW, focusH,
      20, // gap between text and focus card
    );

    // ─── Write to DOM ──────────────────────────────────────────────
    // Clear old lines (keep focus card)
    const existingLines = stage.querySelectorAll('.flow-line');
    existingLines.forEach(el => el.remove());

    for (const line of lines) {
      const el = document.createElement('div');
      el.className = 'flow-line';
      el.textContent = line.text;
      el.dataset.cardId = line.cardId;
      el.style.cssText = `
        position: absolute;
        left: ${line.x}px;
        top: ${line.y}px;
        font: ${FLOW_FONT};
        line-height: ${FLOW_LINE_HEIGHT}px;
        color: rgba(255,255,255,0.3);
        white-space: pre;
        cursor: pointer;
        transition: color 0.15s;
      `;
      el.addEventListener('mouseenter', () => {
        // Highlight all lines from the same card
        stage.querySelectorAll(`.flow-line[data-card-id="${line.cardId}"]`).forEach(sibling => {
          (sibling as HTMLElement).style.color = 'rgba(255,255,255,0.7)';
        });
      });
      el.addEventListener('mouseleave', () => {
        stage.querySelectorAll(`.flow-line[data-card-id="${line.cardId}"]`).forEach(sibling => {
          (sibling as HTMLElement).style.color = 'rgba(255,255,255,0.3)';
        });
      });
      el.addEventListener('click', () => {
        setFocusedCardId(line.cardId);
      });
      stage.appendChild(el);
    }

    return () => {
      stage.querySelectorAll('.flow-line').forEach(el => el.remove());
    };
  }, [mounted, focusedCard, otherCards]);

  // Handle resize
  useEffect(() => {
    const handler = () => {
      // Force re-render by toggling a state
      setFocusedCardId(prev => prev);
    };
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  if (!mounted || !focusedCard) {
    return (
      <div className="flex-1 flex items-center justify-center text-white/20 text-sm"
           style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
        Loading...
      </div>
    );
  }

  const stageW = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const stageH = typeof window !== 'undefined' ? window.innerHeight : 800;
  const focusW = Math.min(360, stageW * 0.4);
  const focusH = Math.min(280, stageH * 0.4);
  const focusX = Math.round((stageW - focusW) / 2);
  const focusY = Math.round((stageH - focusH) / 2);

  return (
    <div
      ref={stageRef}
      className="flex-1 relative overflow-hidden"
      style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
    >
      {/* The focused card — center stage */}
      <div
        style={{
          position: 'absolute',
          left: focusX,
          top: focusY,
          width: focusW,
          height: focusH,
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 16,
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          zIndex: 10,
          transition: 'all 0.3s ease',
        }}
      >
        {/* Channel / column context */}
        <div style={{
          fontSize: 10,
          color: 'rgba(255,255,255,0.2)',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          marginBottom: 8,
        }}>
          {focusedCard.channel} · {focusedCard.column}
        </div>

        {/* Title */}
        <div style={{
          fontSize: 20,
          fontWeight: 600,
          color: 'rgba(255,255,255,0.85)',
          lineHeight: '26px',
          marginBottom: 12,
        }}>
          {focusedCard.title}
        </div>

        {/* Body */}
        {focusedCard.body && (
          <div style={{
            fontSize: 14,
            color: 'rgba(255,255,255,0.4)',
            lineHeight: '21px',
            flex: 1,
            overflow: 'hidden',
          }}>
            {focusedCard.body}
          </div>
        )}

        {/* Hint */}
        <div style={{
          fontSize: 10,
          color: 'rgba(255,255,255,0.12)',
          marginTop: 12,
        }}>
          click surrounding text to shift focus
        </div>
      </div>

      {/* Navigation arrows */}
      <button
        onClick={() => {
          const idx = flowCards.findIndex(c => c.id === focusedCardId);
          const prev = idx > 0 ? flowCards[idx - 1]! : flowCards[flowCards.length - 1]!;
          setFocusedCardId(prev.id);
        }}
        style={{
          position: 'absolute',
          left: 16,
          top: '50%',
          transform: 'translateY(-50%)',
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 8,
          padding: '8px 12px',
          color: 'rgba(255,255,255,0.3)',
          cursor: 'pointer',
          zIndex: 20,
          fontSize: 14,
        }}
      >
        ←
      </button>
      <button
        onClick={() => {
          const idx = flowCards.findIndex(c => c.id === focusedCardId);
          const next = idx < flowCards.length - 1 ? flowCards[idx + 1]! : flowCards[0]!;
          setFocusedCardId(next.id);
        }}
        style={{
          position: 'absolute',
          right: 16,
          top: '50%',
          transform: 'translateY(-50%)',
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 8,
          padding: '8px 12px',
          color: 'rgba(255,255,255,0.3)',
          cursor: 'pointer',
          zIndex: 20,
          fontSize: 14,
        }}
      >
        →
      </button>

      {/* Card counter */}
      <div style={{
        position: 'absolute',
        bottom: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        fontSize: 11,
        color: 'rgba(255,255,255,0.15)',
        zIndex: 20,
      }}>
        {flowCards.findIndex(c => c.id === focusedCardId) + 1} / {flowCards.length}
      </div>
    </div>
  );
}
