'use client';

import { useEffect, useCallback, type ReactNode } from 'react';

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  width?: 'md' | 'lg' | 'xl';
  floating?: boolean;
  title?: string;
  hideCloseButton?: boolean;
}

// On mobile, drawers are full-width. On larger screens, use max-width
const widthClasses = {
  md: 'w-full sm:max-w-md',
  lg: 'w-full sm:max-w-2xl',
  xl: 'w-full sm:max-w-4xl',
};

export function Drawer({ isOpen, onClose, children, width = 'lg', floating = false, hideCloseButton = false }: DrawerProps) {

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
    }
  }, [isOpen, handleEscape]);

  if (!isOpen) return null;

  return (
    <div className={`fixed inset-0 z-50 flex justify-end ${floating ? 'sm:p-4' : ''}`}>
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        className={`
          relative w-full ${widthClasses[width]} shadow-2xl overflow-y-auto
          animate-in slide-in-from-right duration-200
          ${floating ? 'h-full sm:h-auto sm:max-h-full sm:rounded-2xl' : 'h-full'}
          bg-white dark:bg-neutral-900
        `}
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
