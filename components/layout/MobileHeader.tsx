'use client';

import { useSidebar } from '@/components/providers/SidebarProvider';

export function MobileHeader() {
  const { isMobile, open } = useSidebar();

  if (!isMobile) {
    return null;
  }

  return (
    <header className="sticky top-0 z-30 flex items-center px-4 py-3 bg-neutral-50/95 dark:bg-neutral-900/95 backdrop-blur-sm border-b border-neutral-200 dark:border-neutral-800 md:hidden">
      <div className="flex items-center gap-3">
        <button
          onClick={open}
          className="p-2 -ml-2 rounded-md text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors"
          aria-label="Open menu"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <img
          src="https://res.cloudinary.com/dcht3dytz/image/upload/v1769532115/kanthink-full-v1_lc5ai6.svg"
          alt="Kanthink"
          className="h-5"
        />
      </div>
    </header>
  );
}
