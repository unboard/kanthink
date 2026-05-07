'use client';

import { useEffect, useCallback, useRef, useState, type ReactNode } from 'react';

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  width?: 'md' | 'lg' | 'xl' | 'full';
  floating?: boolean;
  title?: string;
  hideCloseButton?: boolean;
}

// On mobile, drawers are full-width. On larger screens, use max-width.
// 'full' uses the whole viewport — used by features that need the canvas, like Playground mode.
const widthClasses = {
  md: 'w-full sm:max-w-md',
  lg: 'w-full sm:max-w-2xl',
  xl: 'w-full sm:max-w-4xl',
  full: 'w-screen max-w-none',
};

export function Drawer({ isOpen, onClose, children, width = 'lg', floating = false, hideCloseButton = false }: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const isSwipingRef = useRef(false);

  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
      return () => {
        document.removeEventListener('keydown', handleEscape);
        document.body.style.overflow = '';
      };
    } else {
      setSwipeOffset(0);
    }
  }, [isOpen, handleEscape]);

  // Swipe-to-close: detect right swipe on the drawer panel to close it
  // This prevents the browser's back navigation gesture from firing
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
    isSwipingRef.current = false;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const touch = e.touches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;

    // Only start tracking horizontal swipe if dx > dy and moving right
    if (!isSwipingRef.current) {
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.5 && dx > 0) {
        isSwipingRef.current = true;
      } else if (Math.abs(dy) > 10) {
        // Vertical scroll — don't intercept
        touchStartRef.current = null;
        return;
      }
    }

    if (isSwipingRef.current && dx > 0) {
      // Prevent browser back gesture
      e.preventDefault();
      setSwipeOffset(dx);
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (isSwipingRef.current && swipeOffset > 80) {
      // Swipe threshold met — close the drawer
      onClose();
    }
    setSwipeOffset(0);
    touchStartRef.current = null;
    isSwipingRef.current = false;
  }, [swipeOffset, onClose]);

  if (!isOpen) return null;

  return (
    <div className={`fixed inset-0 z-50 flex justify-end ${floating ? 'sm:p-4' : ''}`}>
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/40 transition-opacity`}
        style={swipeOffset > 0 ? { opacity: Math.max(0, 1 - swipeOffset / 300) } : undefined}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        ref={panelRef}
        className={`
          relative w-full ${widthClasses[width]} shadow-2xl overflow-y-auto
          ${swipeOffset > 0 ? '' : 'animate-in slide-in-from-right duration-200'}
          ${floating ? 'h-full sm:h-auto sm:max-h-full sm:rounded-2xl' : 'h-full'}
          bg-white dark:bg-neutral-900
        `}
        style={swipeOffset > 0 ? { transform: `translateX(${swipeOffset}px)`, transition: 'none' } : undefined}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Close button */}
        {!hideCloseButton && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-md text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 dark:hover:text-neutral-300 dark:hover:bg-neutral-800 z-10"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}

        {children}
      </div>
    </div>
  );
}
