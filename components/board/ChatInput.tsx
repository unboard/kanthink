'use client';

import { useState, useRef, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import type { CardMessageType, ChannelMember } from '@/lib/types';
import { useImageUpload } from '@/lib/hooks/useImageUpload';
import { KanthinkIcon } from '@/components/icons/KanthinkIcon';
import { MentionDropdown } from './MentionDropdown';

// Keyword highlighting for question mode
const KEYWORD_CONFIG = {
  task: {
    keywords: ['task', 'tasks', 'action item', 'action items', 'todo', 'to-do'],
    tooltip: 'Kan can create tasks for you',
  },
  tag: {
    keywords: ['tag', 'tags', 'label', 'labels'],
    tooltip: 'Kan can add or remove tags',
  },
};

function buildKeywordRegex(): RegExp {
  const allKeywords = Object.values(KEYWORD_CONFIG).flatMap(c => c.keywords);
  const sorted = allKeywords.sort((a, b) => b.length - a.length);
  const pattern = sorted.map(kw => kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  return new RegExp(`\\b(${pattern})\\b`, 'gi');
}

const KEYWORD_REGEX = buildKeywordRegex();

function getTooltipForKeyword(keyword: string): string {
  const lowerKeyword = keyword.toLowerCase();
  for (const config of Object.values(KEYWORD_CONFIG)) {
    if (config.keywords.includes(lowerKeyword)) {
      return config.tooltip;
    }
  }
  return '';
}

type InputMode = 'note' | 'question';

const MAX_HEIGHT = 140;

// Hook to handle mobile keyboard visibility
// Returns the keyboard height so parent components can position inputs above it
export function useKeyboardOffset() {
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;

    const viewport = window.visualViewport;

    const handleResize = () => {
      // Always calculate offset when focused OR when there's a meaningful keyboard height
      // This handles cases where resize fires slightly before/after focus
      const offsetFromBottom = window.innerHeight - viewport.height - viewport.offsetTop;
      const offset = Math.max(0, offsetFromBottom);

      // Only update if we're focused OR if we need to reset
      if (isFocused || offset === 0) {
        setKeyboardOffset(offset);
      }
    };

    // Check immediately in case keyboard is already open
    handleResize();

    viewport.addEventListener('resize', handleResize);
    viewport.addEventListener('scroll', handleResize);

    return () => {
      viewport.removeEventListener('resize', handleResize);
      viewport.removeEventListener('scroll', handleResize);
    };
  }, [isFocused]);

  const onFocus = useCallback(() => {
    setIsFocused(true);
    // Re-check keyboard offset on focus
    if (window.visualViewport) {
      const viewport = window.visualViewport;
      const offsetFromBottom = window.innerHeight - viewport.height - viewport.offsetTop;
      setKeyboardOffset(Math.max(0, offsetFromBottom));
    }
  }, []);

  const onBlur = useCallback(() => {
    // Small delay before resetting to handle focus transitions
    setTimeout(() => {
      setIsFocused(false);
      setKeyboardOffset(0);
    }, 100);
  }, []);

  return { keyboardOffset, isFocused, onFocus, onBlur };
}

interface StagedImage {
  url: string;
  isLoading?: boolean;
  file?: File;
}

interface MentionState {
  isActive: boolean;
  query: string;
  startIndex: number; // cursor position of the '@'
}

interface ChatInputProps {
  onSubmit: (content: string, type: CardMessageType, imageUrls?: string[]) => void;
  isLoading?: boolean;
  placeholder?: string;
  cardId?: string;
  members?: ChannelMember[];
  // Optional keyboard handlers from parent - when provided, parent controls keyboard offset
  onKeyboardFocus?: () => void;
  onKeyboardBlur?: () => void;
  // Force question mode and hide the Note/Ask Kan toggle (for dedicated AI chat UIs)
  forceQuestionMode?: boolean;
}

