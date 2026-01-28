'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui';

interface ContextViewerProps {
  context: Record<string, unknown>;
  title?: string;
  size?: 'sm' | 'md';
}

export function ContextViewer({ context, title = 'AI Context', size = 'sm' }: ContextViewerProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className={`text-neutral-400 hover:text-violet-500 transition-colors ${
          size === 'sm' ? 'p-1' : 'p-1.5'
        }`}
        title="View AI context"
      >
        <svg
          className={size === 'sm' ? 'w-4 h-4' : 'w-5 h-5'}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
          />
        </svg>
      </button>

      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title={title}>
        <div className="space-y-3">
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            This is the context sent to the AI when you ask questions or run instructions.
          </p>
          <pre className="p-3 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-xs text-neutral-700 dark:text-neutral-300 overflow-auto max-h-96 whitespace-pre-wrap font-mono">
            {JSON.stringify(context, null, 2)}
          </pre>
        </div>
      </Modal>
    </>
  );
}
