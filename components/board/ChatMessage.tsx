'use client';

import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import type { CardMessage } from '@/lib/types';
import { KanthinkIcon } from '@/components/icons/KanthinkIcon';

interface ChatMessageProps {
  message: CardMessage;
  onDelete?: () => void;
  onEdit?: (content: string) => void;
}

function formatTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return 'Today';
  }
  if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  }
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export function ChatMessage({ message, onDelete, onEdit }: ChatMessageProps) {
  const isAI = message.type === 'ai_response';
  const isQuestion = message.type === 'question';
  const isNote = message.type === 'note';
  const canEdit = isNote && !!onEdit;

  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
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
    if (trimmed && trimmed !== message.content) {
      onEdit?.(trimmed);
    }
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditContent(message.content);
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

  return (
    <div className="group relative">
      <div
        className={`rounded-xl px-4 py-3 ${
          isAI
            ? 'bg-neutral-50 dark:bg-neutral-800/50'
            : isQuestion
            ? 'bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800'
            : 'bg-neutral-100 dark:bg-neutral-800'
        }`}
      >
        {/* Header */}
        <div className="flex items-center gap-2 mb-2">
          {isAI && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-600 dark:text-neutral-400">
              <KanthinkIcon size={14} className="text-violet-500 dark:text-violet-400" />
              Kan
            </span>
          )}
          {isQuestion && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Question
            </span>
          )}
          <span className="text-xs text-neutral-400 dark:text-neutral-500">
            {formatDate(message.createdAt)} at {formatTime(message.createdAt)}
          </span>

          {/* Action buttons */}
          <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            {canEdit && !isEditing && (
              <button
                onClick={() => { setEditContent(message.content); setIsEditing(true); }}
                className="p-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
                title="Edit note"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
            )}
            {onDelete && !isEditing && (
              <button
                onClick={onDelete}
                className="p-1 text-neutral-400 hover:text-red-500"
                title="Delete message"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
          </div>
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
        ) : message.content ? (
          <div
            className={`text-sm text-neutral-800 dark:text-neutral-200 prose prose-sm prose-neutral dark:prose-invert max-w-none
            prose-headings:font-semibold prose-headings:text-neutral-900 dark:prose-headings:text-neutral-100
            prose-h1:text-base prose-h1:mt-3 prose-h1:mb-2
            prose-h2:text-sm prose-h2:mt-2.5 prose-h2:mb-1.5
            prose-h3:text-sm prose-h3:mt-2 prose-h3:mb-1
            prose-p:my-1.5 prose-p:leading-relaxed
            prose-ul:my-1.5 prose-ol:my-1.5
            prose-li:my-0.5
            prose-a:text-blue-600 dark:prose-a:text-blue-400 prose-a:no-underline hover:prose-a:underline
            prose-strong:text-neutral-900 dark:prose-strong:text-neutral-100
            prose-code:text-xs prose-code:bg-neutral-100 dark:prose-code:bg-neutral-800 prose-code:px-1 prose-code:py-0.5 prose-code:rounded
            prose-pre:bg-neutral-100 dark:prose-pre:bg-neutral-800 prose-pre:text-xs
          `}
            onDoubleClick={canEdit ? () => { setEditContent(message.content); setIsEditing(true); } : undefined}
          >
            <ReactMarkdown
              components={{
                a: ({ href, children }) => (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    {children}
                  </a>
                ),
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        ) : null}

        {/* Attached images */}
        {message.imageUrls && message.imageUrls.length > 0 && (
          <div className={`flex flex-wrap gap-2 ${message.content ? 'mt-2' : ''}`}>
            {message.imageUrls.map((url, i) => (
              <a
                key={url + i}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-md overflow-hidden border border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600 transition-colors"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt="Attached image"
                  className="max-h-48 object-contain"
                  loading="lazy"
                />
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
