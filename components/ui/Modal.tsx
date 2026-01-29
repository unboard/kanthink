'use client';

import { useEffect, useCallback, useRef, type ReactNode } from 'react';
import { useSettingsStore } from '@/lib/settingsStore';

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
  const theme = useSettingsStore((s) => s.theme);
  const isTerminal = theme === 'terminal';
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

  const handleBackdropClick = (e: React.MouseEvent) => {
    // Only close if both mousedown and click happened on the backdrop itself
    // This prevents closing when keyboard appears and causes layout shifts
    if (mouseDownTargetRef.current === e.target && e.target === e.currentTarget) {
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
        onClick={handleBackdropClick}
        aria-hidden="true"
      />
      <div
        className={`
          relative z-10 w-full ${sizeClasses[size]} rounded-lg shadow-xl overflow-hidden my-auto
          ${isTerminal
            ? 'bg-neutral-950 border border-neutral-800'
            : 'bg-white dark:bg-neutral-900'
          }
        `}
      >
        {/* Terminal header with traffic lights */}
        {isTerminal && (
          <div className="flex items-center gap-2 px-4 py-3 border-b border-neutral-800">
            <div className="flex gap-1.5">
              <button
                onClick={onClose}
                className="w-3 h-3 rounded-full bg-red-500/80 hover:bg-red-500 transition-colors"
                aria-label="Close"
              />
              <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
              <div className="w-3 h-3 rounded-full bg-green-500/80" />
            </div>
            {title && (
              <span className="ml-2 text-xs text-neutral-500 font-mono">{title}</span>
            )}
          </div>
        )}

        <div className={title && !isTerminal ? 'p-6' : isTerminal ? 'p-6' : ''}>
          {title && !isTerminal && (
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
