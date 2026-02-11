'use client';

import { useState, useRef, useEffect } from 'react';
import type { TaskNote } from '@/lib/types';

interface TaskNoteMessageProps {
  note: TaskNote;
  isOwnNote: boolean;
  onEdit: (noteId: string, content: string) => void;
  onDelete: (noteId: string) => void;
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const URL_REGEX = /(https?:\/\/[^\s<]+)/g;

function linkifyContent(text: string): React.ReactNode {
  const parts = text.split(URL_REGEX);
  if (parts.length === 1) return text;

  return parts.map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 dark:text-blue-400 hover:underline break-all"
      >
        {part}
      </a>
    ) : (
      part
    )
  );
}

export function TaskNoteMessage({ note, isOwnNote, onEdit, onDelete }: TaskNoteMessageProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(note.content);
  const editRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEditing && editRef.current) {
      const ta = editRef.current;
      ta.focus();
      ta.selectionStart = ta.value.length;
      ta.style.height = 'auto';
      ta.style.height = `${ta.scrollHeight}px`;
    }
  }, [isEditing]);

  const handleSaveEdit = () => {
    const trimmed = editContent.trim();
    if (trimmed && trimmed !== note.content) {
      onEdit(note.id, trimmed);
    }
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditContent(note.content);
    setIsEditing(false);
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSaveEdit();
    }
    if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

  const initials = note.authorName
    ? note.authorName.split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
    : '?';

  return (
    <div className="group relative">
      <div className="rounded-xl px-4 py-3 bg-neutral-100 dark:bg-neutral-800">
        {/* Header */}
        <div className="flex items-center gap-2 mb-1.5">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-600 dark:text-neutral-400">
            {note.authorImage ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={note.authorImage} alt="" className="w-3.5 h-3.5 rounded-full" />
            ) : (
              <div className="w-3.5 h-3.5 rounded-full bg-violet-100 dark:bg-violet-900 flex items-center justify-center">
                <span className="text-violet-600 dark:text-violet-300 font-medium" style={{ fontSize: '7px' }}>
                  {initials}
                </span>
              </div>
            )}
            {note.authorName ?? 'Unknown'}
          </span>
          <span className="text-xs text-neutral-400 dark:text-neutral-500">
            {formatRelativeTime(note.createdAt)}
          </span>
          {note.editedAt && (
            <span className="text-xs text-neutral-400 dark:text-neutral-500 italic">(edited)</span>
          )}

          {/* Action buttons — only for own notes */}
          {isOwnNote && !isEditing && (
            <div className="ml-auto flex items-center gap-1">
              <button
                onClick={() => { setEditContent(note.content); setIsEditing(true); }}
                className="text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
              >
                Edit
              </button>
              <button
                onClick={() => onDelete(note.id)}
                className="p-1 text-neutral-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                title="Delete note"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          )}
        </div>

        {/* Content */}
        {isEditing ? (
          <div>
            <textarea
              ref={editRef}
              value={editContent}
              onChange={(e) => {
                setEditContent(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = `${e.target.scrollHeight}px`;
              }}
              onKeyDown={handleEditKeyDown}
              className="w-full resize-none rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
              rows={1}
            />
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={handleSaveEdit}
                className="px-2.5 py-1 text-xs rounded-md bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:bg-neutral-700 dark:hover:bg-neutral-200 transition-colors"
              >
                Save
              </button>
              <button
                onClick={handleCancelEdit}
                className="px-2.5 py-1 text-xs rounded-md text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
              >
                Cancel
              </button>
              <span className="text-xs text-neutral-400 ml-auto">Enter to save, Esc to cancel</span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-neutral-800 dark:text-neutral-200 whitespace-pre-wrap break-words">
            {linkifyContent(note.content)}
          </p>
        )}

        {/* Attached images */}
        {(note.imageUrls ?? []).length > 0 && (
          <div className={`flex flex-wrap gap-2 ${note.content ? 'mt-2' : ''}`}>
            {note.imageUrls!.map((url, i) => (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                key={url + i}
                src={url}
                alt="Attached image"
                className="max-h-48 rounded-md border border-neutral-200 dark:border-neutral-700 object-contain"
                loading="lazy"
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
