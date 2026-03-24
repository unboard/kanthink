'use client';

import { useEffect, useRef, useState } from 'react';

interface MobileMenuDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
}

/**
 * On mobile (<768px), renders a bottom sheet that slides up ~40% of the screen.
 * On desktop, renders nothing (caller should render the normal dropdown).
 *
 * Usage:
 *   {isMobile ? (
 *     <MobileMenuDrawer isOpen={showMenu} onClose={() => setShowMenu(false)}>
 *       {menuItems}
 *     </MobileMenuDrawer>
 *   ) : (
 *     <div className="dropdown">{menuItems}</div>
 *   )}
 *
 * Or use the hook: const isMobile = useIsMobile();
 */
export function MobileMenuDrawer({ isOpen, onClose, children, title }: MobileMenuDrawerProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsAnimating(true);
      // Prevent body scroll while drawer is open
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    } else {
      document.body.style.overflow = '';
    }
  }, [isOpen]);

  if (!isOpen && !isAnimating) return null;

  return (
    <div
      className="fixed inset-0 z-[100] md:hidden"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/40 transition-opacity duration-200 ${
          isOpen ? 'opacity-100' : 'opacity-0'
        }`}
        onTransitionEnd={() => { if (!isOpen) setIsAnimating(false); }}
      />

      {/* Bottom sheet */}
      <div
        className={`absolute bottom-0 left-0 right-0 bg-white dark:bg-neutral-900 rounded-t-2xl shadow-2xl transition-transform duration-200 ease-out ${
          isOpen ? 'translate-y-0' : 'translate-y-full'
        }`}
        style={{ maxHeight: '50vh' }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-8 h-1 rounded-full bg-neutral-300 dark:bg-neutral-600" />
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
          className="overflow-y-auto overscroll-contain px-2 pb-6"
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
