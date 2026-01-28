'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import type { CardMessageType } from '@/lib/types';
import { useImageUpload } from '@/lib/hooks/useImageUpload';
import { KanthinkIcon } from '@/components/icons/KanthinkIcon';

type InputMode = 'note' | 'question';

const MAX_HEIGHT = 140;

// Hook to handle mobile keyboard visibility
function useKeyboardOffset() {
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;

    const viewport = window.visualViewport;

    const handleResize = () => {
      if (!isFocused) return;
      // Calculate how much the viewport has shrunk (keyboard height)
      const offsetFromBottom = window.innerHeight - viewport.height - viewport.offsetTop;
      setKeyboardOffset(Math.max(0, offsetFromBottom));
    };

    viewport.addEventListener('resize', handleResize);
    viewport.addEventListener('scroll', handleResize);

    return () => {
      viewport.removeEventListener('resize', handleResize);
      viewport.removeEventListener('scroll', handleResize);
    };
  }, [isFocused]);

  const onFocus = useCallback(() => setIsFocused(true), []);
  const onBlur = useCallback(() => {
    setIsFocused(false);
    setKeyboardOffset(0);
  }, []);

  return { keyboardOffset, isFocused, onFocus, onBlur };
}

interface StagedImage {
  url: string;
  isLoading?: boolean;
  file?: File;
}

interface ChatInputProps {
  onSubmit: (content: string, type: CardMessageType, imageUrls?: string[]) => void;
  isLoading?: boolean;
  placeholder?: string;
  cardId?: string;
}

export function ChatInput({ onSubmit, isLoading = false, placeholder, cardId }: ChatInputProps) {
  const [mode, setMode] = useState<InputMode>('note');
  const [content, setContent] = useState('');
  const [needsScroll, setNeedsScroll] = useState(false);
  const [stagedImages, setStagedImages] = useState<StagedImage[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { uploadFile, isUploading, error: uploadError, clearError } = useImageUpload({ cardId });
  const { keyboardOffset, isFocused, onFocus, onBlur } = useKeyboardOffset();

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

    onSubmit(
      content.trim(),
      mode,
      imageUrls.length > 0 ? imageUrls : undefined
    );
    setContent('');
    setStagedImages([]);
    setNeedsScroll(false);
    clearError();

    // Reset height
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

  const defaultPlaceholder = mode === 'note'
    ? 'Add a note...'
    : 'Ask Kan a question...';

  // On mobile, when keyboard is visible, apply offset to keep input above it
  const mobileKeyboardStyle = keyboardOffset > 0 ? {
    transform: `translateY(-${keyboardOffset}px)`,
    transition: 'transform 0.1s ease-out',
  } : undefined;

  return (
    <div
      ref={containerRef}
      className={`px-3 pb-3 pt-2 ${isFocused ? 'relative z-50 bg-white dark:bg-neutral-900' : ''}`}
      style={mobileKeyboardStyle}
    >
      <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2.5">
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
        <div className="flex items-end gap-1">
          {/* Attach button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading || isUploading}
            className="flex-shrink-0 p-1.5 rounded-md text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors disabled:opacity-50"
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

          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onFocus={onFocus}
            onBlur={onBlur}
            placeholder={placeholder ?? defaultPlaceholder}
            disabled={isLoading}
            rows={1}
            className={`chat-textarea flex-1 min-w-0 resize-none bg-transparent px-1 py-1 text-sm text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none ${
              needsScroll ? 'overflow-y-auto' : 'overflow-y-hidden'
            } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
          />

          {/* Send button */}
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={`flex-shrink-0 p-1.5 rounded-md transition-colors ${
              canSubmit
                ? mode === 'question'
                  ? 'text-violet-500 hover:text-violet-600'
                  : 'text-neutral-900 dark:text-white hover:text-neutral-600 dark:hover:text-neutral-300'
                : 'text-neutral-300 dark:text-neutral-600 cursor-not-allowed'
            }`}
            title={`Send ${mode === 'question' ? 'question' : 'note'} (Cmd+Enter)`}
          >
            {isLoading ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            )}
          </button>
        </div>

        {/* Mode toggle at bottom */}
        <div className="flex items-center mt-1.5 ml-8">
          <div className="inline-flex items-center gap-1 rounded-md p-0.5">
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setMode('note')}
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
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setMode('question')}
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
      </div>
    </div>
  );
}
