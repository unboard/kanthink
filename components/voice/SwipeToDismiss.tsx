'use client';

import { useRef, useState, type ReactNode } from 'react';

interface SwipeToDismissProps {
  onDismiss: () => void;
  children: ReactNode;
  /** Distance the user must swipe before release commits a dismiss. */
  thresholdPx?: number;
}

/**
 * Wraps an item with horizontal swipe-to-dismiss. Vertical motion passes through
 * to the parent scroller — we only claim the touch once the user moves
 * horizontally more than vertically. That keeps the voice/text action feed
 * scrollable while still letting users flick a preview card off-screen.
 */
export function SwipeToDismiss({ onDismiss, children, thresholdPx = 100 }: SwipeToDismissProps) {
  const startX = useRef(0);
  const startY = useRef(0);
  const horizontal = useRef<boolean | null>(null);
  const [dx, setDx] = useState(0);
  const [committing, setCommitting] = useState(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    horizontal.current = null;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (committing) return;
    const t = e.touches[0];
    const moveX = t.clientX - startX.current;
    const moveY = t.clientY - startY.current;

    if (horizontal.current === null) {
      // Wait for ~6px of motion before deciding which axis owns the gesture.
      if (Math.abs(moveX) < 6 && Math.abs(moveY) < 6) return;
      horizontal.current = Math.abs(moveX) > Math.abs(moveY);
    }
    if (!horizontal.current) return;
    setDx(moveX);
  };

  const handleTouchEnd = () => {
    if (committing) return;
    if (horizontal.current && Math.abs(dx) > thresholdPx) {
      // Animate the rest of the way off-screen, then call onDismiss.
      const direction = dx > 0 ? 1 : -1;
      setCommitting(true);
      setDx(direction * window.innerWidth);
      window.setTimeout(() => onDismiss(), 180);
      return;
    }
    setDx(0);
  };

  const transitioning = committing || dx === 0;
  const transform = dx === 0 ? undefined : `translateX(${dx}px)`;
  // dx is only ever non-zero when the gesture has been claimed as horizontal,
  // so we can fade based on dx alone without inspecting the ref during render.
  const opacity = dx === 0 ? 1 : Math.max(0, 1 - Math.min(Math.abs(dx) / (thresholdPx * 1.6), 1));

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={() => { setDx(0); horizontal.current = null; }}
      style={{
        transform,
        opacity,
        transition: transitioning ? 'transform 180ms ease-out, opacity 180ms ease-out' : undefined,
        touchAction: 'pan-y',
      }}
    >
      {children}
    </div>
  );
}
