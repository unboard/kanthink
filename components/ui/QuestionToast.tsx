'use client';

import { useState, useEffect } from 'react';
import type { QueuedQuestion } from '@/lib/questionStore';

interface QuestionToastProps {
  question: QueuedQuestion;
  onUseful: () => void;
  onSnooze: () => void;
  onDismiss: () => void;
}

export function QuestionToast({ question, onUseful, onSnooze, onDismiss }: QuestionToastProps) {
  const [showContext, setShowContext] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  // Entrance animation
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 10);
    return () => clearTimeout(timer);
  }, []);

  const handleUseful = () => {
    setIsVisible(false);
    setTimeout(onUseful, 200);
  };

  const handleSnooze = () => {
    setIsVisible(false);
    setTimeout(onSnooze, 200);
  };

  const handleDismiss = () => {
    setIsVisible(false);
    setTimeout(onDismiss, 200);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Escape for snooze
      if (e.key === 'Escape') {
        handleSnooze();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div
      className={`fixed bottom-4 left-4 right-4 z-50 sm:left-auto sm:right-4 sm:w-full sm:max-w-sm transition-all duration-200 ease-out ${
        isVisible
          ? 'translate-y-0 opacity-100'
          : 'translate-y-4 opacity-0'
      }`}
    >
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-2xl border border-neutral-200 dark:border-neutral-700 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 bg-neutral-50 dark:bg-neutral-800/50 border-b border-neutral-100 dark:border-neutral-800">
          <span className="text-sm">✨</span>
          <button
            onClick={handleDismiss}
            className="p-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 rounded transition-colors"
            title="Dismiss"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          <p className="text-sm text-neutral-800 dark:text-neutral-200 leading-relaxed">
            {question.question}
          </p>

          {/* Context toggle */}
          <button
            onClick={() => setShowContext(!showContext)}
            className="mt-3 text-xs text-violet-600 dark:text-violet-400 hover:underline"
          >
            {showContext ? 'Hide context' : 'Why am I being asked this?'}
          </button>

          {showContext && (
            <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400 bg-neutral-50 dark:bg-neutral-800 rounded-lg p-3">
              {question.context}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 bg-neutral-50 dark:bg-neutral-800/30 border-t border-neutral-100 dark:border-neutral-800">
          <button
            onClick={handleUseful}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 hover:bg-violet-200 dark:hover:bg-violet-900/50 transition-colors"
          >
            <span>👍</span>
            <span>Interesting</span>
          </button>
          <button
            onClick={handleSnooze}
            className="text-xs text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
            title="Press Esc"
          >
            Snooze
          </button>
        </div>
      </div>
    </div>
  );
}
