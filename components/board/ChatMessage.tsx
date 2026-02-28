'use client';

import { useState, useRef, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import type { Session } from 'next-auth';
import type { CardMessage, StoredAction, TagDefinition, TaskStatus } from '@/lib/types';
import { useStore } from '@/lib/store';
import { KanthinkIcon } from '@/components/icons/KanthinkIcon';
import { SmartSnippet } from './SmartSnippet';
import { TaskCheckbox } from './TaskCheckbox';
import { ImageTheater } from '@/components/ui/ImageTheater';

interface ChatMessageProps {
  message: CardMessage;
  onDelete?: () => void;
  onEdit?: (content: string) => void;
  // Smart snippet props (optional for backwards compatibility)
  tagDefinitions?: TagDefinition[];
  cardTags?: string[];
  onActionApprove?: (messageId: string, actionId: string, editedData?: StoredAction['data']) => void;
  onActionReject?: (messageId: string, actionId: string) => void;
  onApproveAll?: (messageId: string) => void;
  onRejectAll?: (messageId: string) => void;
  // Custom action renderer for channel-level actions
  renderAction?: (action: StoredAction) => React.ReactNode;
  // Navigation callbacks for kanthink:// links
  onOpenCard?: (cardId: string) => void;
  onOpenTask?: (taskId: string) => void;
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

// Allow kanthink:// protocol in sanitized markdown links
const sanitizeSchema = {
  ...defaultSchema,
  protocols: {
    ...defaultSchema.protocols,
    href: [...(defaultSchema.protocols?.href ?? []), 'kanthink'],
  },
};

// Regex to match @[Name](userId) mention format
const MENTION_REGEX = /@\[([^\]]+)\]\(([^)]+)\)/g;

/** Strip mention markup to plain @Name (for previews, etc.) */
export function stripMentionMarkup(text: string): string {
  return text.replace(MENTION_REGEX, '@$1');
}

/** Parse a kanthink:// URL, returning { type, id } or null */
function parseKanthinkUrl(href: string | undefined): { type: 'card' | 'task'; id: string } | null {
  if (!href) return null;
  const match = href.match(/^kanthink:\/\/(card|task)\/(.+)$/);
  if (!match) return null;
  return { type: match[1] as 'card' | 'task', id: match[2] };
}

/** Inline link for kanthink:// card/task references */
function KanthinkLink({
  href,
  children,
  onOpenCard,
  onOpenTask,
}: {
  href?: string;
  children: React.ReactNode;
  onOpenCard?: (cardId: string) => void;
  onOpenTask?: (taskId: string) => void;
}) {
  const parsed = parseKanthinkUrl(href);
  const tasks = useStore((s) => s.tasks);
  const toggleTaskStatus = useStore((s) => s.toggleTaskStatus);

  if (!parsed) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">
        {children}
      </a>
    );
  }

  if (parsed.type === 'task') {
    const task = tasks[parsed.id];
    const status: TaskStatus = task?.status ?? 'not_started';
    return (
      <span className="inline-flex items-center gap-1.5 align-middle">
        <TaskCheckbox
          status={status}
          onToggle={() => toggleTaskStatus(parsed.id)}
          size="sm"
        />
        <button
          onClick={() => onOpenTask?.(parsed.id)}
          className="text-violet-600 dark:text-violet-400 hover:underline font-medium cursor-pointer"
        >
          {children}
        </button>
      </span>
    );
  }

  // Card link
  return (
    <button
      onClick={() => onOpenCard?.(parsed.id)}
      className="inline-flex items-center gap-1 text-violet-600 dark:text-violet-400 hover:underline font-medium cursor-pointer align-middle"
    >
      <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      {children}
    </button>
  );
}

interface LinkHandlers {
  onOpenCard?: (cardId: string) => void;
  onOpenTask?: (taskId: string) => void;
}

/** Build the ReactMarkdown `components` prop with kanthink link support */
function buildMarkdownComponents(linkHandlers?: LinkHandlers, unwrapP?: boolean) {
  const components: Record<string, React.ComponentType<Record<string, unknown>>> = {};

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  components.a = ({ href, children }: any) => (
    <KanthinkLink href={href} onOpenCard={linkHandlers?.onOpenCard} onOpenTask={linkHandlers?.onOpenTask}>
      {children}
    </KanthinkLink>
  );

  if (unwrapP) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    components.p = ({ children }: any) => <>{children}</>;
  }

  return components;
}

/** Render message content with mentions as styled spans, rest through ReactMarkdown */
function renderContentWithMentions(content: string, linkHandlers?: LinkHandlers) {
  // Split content by mention patterns
  const parts: Array<{ type: 'text' | 'mention'; value: string; name?: string }> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  MENTION_REGEX.lastIndex = 0;
  while ((match = MENTION_REGEX.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', value: content.slice(lastIndex, match.index) });
    }
    parts.push({ type: 'mention', value: match[0], name: match[1] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    parts.push({ type: 'text', value: content.slice(lastIndex) });
  }

  // If no mentions, render everything through ReactMarkdown
  if (parts.every((p) => p.type === 'text')) {
    return (
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]}
        components={buildMarkdownComponents(linkHandlers)}
      >
        {content}
      </ReactMarkdown>
    );
  }

  // Render mixed content: markdown segments + mention spans
  return (
    <>
      {parts.map((part, i) => {
        if (part.type === 'mention') {
          return (
            <span
              key={i}
              className="inline-flex items-center px-1 py-0.5 rounded bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 text-xs font-medium"
            >
              @{part.name}
            </span>
          );
        }
        return (
          <ReactMarkdown
            key={i}
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]}
            components={buildMarkdownComponents(linkHandlers, true)}
          >
            {part.value}
          </ReactMarkdown>
        );
      })}
    </>
  );
}

