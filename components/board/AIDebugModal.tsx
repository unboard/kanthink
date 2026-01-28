'use client';

import { useState, useEffect, useCallback } from 'react';
import type { AIDebugInfo } from '@/lib/ai/generateCards';
import { Button } from '@/components/ui';

interface AIDebugModalProps {
  isOpen: boolean;
  onClose: () => void;
  debug: AIDebugInfo | null;
}

interface CollapsibleSectionProps {
  title: string;
  content: string;
  defaultOpen?: boolean;
}

function CollapsibleSection({ title, content, defaultOpen = false }: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="border border-neutral-200 rounded-lg dark:border-neutral-700">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between p-3 text-left hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
      >
        <span className="font-medium text-neutral-900 dark:text-white">{title}</span>
        <svg
          className={`h-5 w-5 text-neutral-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && (
        <div className="border-t border-neutral-200 dark:border-neutral-700">
          <div className="flex justify-end p-2 border-b border-neutral-200 dark:border-neutral-700">
            <Button size="sm" variant="ghost" onClick={handleCopy}>
              {copied ? 'Copied!' : 'Copy'}
            </Button>
          </div>
          <pre className="p-3 text-xs text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap overflow-auto max-h-64 font-mono bg-neutral-50 dark:bg-neutral-800/50">
            {content || '(empty)'}
          </pre>
        </div>
      )}
    </div>
  );
}

export function AIDebugModal({ isOpen, onClose, debug }: AIDebugModalProps) {
  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative z-10 w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-lg bg-white shadow-xl dark:bg-neutral-900">
        <div className="sticky top-0 flex items-center justify-between p-4 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
            AI Debug Log
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <svg className="h-5 w-5 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 space-y-4">
          {debug ? (
            <>
              <p className="text-sm text-neutral-500">
                This shows exactly what was sent to the AI and what it returned.
              </p>
              <CollapsibleSection
                title="System Prompt"
                content={debug.systemPrompt}
              />
              <CollapsibleSection
                title="User Prompt"
                content={debug.userPrompt}
                defaultOpen={true}
              />
              <CollapsibleSection
                title="Raw AI Response"
                content={debug.rawResponse}
              />
            </>
          ) : (
            <p className="text-sm text-neutral-500">
              No debug info available. Generate some cards first.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
