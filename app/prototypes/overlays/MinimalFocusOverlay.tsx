'use client';

import { useState, useEffect, useRef } from 'react';

interface MinimalFocusOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string) => void;
}

export function MinimalFocusOverlay({ isOpen, onClose, onCreate }: MinimalFocusOverlayProps) {
  const [name, setName] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [description, setDescription] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setName('');
      setDescription('');
      setShowAdvanced(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onCreate(name.trim());
      setName('');
      setDescription('');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop with blur */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-md mx-4">
        <form onSubmit={handleSubmit}>
          {/* Main input - large and prominent */}
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="What should we call this channel?"
              className="w-full px-6 py-5 text-lg bg-white dark:bg-neutral-900 rounded-2xl border-2 border-transparent focus:border-violet-500 dark:focus:border-violet-400 text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none shadow-2xl transition-all"
              autoComplete="off"
            />

            {/* Subtle hint */}
            <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-neutral-400">
              <kbd className="px-1.5 py-0.5 bg-neutral-100 dark:bg-neutral-800 rounded">Enter</kbd>
            </div>
          </div>

          {/* Progressive disclosure - description */}
          <div
            className={`overflow-hidden transition-all duration-300 ease-out ${
              showAdvanced ? 'max-h-40 opacity-100 mt-3' : 'max-h-0 opacity-0'
            }`}
          >
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add a description (optional)"
              rows={3}
              className="w-full px-4 py-3 bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:border-violet-500 dark:focus:border-violet-400 resize-none text-sm shadow-lg transition-colors"
            />
          </div>

          {/* Footer */}
          <div className="mt-4 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors flex items-center gap-1"
            >
              <svg
                className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
              {showAdvanced ? 'Less options' : 'More options'}
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!name.trim()}
                className="px-5 py-2 text-sm font-medium text-white bg-violet-600 hover:bg-violet-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-md hover:shadow-lg"
              >
                Create
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
