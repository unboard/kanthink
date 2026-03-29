'use client';

/**
 * Kanthink Editorial Engine — powered by @chenglou/pretext
 *
 * This is NOT a normal React component. It follows chenglou's editorial-engine
 * demo pattern: absolutely-positioned line divs, laid out via pure arithmetic
 * using Pretext's layoutNextLine() with cursor handoff between columns.
 *
 * Text flows around draggable orbs in real time at 60fps.
 * Multi-column layout with seamless cursor handoff.
 * Cards become sections in a continuous editorial flow.
 */

import { useEffect, useRef, useMemo, useState } from 'react';
import { useStore } from '@/lib/store';
import {
  prepareWithSegments,
  layoutNextLine,
  layoutWithLines,
  walkLineRanges,
  type PreparedTextWithSegments,
  type LayoutCursor,
} from '@chenglou/pretext';

// ─── Typography ───────────────────────────────────────────────────────────────
const BODY_FONT = '17px "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif';
const BODY_LINE_HEIGHT = 28;
const HEADING_FONT_FAMILY = '"Iowan Old Style", "Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif';
const HEADING_FONT = `700 22px ${HEADING_FONT_FAMILY}`;
const HEADING_LINE_HEIGHT = 30;
const META_FONT = '500 11px Inter, system-ui, sans-serif';
const META_LINE_HEIGHT = 16;
const HEADLINE_FONT_FAMILY = '"Iowan Old Style", "Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif';

// ─── Layout constants ─────────────────────────────────────────────────────────
const GUTTER = 48;
const COL_GAP = 40;
const BOTTOM_GAP = 20;
const DROP_CAP_LINES = 3;
const MIN_SLOT_WIDTH = 50;
const NARROW_BREAKPOINT = 760;
const NARROW_GUTTER = 20;
const NARROW_COL_GAP = 20;
const SECTION_GAP = 18; // extra vertical gap between card sections
const HEADING_GAP = 6;  // gap after heading before body

// ─── Types ────────────────────────────────────────────────────────────────────
type Interval = { left: number; right: number };
type PositionedLine = { x: number; y: number; width: number; text: string; className: string };

type CircleObstacle = {
  cx: number; cy: number; r: number;
  hPad: number; vPad: number;
};

type OrbColor = [number, number, number];

type Orb = {
  x: number; y: number; r: number;
  vx: number; vy: number;
  paused: boolean;
  color: OrbColor;
};

type DragState = {
  orbIndex: number;
  startPointerX: number; startPointerY: number;
  startOrbX: number; startOrbY: number;
};

// Prepared text section from a card
type PreparedSection = {
  cardId: string;
  heading: PreparedTextWithSegments;
  body: PreparedTextWithSegments | null;
  meta: string; // "channel · column"
  metaPrepared: PreparedTextWithSegments;
};

