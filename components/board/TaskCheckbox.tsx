'use client';

import { useRef } from 'react';
import type { TaskStatus } from '@/lib/types';
import { celebrateTaskComplete } from '@/lib/celebrations';

interface TaskCheckboxProps {
  status: TaskStatus;
  onToggle: () => void;
  size?: 'sm' | 'md';
}

export function TaskCheckbox({ status, onToggle, size = 'md' }: TaskCheckboxProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const sizeClasses = size === 'sm' ? 'w-4 h-4' : 'w-5 h-5';
  const iconSize = size === 'sm' ? 'w-2.5 h-2.5' : 'w-3 h-3';

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();

    // Celebrate when transitioning to done (from in_progress)
    if (status === 'in_progress') {
      celebrateTaskComplete(buttonRef.current);
    }

    onToggle();
  };

  // Not started: empty circle
  if (status === 'not_started') {
    return (
      <button
        ref={buttonRef}
        onClick={handleClick}
        className={`${sizeClasses} rounded-full border-2 border-neutral-300 hover:border-neutral-400 dark:border-neutral-600 dark:hover:border-neutral-500 transition-colors flex-shrink-0`}
        title="Mark in progress"
      />
    );
  }

  // In progress: circle with dot
  if (status === 'in_progress') {
    return (
      <button
        ref={buttonRef}
        onClick={handleClick}
        className={`${sizeClasses} rounded-full border-2 border-blue-500 bg-blue-50 hover:bg-blue-100 dark:border-blue-400 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 transition-colors flex items-center justify-center flex-shrink-0`}
        title="Mark complete"
      >
        <div className={`${size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2'} rounded-full bg-blue-500 dark:bg-blue-400`} />
      </button>
    );
  }

  // Done: checked circle
  return (
    <button
      ref={buttonRef}
      onClick={handleClick}
      className={`${sizeClasses} rounded-full bg-green-500 hover:bg-green-600 dark:bg-green-600 dark:hover:bg-green-700 transition-colors flex items-center justify-center flex-shrink-0`}
      title="Mark not started"
    >
      <svg className={`${iconSize} text-white`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
      </svg>
    </button>
  );
}
