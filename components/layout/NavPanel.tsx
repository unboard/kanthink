'use client';

import { useRef, useEffect, type ReactNode } from 'react';
import { useNav } from '@/components/providers/NavProvider';

type PanelWidth = 'sm' | 'md' | 'lg';

const widthClasses: Record<PanelWidth, string> = {
  sm: 'w-[280px]',
  md: 'w-[320px]',
  lg: 'w-[400px]',
};

const widthPixels: Record<PanelWidth, number> = {
  sm: 280,
  md: 320,
  lg: 400,
};

interface NavPanelProps {
  panelKey: 'channels' | 'shrooms' | 'account' | 'settings';
  title: string;
  width?: PanelWidth;
  children: ReactNode;
}

export function NavPanel({ panelKey, title, width = 'sm', children }: NavPanelProps) {
  const { activePanel, closePanel, isMobile } = useNav();
  const panelRef = useRef<HTMLDivElement>(null);
  const isOpen = activePanel === panelKey;

  // Click outside to close (desktop only - mobile uses MobileBottomSheet)
  useEffect(() => {
    if (!isOpen || isMobile) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // Don't close if clicking on the mini nav or inside the panel
      if (
        panelRef.current?.contains(target) ||
        target.closest('[data-mini-nav]')
      ) {
        return;
      }

      closePanel();
    };

    // Delay to avoid closing immediately on click that opened
    const timeout = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timeout);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, isMobile, closePanel]);

  // On mobile, panels are rendered inside MobileNavDrawer
  if (isMobile) {
    return null;
  }

  return (
    <div
      ref={panelRef}
      className={`
        fixed left-14 top-0 h-full z-40
        bg-neutral-50 dark:bg-neutral-900
        border-r border-neutral-200 dark:border-neutral-800
        transition-all duration-200 ease-in-out
        ${widthClasses[width]}
        ${isOpen ? 'translate-x-0 opacity-100' : '-translate-x-full opacity-0 pointer-events-none'}
      `}
    >
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-neutral-200 dark:border-neutral-800">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">
            {title}
          </h2>
          <button
            onClick={closePanel}
            className="p-1.5 rounded-md text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors"
            aria-label="Close panel"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}

// Helper to get panel width for layout margin calculation
export function getPanelWidth(panel: 'channels' | 'shrooms' | 'account' | 'settings' | null): number {
  if (!panel) return 0;

  const widths: Record<string, PanelWidth> = {
    channels: 'sm',
    shrooms: 'md',
    account: 'md',
    settings: 'lg',
  };

  return widthPixels[widths[panel]];
}