export function ChatInput({ onSubmit, isLoading = false, placeholder, cardId, members = [], onKeyboardFocus, onKeyboardBlur, forceQuestionMode = false }: ChatInputProps) {
  const [mode, setMode] = useState<InputMode>(forceQuestionMode ? 'question' : 'note');
  const [content, setContent] = useState('');
  const [needsScroll, setNeedsScroll] = useState(false);
  const [stagedImages, setStagedImages] = useState<StagedImage[]>([]);
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);
  const [inputActivated, setInputActivated] = useState(false);
  const [mention, setMention] = useState<MentionState>({ isActive: false, query: '', startIndex: 0 });
  const [mentionSelectedIndex, setMentionSelectedIndex] = useState(0);
  const [mentionsMap, setMentionsMap] = useState<Record<string, string>>({}); // name -> userId
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const inputWrapperRef = useRef<HTMLDivElement>(null);

  // Filtered members for mention dropdown
  const filteredMembers = useMemo(() => {
    if (!mention.isActive) return [];
    const q = mention.query.toLowerCase();
    return members.filter((m) =>
      m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q)
    );
  }, [mention.isActive, mention.query, members]);

  // Build regex to detect inserted mentions in content
  const mentionNames = Object.keys(mentionsMap);
  const mentionRegex = useMemo(() => {
    if (mentionNames.length === 0) return null;
    const escaped = mentionNames.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    return new RegExp(`@(${escaped.join('|')})(?=\\s|$)`, 'g');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mentionNames.join(',')]);

  const hasMentions = mentionRegex !== null;
  const showBackdrop = mode === 'question' || hasMentions;

  const { uploadFile, isUploading, error: uploadError, clearError } = useImageUpload({ cardId });
  // Use keyboard offset hook for focus/blur handlers (parent handles positioning)
  const { isFocused, onFocus: hookOnFocus, onBlur: hookOnBlur } = useKeyboardOffset();

  // Reset input activation when card changes (prevents auto-focus on new card)
  useEffect(() => {
    setInputActivated(false);
  }, [cardId]);

  // Use parent's handlers if provided, otherwise use hook's handlers
  const onFocus = onKeyboardFocus ?? hookOnFocus;
  const onBlur = onKeyboardBlur ?? hookOnBlur;

  // Sync scroll between textarea and backdrop (for keyword highlighting)
  const handleScroll = useCallback(() => {
    if (textareaRef.current && backdropRef.current) {
      backdropRef.current.scrollTop = textareaRef.current.scrollTop;
      backdropRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  }, []);

  // Render highlighted backdrop for mentions and/or keywords
  const renderBackdropContent = useCallback((): ReactNode[] => {
    const text = content;
    // Collect all highlight matches
    const matches: Array<{ start: number; end: number; type: 'mention' | 'keyword'; text: string }> = [];

    // Mention matches
    if (mentionRegex) {
      mentionRegex.lastIndex = 0;
      let m;
      while ((m = mentionRegex.exec(text)) !== null) {
        matches.push({ start: m.index, end: m.index + m[0].length, type: 'mention', text: m[0] });
      }
    }

    // Keyword matches (question mode only)
    if (mode === 'question') {
      KEYWORD_REGEX.lastIndex = 0;
      let m;
      while ((m = KEYWORD_REGEX.exec(text)) !== null) {
        // Skip if overlapping with a mention
        const overlaps = matches.some(
          (existing) => m!.index < existing.end && m!.index + m![0].length > existing.start
        );
        if (!overlaps) {
          matches.push({ start: m.index, end: m.index + m[0].length, type: 'keyword', text: m[0] });
        }
      }
    }

    matches.sort((a, b) => a.start - b.start);

    const segments: ReactNode[] = [];
    let lastIndex = 0;

    for (const match of matches) {
      if (match.start > lastIndex) {
        segments.push(
          <span key={`text-${lastIndex}`} className="text-neutral-900 dark:text-white">
            {text.slice(lastIndex, match.start)}
          </span>
        );
      }

      if (match.type === 'mention') {
        segments.push(
          <span key={`mention-${match.start}`} className="text-violet-500 dark:text-violet-400 font-medium">
            {match.text}
          </span>
        );
      } else {
        segments.push(
          <mark
            key={`keyword-${match.start}`}
            className="text-violet-700 dark:text-violet-400 bg-violet-100 dark:bg-violet-900/40 rounded-sm"
            data-tooltip={getTooltipForKeyword(match.text)}
          >
            {match.text}
          </mark>
        );
      }

      lastIndex = match.end;
    }

    if (lastIndex < text.length) {
      segments.push(
        <span key={`text-${lastIndex}`} className="text-neutral-900 dark:text-white">
          {text.slice(lastIndex)}
        </span>
      );
    }

    segments.push(<span key="trailing">&nbsp;</span>);
    return segments;
  }, [content, mode, mentionRegex]);

  // Handle mouse events on backdrop for tooltips
  const handleBackdropMouseMove = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'MARK' && target.dataset.tooltip) {
      const rect = target.getBoundingClientRect();
      const wrapperRect = inputWrapperRef.current?.getBoundingClientRect();
      if (wrapperRect) {
        setTooltip({
          text: target.dataset.tooltip,
          x: rect.left - wrapperRect.left + rect.width / 2,
          y: rect.top - wrapperRect.top - 4,
        });
      }
    } else {
      setTooltip(null);
    }
  }, []);

  // Auto-resize textarea and track if scrolling is needed
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const scrollHeight = textarea.scrollHeight;
      const shouldScroll = scrollHeight > MAX_HEIGHT;
      setNeedsScroll(shouldScroll);
      textarea.style.height = `${Math.min(scrollHeight, MAX_HEIGHT)}px`;
    }
  }, [content]);

  const handleUploadFile = useCallback(async (file: File) => {
    const tempId = URL.createObjectURL(file);
    setStagedImages((prev) => [...prev, { url: tempId, isLoading: true, file }]);

    try {
      const result = await uploadFile(file);
      setStagedImages((prev) =>
        prev.map((img) =>
          img.url === tempId ? { url: result.url } : img
        )
      );
    } catch {
      // Remove failed upload from staged
      setStagedImages((prev) => prev.filter((img) => img.url !== tempId));
    }
  }, [uploadFile]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          handleUploadFile(file);
        }
      }
    }
  }, [handleUploadFile]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const imageFiles = Array.from(files).filter((f) => f.type.startsWith('image/')).slice(0, 5);
    for (const file of imageFiles) {
      handleUploadFile(file);
    }

    // Reset input so the same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [handleUploadFile]);

  const removeStagedImage = useCallback((url: string) => {
    setStagedImages((prev) => prev.filter((img) => img.url !== url));
  }, []);

  const hasContent = content.trim().length > 0;
  const hasImages = stagedImages.some((img) => !img.isLoading);
  const canSubmit = (hasContent || hasImages) && !isLoading;

  const handleSubmit = () => {
    if (!canSubmit) return;

    const imageUrls = stagedImages
      .filter((img) => !img.isLoading)
      .map((img) => img.url);

    // Convert @Name mentions to @[Name](userId) format for storage
    let finalContent = content.trim();
    for (const [name, userId] of Object.entries(mentionsMap)) {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      finalContent = finalContent.replace(
        new RegExp(`@${escaped}(?=\\s|$)`, 'g'),
        `@[${name}](${userId})`
      );
    }

    onSubmit(
      finalContent,
      mode,
      imageUrls.length > 0 ? imageUrls : undefined
    );
    setContent('');
    setMentionsMap({});
    setStagedImages([]);
    setNeedsScroll(false);
    clearError();

    // Reset height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleMentionSelect = useCallback((member: ChannelMember) => {
    const before = content.slice(0, mention.startIndex);
    const after = content.slice(mention.startIndex + 1 + mention.query.length); // +1 for @
    const insert = `@${member.name} `;
    const newContent = before + insert + after;
    setContent(newContent);
    setMentionsMap((prev) => ({ ...prev, [member.name]: member.id }));
    setMention({ isActive: false, query: '', startIndex: 0 });

    // Reposition cursor after the inserted mention
    const newCursorPos = before.length + insert.length;
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.selectionStart = newCursorPos;
        textareaRef.current.selectionEnd = newCursorPos;
        textareaRef.current.focus();
      }
    });
  }, [content, mention.startIndex, mention.query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Intercept keys when mention dropdown is active
    if (mention.isActive && filteredMembers.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionSelectedIndex((prev) => (prev + 1) % filteredMembers.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionSelectedIndex((prev) => (prev - 1 + filteredMembers.length) % filteredMembers.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        handleMentionSelect(filteredMembers[mentionSelectedIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMention({ isActive: false, query: '', startIndex: 0 });
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const defaultPlaceholder = mode === 'note'
    ? 'Add a note...'
    : 'Ask Kan a question...';

  // Note: Keyboard positioning is now handled by the parent component (CardChat)
  // which adjusts the `bottom` position of the input wrapper

  return (
    <div
      ref={containerRef}
      className={`px-3 pt-2 ${isFocused ? 'pb-1 relative z-50 bg-white dark:bg-neutral-900' : 'pb-3'}`}
    >
      <div className="relative rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2.5">
        {/* @mention dropdown */}
        {mention.isActive && filteredMembers.length > 0 && (
          <MentionDropdown
            members={members}
            query={mention.query}
            selectedIndex={mentionSelectedIndex}
            onSelect={handleMentionSelect}
            onClose={() => setMention({ isActive: false, query: '', startIndex: 0 })}
          />
        )}
        {/* Staged images preview */}
        {stagedImages.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {stagedImages.map((img, i) => (
              <div key={img.url + i} className="relative group w-16 h-16 rounded-md overflow-hidden border border-neutral-200 dark:border-neutral-700">
                {img.isLoading ? (
                  <div className="w-full h-full flex items-center justify-center bg-neutral-100 dark:bg-neutral-800">
                    <svg className="w-5 h-5 animate-spin text-neutral-400" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  </div>
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={img.url}
                    alt="Staged upload"
                    className="w-full h-full object-cover"
                  />
                )}
                {!img.isLoading && (
                  <button
                    onClick={() => removeStagedImage(img.url)}
                    className="absolute top-0.5 right-0.5 w-4 h-4 bg-black/60 rounded-full flex items-center justify-center opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                  >
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Upload error */}
        {uploadError && (
          <div className="mb-2 text-xs text-red-500 flex items-center gap-1">
            <span>{uploadError}</span>
            <button onClick={clearError} className="underline">Dismiss</button>
          </div>
        )}

        {/* Input row: attach + textarea + send button */}
        <div className="flex items-start gap-1">
          {/* Attach button - height matches single-line textarea */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading || isUploading}
            className="flex-shrink-0 h-[26px] w-7 flex items-center justify-center rounded-md text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors disabled:opacity-50"
            title="Attach image"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            multiple
            className="hidden"
            onChange={handleFileSelect}
          />

          {/* Textarea with keyword/mention highlighting */}
          <div
            ref={inputWrapperRef}
            className="relative flex-1 min-w-0"
            onMouseMove={mode === 'question' ? handleBackdropMouseMove : undefined}
            onMouseLeave={() => setTooltip(null)}
          >
            {/* Backdrop for mention + keyword highlighting */}
            {showBackdrop && (
              <div
                ref={backdropRef}
                className="absolute inset-0 px-1 text-sm leading-[26px] whitespace-pre-wrap break-words pointer-events-none overflow-hidden font-[inherit]"
                style={{ wordBreak: 'break-word', letterSpacing: 'inherit' }}
                aria-hidden="true"
              >
                {renderBackdropContent()}
              </div>
            )}

            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => {
                const val = e.target.value;
                setContent(val);

                // Detect @mention
                if (members.length > 0) {
                  const cursorPos = e.target.selectionStart;
                  const textBeforeCursor = val.slice(0, cursorPos);
                  // Find last @ that's preceded by whitespace or at start
                  const atMatch = textBeforeCursor.match(/(?:^|[\s])@([^\s@]*)$/);
                  if (atMatch) {
                    const query = atMatch[1];
                    const startIndex = cursorPos - query.length - 1; // position of @
                    setMention({ isActive: true, query, startIndex });
                    setMentionSelectedIndex(0);
                  } else {
                    setMention((prev) => prev.isActive ? { isActive: false, query: '', startIndex: 0 } : prev);
                  }
                }
              }}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              onFocus={(e) => {
                if (!inputActivated) {
                  // Prevent focus if not activated - blur immediately
                  e.target.blur();
                  return;
                }
                onFocus();
              }}
              onBlur={onBlur}
              onScroll={handleScroll}
              onClick={() => {
                if (!inputActivated) {
                  setInputActivated(true);
                  // Focus after activation
                  setTimeout(() => {
                    textareaRef.current?.focus();
                  }, 50);
                }
              }}
              readOnly={!inputActivated}
              placeholder={placeholder ?? defaultPlaceholder}
              disabled={isLoading}
              rows={1}
              className={`chat-textarea w-full resize-none px-1 text-sm leading-[26px] placeholder-neutral-400 focus:outline-none whitespace-pre-wrap break-words font-[inherit] ${
                needsScroll ? 'overflow-y-auto' : 'overflow-y-hidden'
              } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''} ${
                showBackdrop
                  ? 'bg-transparent text-transparent caret-neutral-900 dark:caret-white selection:bg-violet-500/30'
                  : 'bg-transparent text-neutral-900 dark:text-white'
              } ${!inputActivated ? 'cursor-pointer' : ''}`}
              style={{ wordBreak: 'break-word', letterSpacing: 'inherit' }}
            />

            {/* Tooltip for keywords */}
            {tooltip && showBackdrop && (
              <div
                className="absolute z-50 px-2 py-1 text-xs text-white bg-neutral-800 dark:bg-neutral-700 rounded shadow-lg whitespace-nowrap pointer-events-none"
                style={{
                  left: tooltip.x,
                  top: tooltip.y,
                  transform: 'translate(-50%, -100%)',
                }}
              >
                {tooltip.text}
                <div className="absolute left-1/2 -translate-x-1/2 top-full border-4 border-transparent border-t-neutral-800 dark:border-t-neutral-700" />
              </div>
            )}
          </div>

          {/* Send button - height matches single-line textarea */}
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={`flex-shrink-0 h-[26px] w-7 flex items-center justify-center rounded-md transition-colors ${
              canSubmit
                ? mode === 'question'
                  ? 'text-violet-500 hover:text-violet-600'
                  : 'text-neutral-900 dark:text-white hover:text-neutral-600 dark:hover:text-neutral-300'
                : 'text-neutral-300 dark:text-neutral-600 cursor-not-allowed'
            }`}
            title={`Send ${mode === 'question' ? 'question' : 'note'} (Cmd+Enter)`}
          >
            {isLoading ? (
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            )}
          </button>
        </div>

        {/* Mode toggle at bottom — hidden when forceQuestionMode */}
        {!forceQuestionMode && (
          <div className="flex items-center mt-1.5 ml-8">
            <div className="inline-flex items-center gap-1 rounded-md p-0.5">
              <button
                data-mode="note"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setMode('note');
                  // Activate input when mode is clicked
                  if (!inputActivated) {
                    setInputActivated(true);
                    setTimeout(() => textareaRef.current?.focus(), 50);
                  }
                }}
                disabled={isLoading}
                className={`px-2 py-0.5 text-xs rounded transition-colors ${
                  mode === 'note'
                    ? 'bg-neutral-100 dark:bg-neutral-700 text-neutral-900 dark:text-white'
                    : 'text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300'
                } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                Note
              </button>
              <button
                data-mode="question"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setMode('question');
                  // Activate input when mode is clicked
                  if (!inputActivated) {
                    setInputActivated(true);
                    setTimeout(() => textareaRef.current?.focus(), 50);
                  }
                }}
                disabled={isLoading}
                className={`px-2 py-0.5 text-xs rounded transition-colors flex items-center gap-1 ${
                  mode === 'question'
                    ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300'
                    : 'text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300'
                } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <KanthinkIcon size={12} />
                Ask Kan
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