// ─── Obstacle carving (from chenglou's editorial-engine) ─────────────────────
function carveTextLineSlots(base: Interval, blocked: Interval[]): Interval[] {
  let slots = [base];
  for (let i = 0; i < blocked.length; i++) {
    const interval = blocked[i]!;
    const next: Interval[] = [];
    for (let j = 0; j < slots.length; j++) {
      const slot = slots[j]!;
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

function circleIntervalForBand(
  cx: number, cy: number, r: number,
  bandTop: number, bandBottom: number,
  hPad: number, vPad: number,
): Interval | null {
  const top = bandTop - vPad;
  const bottom = bandBottom + vPad;
  if (top >= cy + r || bottom <= cy - r) return null;
  const minDy = cy >= top && cy <= bottom ? 0 : cy < top ? top - cy : cy - bottom;
  if (minDy >= r) return null;
  const maxDx = Math.sqrt(r * r - minDy * minDy);
  return { left: cx - maxDx - hPad, right: cx + maxDx + hPad };
}

// ─── Column layout with obstacle avoidance ────────────────────────────────────
// Lays out text line-by-line, carving around circle obstacles each line.
// Returns positioned lines and the cursor where text stopped.
function layoutColumnLines(
  prepared: PreparedTextWithSegments,
  startCursor: LayoutCursor,
  regionX: number, regionY: number, regionW: number, regionH: number,
  lineHeight: number,
  obstacles: CircleObstacle[],
  className: string,
  singleSlotOnly: boolean = false,
): { lines: PositionedLine[]; cursor: LayoutCursor; y: number } {
  let cursor = startCursor;
  let lineTop = regionY;
  const lines: PositionedLine[] = [];
  let textExhausted = false;

  while (lineTop + lineHeight <= regionY + regionH && !textExhausted) {
    const bandTop = lineTop;
    const bandBottom = lineTop + lineHeight;
    const blocked: Interval[] = [];

    for (let i = 0; i < obstacles.length; i++) {
      const o = obstacles[i]!;
      const interval = circleIntervalForBand(o.cx, o.cy, o.r, bandTop, bandBottom, o.hPad, o.vPad);
      if (interval !== null) blocked.push(interval);
    }

    const slots = carveTextLineSlots({ left: regionX, right: regionX + regionW }, blocked);
    if (slots.length === 0) {
      lineTop += lineHeight;
      continue;
    }

    const orderedSlots = singleSlotOnly
      ? [slots.reduce((best, slot) =>
          (slot.right - slot.left > best.right - best.left) ? slot : best
        )]
      : [...slots].sort((a, b) => a.left - b.left);

    for (let i = 0; i < orderedSlots.length; i++) {
      const slot = orderedSlots[i]!;
      const slotWidth = slot.right - slot.left;
      const line = layoutNextLine(prepared, cursor, slotWidth);
      if (line === null) { textExhausted = true; break; }
      lines.push({
        x: Math.round(slot.left),
        y: Math.round(lineTop),
        text: line.text,
        width: line.width,
        className,
      });
      cursor = line.end;
    }

    lineTop += lineHeight;
  }

  return { lines, cursor, y: lineTop };
}

// ─── Build content from store data ────────────────────────────────────────────
function buildSections(
  channels: ReturnType<typeof useStore.getState>['channels'],
  cards: ReturnType<typeof useStore.getState>['cards'],
): PreparedSection[] {
  const sections: PreparedSection[] = [];
  const allChannels = Object.values(channels).filter(ch => ch.status !== 'archived');

  for (const channel of allChannels) {
    for (const column of channel.columns) {
      for (const cardId of column.cardIds) {
        const card = cards[cardId];
        if (!card) continue;
        if (card.snoozedUntil && new Date(card.snoozedUntil) > new Date()) continue;

        const bodyText = card.summary || card.messages?.[0]?.content || '';
        const meta = `${channel.name} · ${column.name}`;

        sections.push({
          cardId: card.id,
          heading: prepareWithSegments(card.title || 'Untitled', HEADING_FONT),
          body: bodyText ? prepareWithSegments(bodyText, BODY_FONT) : null,
          meta,
          metaPrepared: prepareWithSegments(meta, META_FONT),
        });
      }
    }
  }

  // Sort by most recently updated
  const cardMap = cards;
  sections.sort((a, b) => {
    const ca = cardMap[a.cardId];
    const cb = cardMap[b.cardId];
    if (!ca || !cb) return 0;
    return new Date(cb.updatedAt || cb.createdAt).getTime() - new Date(ca.updatedAt || ca.createdAt).getTime();
  });

  return sections;
}

// ─── Headline fitting (binary search for largest size) ────────────────────────
function fitHeadline(
  text: string, maxWidth: number, maxHeight: number, maxSize: number,
): { fontSize: number; lines: PositionedLine[] } {
  let lo = 20, hi = maxSize, best = lo;
  let bestLines: PositionedLine[] = [];

  while (lo <= hi) {
    const size = Math.floor((lo + hi) / 2);
    const font = `700 ${size}px ${HEADLINE_FONT_FAMILY}`;
    const lineHeight = Math.round(size * 0.93);
    const prepared = prepareWithSegments(text, font);
    let breaksWord = false;
    let lineCount = 0;

    walkLineRanges(prepared, maxWidth, (line) => {
      lineCount++;
      if (line.end.graphemeIndex !== 0) breaksWord = true;
    });

    const totalHeight = lineCount * lineHeight;
    if (!breaksWord && totalHeight <= maxHeight) {
      best = size;
      const result = layoutWithLines(prepared, maxWidth, lineHeight);
      bestLines = result.lines.map((line, index) => ({
        x: 0, y: index * lineHeight,
        text: line.text, width: line.width,
        className: 'headline-line',
      }));
      lo = size + 1;
    } else {
      hi = size - 1;
    }
  }

  return { fontSize: best, lines: bestLines };
}

// ─── Orb definitions ──────────────────────────────────────────────────────────
const ORB_DEFS: { fx: number; fy: number; r: number; vx: number; vy: number; color: OrbColor }[] = [
  { fx: 0.55, fy: 0.25, r: 100, vx: 18, vy: 12, color: [196, 163, 90] },
  { fx: 0.20, fy: 0.55, r: 80, vx: -14, vy: 20, color: [100, 140, 255] },
  { fx: 0.78, fy: 0.65, r: 90, vx: 12, vy: -16, color: [232, 100, 130] },
];

// ─── Component ────────────────────────────────────────────────────────────────
export function EditorialEngine() {
  const channels = useStore((s) => s.channels);
  const cards = useStore((s) => s.cards);
  const stageRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  // Mutable state for animation (not React state — we write directly to DOM)
  const stateRef = useRef<{
    orbs: Orb[];
    drag: DragState | null;
    pointer: { x: number; y: number };
    lastFrameTime: number | null;
    sections: PreparedSection[];
    animating: boolean;
    rafId: number | null;
    linePool: HTMLDivElement[];
    headlinePool: HTMLDivElement[];
    orbEls: HTMLDivElement[];
  } | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Build sections when data changes (after mount so canvas is available)
  const sections = useMemo(() => {
    if (!mounted) return [];
    return buildSections(channels, cards);
  }, [channels, cards, mounted]);

  // The headline text
  const headlineText = useMemo(() => {
    if (sections.length === 0) return 'YOUR WORK, REIMAGINED';
    const channelCount = new Set(
      Object.values(channels).filter(c => c.status !== 'archived').map(c => c.id)
    ).size;
    return `${sections.length} CARDS ACROSS ${channelCount} CHANNELS`;
  }, [sections, channels]);

  // Main render loop — runs outside React, writes directly to DOM
  useEffect(() => {
    const stageEl = stageRef.current;
    if (!stageEl || !mounted || sections.length === 0) return;
    const stage: HTMLDivElement = stageEl;

    const W = window.innerWidth;
    const H = window.innerHeight;

    // Initialize orbs
    const orbs: Orb[] = ORB_DEFS.map(d => ({
      x: d.fx * W, y: d.fy * H,
      r: d.r, vx: d.vx, vy: d.vy,
      paused: false, color: d.color,
    }));

    // Create orb DOM elements
    const orbEls = orbs.map(orb => {
      const el = document.createElement('div');
      el.style.cssText = `
        position: absolute; border-radius: 50%; pointer-events: none; will-change: transform;
        background: radial-gradient(circle at 35% 35%,
          rgba(${orb.color[0]},${orb.color[1]},${orb.color[2]},0.3),
          rgba(${orb.color[0]},${orb.color[1]},${orb.color[2]},0.1) 55%, transparent 72%);
        box-shadow:
          0 0 60px 15px rgba(${orb.color[0]},${orb.color[1]},${orb.color[2]},0.15),
          0 0 120px 40px rgba(${orb.color[0]},${orb.color[1]},${orb.color[2]},0.06);
      `;
      stage.appendChild(el);
      return el;
    });

    const linePool: HTMLDivElement[] = [];
    const headlinePool: HTMLDivElement[] = [];

    const st = {
      orbs, drag: null as DragState | null,
      pointer: { x: -9999, y: -9999 },
      lastFrameTime: null as number | null,
      sections, animating: true, rafId: null as number | null,
      linePool, headlinePool, orbEls,
    };
    stateRef.current = st;

    // ─── DOM pool management ────────────────────────────────────────
    function syncPool(pool: HTMLDivElement[], count: number, className: string) {
      while (pool.length < count) {
        const el = document.createElement('div');
        el.className = className;
        stage.appendChild(el);
        pool.push(el);
      }
      for (let i = 0; i < pool.length; i++) {
        pool[i]!.style.display = i < count ? '' : 'none';
      }
    }

    // ─── Render frame ───────────────────────────────────────────────
    function render(now: number): boolean {
      const pageWidth = document.documentElement.clientWidth;
      const pageHeight = document.documentElement.clientHeight;
      const isNarrow = pageWidth < NARROW_BREAKPOINT;
      const gutter = isNarrow ? NARROW_GUTTER : GUTTER;
      const colGap = isNarrow ? NARROW_COL_GAP : COL_GAP;
      const bottomGap = BOTTOM_GAP;
      const orbScale = isNarrow ? 0.6 : 1;

      // ─── Physics step ─────────────────────────────────────────────
      const lastFrame = st.lastFrameTime ?? now;
      const dt = Math.min((now - lastFrame) / 1000, 0.05);
      let stillAnimating = false;

      for (let i = 0; i < orbs.length; i++) {
        const orb = orbs[i]!;
        const radius = orb.r * orbScale;
        if (orb.paused || (st.drag && st.drag.orbIndex === i)) continue;
        stillAnimating = true;
        orb.x += orb.vx * dt;
        orb.y += orb.vy * dt;

        if (orb.x - radius < 0) { orb.x = radius; orb.vx = Math.abs(orb.vx); }
        if (orb.x + radius > pageWidth) { orb.x = pageWidth - radius; orb.vx = -Math.abs(orb.vx); }
        if (orb.y - radius < gutter * 0.5) { orb.y = radius + gutter * 0.5; orb.vy = Math.abs(orb.vy); }
        if (orb.y + radius > pageHeight - bottomGap) { orb.y = pageHeight - bottomGap - radius; orb.vy = -Math.abs(orb.vy); }
      }

      // Orb–orb repulsion
      for (let i = 0; i < orbs.length; i++) {
        const a = orbs[i]!;
        for (let j = i + 1; j < orbs.length; j++) {
          const b = orbs[j]!;
          const dx = b.x - a.x, dy = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const minDist = (a.r + b.r) * orbScale + 20;
          if (dist >= minDist || dist <= 0.1) continue;
          const force = (minDist - dist) * 0.8;
          const nx = dx / dist, ny = dy / dist;
          if (!a.paused) { a.vx -= nx * force * dt; a.vy -= ny * force * dt; }
          if (!b.paused) { b.vx += nx * force * dt; b.vy += ny * force * dt; }
        }
      }

      // ─── Build obstacles ──────────────────────────────────────────
      const obstacles: CircleObstacle[] = orbs.map(o => ({
        cx: o.x, cy: o.y, r: o.r * orbScale,
        hPad: isNarrow ? 10 : 14, vPad: isNarrow ? 2 : 4,
      }));

      // ─── Headline ─────────────────────────────────────────────────
      const headlineWidth = Math.min(pageWidth - gutter * 2, 1000);
      const maxHeadlineH = Math.floor(pageHeight * (isNarrow ? 0.15 : 0.18));
      const headline = fitHeadline(headlineText, headlineWidth, maxHeadlineH, isNarrow ? 36 : 72);
      const headlineLineH = Math.round(headline.fontSize * 0.93);
      const headlineFont = `700 ${headline.fontSize}px ${HEADLINE_FONT_FAMILY}`;
      const headlineHeight = headline.lines.length * headlineLineH;

      // ─── Column geometry ──────────────────────────────────────────
      const bodyTop = gutter + headlineHeight + (isNarrow ? 12 : 20);
      const bodyHeight = pageHeight - bodyTop - bottomGap;
      const columnCount = pageWidth > 1000 ? 3 : pageWidth > 640 ? 2 : 1;
      const totalGutter = gutter * 2 + colGap * (columnCount - 1);
      const maxContentW = Math.min(pageWidth, 1500);
      const colW = Math.floor((maxContentW - totalGutter) / columnCount);
      const contentLeft = Math.round((pageWidth - (columnCount * colW + (columnCount - 1) * colGap)) / 2);

      // ─── Lay out all sections as continuous editorial flow ────────
      const allLines: PositionedLine[] = [];
      let colIdx = 0;
      let colY = bodyTop;

      for (let si = 0; si < st.sections.length; si++) {
        const section = st.sections[si]!;
        const colX = contentLeft + colIdx * (colW + colGap);

        // Check if we have room for at least the heading
        if (colY + HEADING_LINE_HEIGHT > bodyTop + bodyHeight) {
          colIdx++;
          if (colIdx >= columnCount) break; // all columns full
          colY = bodyTop;
        }

        const currentColX = contentLeft + colIdx * (colW + colGap);

        // Meta line (channel · column)
        const metaResult = layoutColumnLines(
          section.metaPrepared,
          { segmentIndex: 0, graphemeIndex: 0 },
          currentColX, colY, colW, bodyTop + bodyHeight - colY,
          META_LINE_HEIGHT, obstacles, 'meta-line', isNarrow,
        );
        allLines.push(...metaResult.lines);
        colY = metaResult.y;

        // Heading
        const headingResult = layoutColumnLines(
          section.heading,
          { segmentIndex: 0, graphemeIndex: 0 },
          currentColX, colY, colW, bodyTop + bodyHeight - colY,
          HEADING_LINE_HEIGHT, obstacles, 'heading-line', isNarrow,
        );
        allLines.push(...headingResult.lines);
        colY = headingResult.y + HEADING_GAP;

        // Body text
        if (section.body) {
          const bodyResult = layoutColumnLines(
            section.body,
            { segmentIndex: 0, graphemeIndex: 0 },
            currentColX, colY, colW, bodyTop + bodyHeight - colY,
            BODY_LINE_HEIGHT, obstacles, 'body-line', isNarrow,
          );
          allLines.push(...bodyResult.lines);
          colY = bodyResult.y;
        }

        colY += SECTION_GAP;

        // If this column is getting full, advance to next
        if (colY > bodyTop + bodyHeight - BODY_LINE_HEIGHT * 2) {
          colIdx++;
          if (colIdx >= columnCount) break;
          colY = bodyTop;
        }
      }

      // ─── Write to DOM ─────────────────────────────────────────────
      // Headline
      syncPool(st.headlinePool, headline.lines.length, 'headline-line');
      for (let i = 0; i < headline.lines.length; i++) {
        const el = st.headlinePool[i]!;
        const line = headline.lines[i]!;
        el.textContent = line.text;
        el.style.left = `${gutter}px`;
        el.style.top = `${gutter + line.y}px`;
        el.style.font = headlineFont;
        el.style.lineHeight = `${headlineLineH}px`;
      }

      // Body/heading lines
      syncPool(st.linePool, allLines.length, '');
      for (let i = 0; i < allLines.length; i++) {
        const el = st.linePool[i]!;
        const line = allLines[i]!;
        el.textContent = line.text;
        el.className = line.className;
        el.style.left = `${line.x}px`;
        el.style.top = `${line.y}px`;
      }

      // Orbs
      for (let i = 0; i < orbs.length; i++) {
        const orb = orbs[i]!;
        const el = st.orbEls[i]!;
        const radius = orb.r * orbScale;
        el.style.left = `${orb.x - radius}px`;
        el.style.top = `${orb.y - radius}px`;
        el.style.width = `${radius * 2}px`;
        el.style.height = `${radius * 2}px`;
        el.style.opacity = orb.paused ? '0.4' : '1';
      }

      st.lastFrameTime = stillAnimating ? now : null;
      return stillAnimating;
    }

    // ─── Animation loop ───────────────────────────────────────────────
    function tick(now: number) {
      const shouldContinue = render(now);
      if (shouldContinue) {
        st.rafId = requestAnimationFrame(tick);
      } else {
        st.rafId = null;
      }
    }

    function scheduleRender() {
      if (st.rafId !== null) return;
      st.rafId = requestAnimationFrame(tick);
    }

    // ─── Input handlers ───────────────────────────────────────────────
    function hitTestOrbs(px: number, py: number): number {
      const scale = window.innerWidth < NARROW_BREAKPOINT ? 0.6 : 1;
      for (let i = orbs.length - 1; i >= 0; i--) {
        const orb = orbs[i]!;
        const r = orb.r * scale;
        const dx = px - orb.x, dy = py - orb.y;
        if (dx * dx + dy * dy <= r * r) return i;
      }
      return -1;
    }

    function onPointerDown(e: PointerEvent) {
      const hit = hitTestOrbs(e.clientX, e.clientY);
      if (hit !== -1) {
        e.preventDefault();
        const orb = orbs[hit]!;
        st.drag = {
          orbIndex: hit,
          startPointerX: e.clientX, startPointerY: e.clientY,
          startOrbX: orb.x, startOrbY: orb.y,
        };
        stage.style.cursor = 'grabbing';
      }
      scheduleRender();
    }

    function onPointerMove(e: PointerEvent) {
      st.pointer = { x: e.clientX, y: e.clientY };
      if (st.drag) {
        const orb = orbs[st.drag.orbIndex]!;
        orb.x = st.drag.startOrbX + (e.clientX - st.drag.startPointerX);
        orb.y = st.drag.startOrbY + (e.clientY - st.drag.startPointerY);
      }
      // Hover cursor
      const hit = hitTestOrbs(e.clientX, e.clientY);
      if (!st.drag) {
        stage.style.cursor = hit !== -1 ? 'grab' : '';
      }
      scheduleRender();
    }

    function onPointerUp(e: PointerEvent) {
      if (st.drag) {
        const dx = e.clientX - st.drag.startPointerX;
        const dy = e.clientY - st.drag.startPointerY;
        if (dx * dx + dy * dy < 16) {
          orbs[st.drag.orbIndex]!.paused = !orbs[st.drag.orbIndex]!.paused;
        }
        st.drag = null;
        stage.style.cursor = '';
      }
      scheduleRender();
    }

    function onResize() { scheduleRender(); }

    stage.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('resize', onResize);

    // Initial render
    scheduleRender();

    return () => {
      if (st.rafId !== null) cancelAnimationFrame(st.rafId);
      stage.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('resize', onResize);
      // Clean up DOM elements
      st.linePool.forEach(el => el.remove());
      st.headlinePool.forEach(el => el.remove());
      st.orbEls.forEach(el => el.remove());
    };
  }, [mounted, sections, headlineText]);

  return (
    <>
      <style>{`
        .editorial-stage {
          position: fixed;
          inset: 0;
          background: #0a0a0a;
          overflow: hidden;
          font-family: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif;
          -webkit-font-smoothing: antialiased;
        }
        .headline-line {
          position: absolute;
          white-space: pre;
          color: rgba(255,255,255,0.85);
          letter-spacing: -0.02em;
        }
        .meta-line {
          position: absolute;
          white-space: pre;
          font: 500 11px Inter, system-ui, sans-serif;
          line-height: 16px;
          color: rgba(255,255,255,0.2);
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }
        .heading-line {
          position: absolute;
          white-space: pre;
          font: 700 22px "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif;
          line-height: 30px;
          color: rgba(255,255,255,0.75);
        }
        .body-line {
          position: absolute;
          white-space: pre;
          font: 17px "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif;
          line-height: 28px;
          color: rgba(255,255,255,0.45);
        }
        .body-line::selection,
        .heading-line::selection,
        .headline-line::selection,
        .meta-line::selection {
          background: rgba(196,163,90,0.3);
        }
      `}</style>
      <div ref={stageRef} className="editorial-stage">
        {!mounted && (
          <div style={{ color: 'rgba(255,255,255,0.2)', padding: 48, fontFamily: 'system-ui' }}>
            Loading...
          </div>
        )}
      </div>
    </>
  );
}
