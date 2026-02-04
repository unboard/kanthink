'use client';

import { useEffect, useCallback, useRef, type ReactNode } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const sizeClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
};

export function Modal({ isOpen, onClose, title, children, size = 'md' }: ModalProps) {
  const mouseDownTargetRef = useRef<EventTarget | null>(null);

  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      // Don't close on Escape if an input/textarea is focused
      const active = document.activeElement;
      if (active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA') {
        return;
      }
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, handleEscape]);

  // Track where the mouse/touch started to prevent accidental closes
  const handleBackdropMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    mouseDownTargetRef.current = e.target;
  };

  const shouldPreventClose = () => {
    // Don't close if an input/textarea is focused (keyboard is open on mobile)
    const active = document.activeElement;
    return active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA';
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    // Only close if both mousedown and click happened on the backdrop itself
    // This prevents closing when keyboard appears and causes layout shifts
    if (mouseDownTargetRef.current === e.target && e.target === e.currentTarget) {
      if (shouldPreventClose()) {
        mouseDownTargetRef.current = null;
        return;
      }
      onClose();
    }
    mouseDownTargetRef.current = null;
  };

  // Handle touch end for mobile - some browsers don't fire click after touch
  const handleBackdropTouchEnd = (e: React.TouchEvent) => {
    if (mouseDownTargetRef.current === e.target && e.target === e.currentTarget) {
      if (shouldPreventClose()) {
        mouseDownTargetRef.current = null;
        return;
      }
      // Prevent the subsequent click event from also firing
      e.preventDefault();
      onClose();
    }
    mouseDownTargetRef.current = null;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 pt-[10vh] sm:pt-4 overflow-y-auto">
      <div
        className="fixed inset-0 bg-black/50"
        onMouseDown={handleBackdropMouseDown}
        onTouchStart={handleBackdropMouseDown}
        onTouchEnd={handleBackdropTouchEnd}
        onClick={handleBackdropClick}
        aria-hidden="true"
      />
      <div
        className={`
          relative z-10 w-full ${sizeClasses[size]} rounded-lg shadow-xl overflow-hidden my-auto
          bg-white dark:bg-neutral-900
        `}
      >
        <div className={title ? 'p-6' : ''}>
          {title && (
            <h2 className="mb-4 text-lg font-semibold text-neutral-900 dark:text-white">
              {title}
            </h2>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}