function UserMessageHeader({ message, session }: { message: CardMessage; session: Session | null }) {
  const isCurrentUser = message.authorId ? message.authorId === session?.user?.id : true;
  const avatarUrl = message.authorImage ?? (isCurrentUser ? session?.user?.image : null);
  const displayName = isCurrentUser ? 'You' : (message.authorName ?? 'Unknown');
  const initials = message.authorName?.[0] ?? session?.user?.name?.[0] ?? session?.user?.email?.[0] ?? '?';

  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-600 dark:text-neutral-400">
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt="" className="w-3.5 h-3.5 rounded-full" />
      ) : (
        <div className="w-3.5 h-3.5 rounded-full bg-violet-100 dark:bg-violet-900 flex items-center justify-center">
          <span className="text-violet-600 dark:text-violet-300 font-medium" style={{ fontSize: '7px' }}>
            {initials}
          </span>
        </div>
      )}
      {displayName}
    </span>
  );
}

export function ChatMessage({
  message,
  onDelete,
  onEdit,
  tagDefinitions = [],
  cardTags = [],
  onActionApprove,
  onActionReject,
  onApproveAll,
  onRejectAll,
  renderAction,
  onOpenCard,
  onOpenTask,
}: ChatMessageProps) {
  const isAI = message.type === 'ai_response';
  const isQuestion = message.type === 'question';
  const isNote = message.type === 'note';
  const isUserMessage = isQuestion || isNote;
  const canEdit = isNote && !!onEdit;

  const { data: session } = useSession();
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [theaterIndex, setTheaterIndex] = useState<number | null>(null);
  const editRef = useRef<HTMLTextAreaElement>(null);

  const imageUrls = message.imageUrls || [];

  // Check if there are any smart snippets to render
  const hasSmartSnippets = isAI && message.proposedActions && message.proposedActions.length > 0;

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
            ? 'bg-neutral-50 dark:bg-neutral-800/50'
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
          {isUserMessage && <UserMessageHeader message={message} session={session} />}
          <span className="text-xs text-neutral-400 dark:text-neutral-500">
            {formatDate(message.createdAt)} at {formatTime(message.createdAt)}
          </span>

          {/* Action buttons - always visible on mobile, hover-reveal on desktop */}
          <div className="ml-auto flex items-center gap-0.5">
            {/* Edit button */}
            {canEdit && !isEditing && (
              <button
                onClick={() => { setEditContent(message.content); setIsEditing(true); }}
                className="p-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
                title="Edit message"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
            )}
            {/* Delete button */}
            {onDelete && !isEditing && (
              <button
                onClick={onDelete}
                className="p-1 text-neutral-400 hover:text-red-500 transition-colors"
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
            className="text-sm text-neutral-800 dark:text-neutral-200 prose prose-sm prose-neutral dark:prose-invert max-w-none
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
            prose-pre:bg-neutral-100 dark:prose-pre:bg-neutral-800 prose-pre:text-xs"
            onDoubleClick={canEdit ? () => { setEditContent(message.content); setIsEditing(true); } : undefined}
          >
            {renderContentWithMentions(message.content, { onOpenCard, onOpenTask })}
          </div>
        ) : null}

        {/* Attached images */}
        {imageUrls.length > 0 && (
          <div className={`flex flex-wrap gap-2 ${message.content ? 'mt-2' : ''}`}>
            {imageUrls.map((url, i) => (
              <button
                key={url + i}
                onClick={() => setTheaterIndex(i)}
                className="block rounded-md overflow-hidden border border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600 transition-colors cursor-pointer"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt="Attached image"
                  className="max-h-48 object-contain"
                  loading="lazy"
                />
              </button>
            ))}
          </div>
        )}

        {/* Image Theater */}
        <ImageTheater
          images={imageUrls}
          currentIndex={theaterIndex ?? 0}
          isOpen={theaterIndex !== null}
          onClose={() => setTheaterIndex(null)}
          onNavigate={setTheaterIndex}
        />

        {/* Smart Snippets section */}
        {hasSmartSnippets && onActionApprove && onActionReject && (() => {
          const pendingActions = message.proposedActions!.filter(a => a.status === 'pending');
          const hasPending = pendingActions.length > 0;
          const hasMultiplePending = pendingActions.length > 1;

          return (
            <div className="mt-3 pt-3 border-t border-neutral-200 dark:border-neutral-700">
              {/* Header */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-xs font-medium text-neutral-500 dark:text-neutral-400">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  Kan suggests
                </div>
              </div>

              {/* Action items */}
              <div className="space-y-2">
                {message.proposedActions!.map((action) => (
                  renderAction ? renderAction(action) : (
                    <SmartSnippet
                      key={action.id}
                      action={action}
                      tagDefinitions={tagDefinitions}
                      cardTags={cardTags}
                      onApprove={(actionId, editedData) => onActionApprove(message.id, actionId, editedData)}
                      onReject={(actionId) => onActionReject(message.id, actionId)}
                    />
                  )
                ))}
              </div>

              {/* Bulk action buttons - only show if multiple pending */}
              {hasPending && hasMultiplePending && onApproveAll && onRejectAll && (
                <div className="flex items-center justify-end gap-2 mt-3 pt-2 border-t border-neutral-100 dark:border-neutral-800">
                  <button
                    onClick={() => onRejectAll(message.id)}
                    className="text-xs text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 transition-colors"
                  >
                    Dismiss all
                  </button>
                  <button
                    onClick={() => onApproveAll(message.id)}
                    className="text-xs font-medium text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/30 px-2.5 py-1 rounded-md transition-colors"
                  >
                    Accept all
                  </button>
                </div>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
