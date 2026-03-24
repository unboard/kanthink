'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

interface MobileMenuDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
}

/**
 * On mobile (<768px), renders a bottom sheet that slides up ~40-50% of the screen.
 * On desktop, renders nothing (caller should render the normal dropdown).
 * Supports: tap backdrop to close, drag handle down to dismiss.
 */
export function MobileMenuDrawer({ isOpen, onClose, children, title }: MobileMenuDrawerProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [dragY, setDragY] = useState(0);
  const dragStartY = useRef(0);
  const isDragging = useRef(false);

  useEffect(() => {
    if (isOpen) {
      setIsAnimating(true);
      setDragY(0);
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    } else {
      document.body.style.overflow = '';
    }
  }, [isOpen]);

  // Drag-to-dismiss handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    dragStartY.current = e.touches[0].clientY;
    isDragging.current = true;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current) return;
    const deltaY = e.touches[0].clientY - dragStartY.current;
    // Only allow dragging down (positive delta)
    if (deltaY > 0) {
      setDragY(deltaY);
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;
    // If dragged more than 80px down, dismiss
    if (dragY > 80) {
      onClose();
    }
    setDragY(0);
  }, [dragY, onClose]);

  if (!isOpen && !isAnimating) return null;

  return (
    <div className="fixed inset-0 z-[100] md:hidden">
      {/* Backdrop — tap to close */}
      <div
        className={`absolute inset-0 bg-black/40 transition-opacity duration-200 ${
          isOpen ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onClose}
        onTransitionEnd={() => { if (!isOpen) setIsAnimating(false); }}
      />

      {/* Bottom sheet */}
      <div
        ref={sheetRef}
        className={`absolute bottom-0 left-0 right-0 bg-white dark:bg-neutral-900 rounded-t-2xl shadow-2xl ${
          isDragging.current && dragY > 0 ? '' : 'transition-transform duration-200 ease-out'
        } ${
          isOpen ? 'translate-y-0' : 'translate-y-full'
        }`}
        style={{
          maxHeight: '50vh',
          transform: isOpen && dragY > 0 ? `translateY(${dragY}px)` : undefined,
        }}
      >
        {/* Drag handle — touch to drag down */}
        <div
          className="flex justify-center pt-3 pb-1 cursor-grab"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="w-10 h-1 rounded-full bg-neutral-300 dark:bg-neutral-600" />
        </div>

        {/* Optional title */}
        {title && (
          <div className="px-4 pb-2">
            <h3 className="text-sm font-medium text-neutral-500 dark:text-neutral-400">{title}</h3>
          </div>
        )}

        {/* Scrollable menu content */}
        <div
          ref={contentRef}
          className="overflow-y-auto overscroll-contain px-2 pb-8"
          style={{ maxHeight: title ? 'calc(50vh - 64px)' : 'calc(50vh - 40px)' }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

/** Returns true when viewport is < 768px (md breakpoint) */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return isMobile;
}
