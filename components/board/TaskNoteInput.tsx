'use client';

import { useState, useRef, useEffect } from 'react';

interface TaskNoteInputProps {
  onSubmit: (content: string) => void;
  disabled?: boolean;
}

export function TaskNoteInput({ onSubmit, disabled }: TaskNoteInputProps) {
  const [content, setContent] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const canSubmit = content.trim().length > 0 && !disabled;

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
    }
  }, [content]);

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit(content.trim());
    setContent('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="px-4 pt-2 pb-3">
      <div className="flex items-end gap-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add a note..."
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none bg-transparent text-sm text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none leading-[26px]"
          style={{ wordBreak: 'break-word' }}
        />
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className={`flex-shrink-0 h-[26px] w-7 flex items-center justify-center rounded-md transition-colors ${
            canSubmit
              ? 'text-neutral-900 dark:text-white hover:text-neutral-600 dark:hover:text-neutral-300'
              : 'text-neutral-300 dark:text-neutral-600 cursor-not-allowed'
          }`}
          title="Send note (Enter)"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
