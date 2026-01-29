'use client';

import { useRef, useEffect } from 'react';

interface TaskSnippetData {
  title: string;
  description?: string;
}

interface TaskSnippetProps {
  data: TaskSnippetData;
  isEditing: boolean;
  isApproved: boolean;
  isRejected: boolean;
  onDataChange: (data: TaskSnippetData) => void;
}

export function TaskSnippet({
  data,
  isEditing,
  isApproved,
  isRejected,
  onDataChange,
}: TaskSnippetProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  if (isEditing) {
    return (
      <div className="space-y-1.5">
        <input
          ref={inputRef}
          type="text"
          value={data.title}
          onChange={(e) => onDataChange({ ...data, title: e.target.value })}
          className="w-full px-2 py-1 text-sm bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-600 rounded focus:outline-none focus:ring-1 focus:ring-violet-500"
          placeholder="Task title"
        />
        <input
          type="text"
          value={data.description ?? ''}
          onChange={(e) => onDataChange({ ...data, description: e.target.value || undefined })}
          className="w-full px-2 py-1 text-xs bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-600 rounded focus:outline-none focus:ring-1 focus:ring-violet-500"
          placeholder="Description (optional)"
        />
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      <span
        className={`text-sm font-medium ${
          isRejected
            ? 'line-through text-neutral-500 dark:text-neutral-400'
            : isApproved
            ? 'text-green-700 dark:text-green-300'
            : 'text-neutral-800 dark:text-neutral-200'
        }`}
      >
        {data.title}
      </span>
      {data.description && (
        <p className={`text-xs ${isRejected ? 'line-through text-neutral-400' : 'text-neutral-500 dark:text-neutral-400'}`}>
          {data.description}
        </p>
      )}
    </div>
  );
}
