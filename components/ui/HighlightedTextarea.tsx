'use client';

import { forwardRef, useState, useRef, useEffect, type TextareaHTMLAttributes, type ReactNode } from 'react';

// Keyword definitions with their tooltips
const KEYWORD_CONFIG = {
  task: {
    keywords: ['task', 'tasks', 'action item', 'action items', 'todo', 'to-do', 'checklist'],
    tooltip: 'AI will extract action items as tasks',
  },
  property: {
    keywords: ['tag', 'tags', 'property', 'properties', 'categorize', 'category', 'label', 'labels', 'metadata'],
    tooltip: 'AI will add metadata properties to cards',
  },
};

// Build a regex that matches any keyword (case insensitive, word boundaries)
function buildKeywordRegex(): RegExp {
  const allKeywords = Object.values(KEYWORD_CONFIG).flatMap(c => c.keywords);
  // Sort by length descending to match longer phrases first (e.g., "action items" before "action")
  const sorted = allKeywords.sort((a, b) => b.length - a.length);
  // Escape special regex characters and join with |
  const pattern = sorted.map(kw => kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  return new RegExp(`\\b(${pattern})\\b`, 'gi');
}

const KEYWORD_REGEX = buildKeywordRegex();

// Find which tooltip applies to a matched keyword
function getTooltipForKeyword(keyword: string): string {
  const lowerKeyword = keyword.toLowerCase();
  for (const config of Object.values(KEYWORD_CONFIG)) {
    if (config.keywords.includes(lowerKeyword)) {
      return config.tooltip;
    }
  }
  return '';
}

interface HighlightedTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const HighlightedTextarea = forwardRef<HTMLTextAreaElement, HighlightedTextareaProps>(
  ({ className = '', value, onChange, ...props }, ref) => {
    const [localValue, setLocalValue] = useState<string>((value as string) || '');
    const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const backdropRef = useRef<HTMLDivElement>(null);

    // Sync external value changes
    useEffect(() => {
      if (value !== undefined) {
        setLocalValue(value as string);
      }
    }, [value]);

    // Sync scroll position between textarea and backdrop
    const handleScroll = () => {
      if (textareaRef.current && backdropRef.current) {
        backdropRef.current.scrollTop = textareaRef.current.scrollTop;
        backdropRef.current.scrollLeft = textareaRef.current.scrollLeft;
      }
    };

    // Handle input changes
    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setLocalValue(e.target.value);
      onChange?.(e);
    };

    // Parse text and create highlighted segments for backdrop
    const renderHighlightedBackdrop = (): ReactNode[] => {
      const text = localValue;
      const segments: ReactNode[] = [];
      let lastIndex = 0;
      let match: RegExpExecArray | null;

      // Reset regex state
      KEYWORD_REGEX.lastIndex = 0;

      while ((match = KEYWORD_REGEX.exec(text)) !== null) {
        // Add text before the match (visible, normal color)
        if (match.index > lastIndex) {
          segments.push(
            <span key={`text-${lastIndex}`} className="text-neutral-900 dark:text-white">
              {text.slice(lastIndex, match.index)}
            </span>
          );
        }

        // Add the highlighted keyword with background
        const matchedText = match[0];
        segments.push(
          <mark
            key={`keyword-${match.index}`}
            className="text-purple-700 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/40 rounded px-0.5 font-medium"
            data-tooltip={getTooltipForKeyword(matchedText)}
          >
            {matchedText}
          </mark>
        );

        lastIndex = match.index + matchedText.length;
      }

      // Add remaining text (visible, normal color)
      if (lastIndex < text.length) {
        segments.push(
          <span key={`text-${lastIndex}`} className="text-neutral-900 dark:text-white">
            {text.slice(lastIndex)}
          </span>
        );
      }

      // Add a trailing space to ensure proper sizing
      segments.push(<span key="trailing">&nbsp;</span>);

      return segments;
    };

    // Handle mouse events on the backdrop for tooltips
    const handleMouseMove = (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'MARK' && target.dataset.tooltip) {
        const rect = target.getBoundingClientRect();
        const containerRect = containerRef.current?.getBoundingClientRect();
        if (containerRect) {
          setTooltip({
            text: target.dataset.tooltip,
            x: rect.left - containerRect.left + rect.width / 2,
            y: rect.top - containerRect.top - 4,
          });
        }
      } else {
        setTooltip(null);
      }
    };

    // Combine refs
    const setRefs = (element: HTMLTextAreaElement | null) => {
      textareaRef.current = element;
      if (typeof ref === 'function') {
        ref(element);
      } else if (ref) {
        ref.current = element;
      }
    };

    return (
      <div
        ref={containerRef}
        className="relative"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setTooltip(null)}
      >
        {/* Backdrop with highlighted keywords - positioned behind textarea */}
        <div
          ref={backdropRef}
          className={`
            absolute inset-0 w-full rounded-md px-3 py-2 text-sm z-0
            overflow-hidden whitespace-pre-wrap break-words
            pointer-events-none
            text-neutral-900 dark:text-white
          `}
          style={{
            wordBreak: 'break-word',
            fontFamily: 'inherit',
            lineHeight: 'inherit',
          }}
          aria-hidden="true"
        >
          {renderHighlightedBackdrop()}
        </div>

        {/* Actual textarea - transparent so backdrop shows through */}
        <textarea
          ref={setRefs}
          value={localValue}
          onChange={handleChange}
          onScroll={handleScroll}
          className={`
            relative z-10 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm
            placeholder:text-neutral-400 resize-none
            focus:border-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400
            disabled:cursor-not-allowed disabled:opacity-50
            dark:border-neutral-700 dark:placeholder:text-neutral-500
            dark:focus:border-neutral-500 dark:focus:ring-neutral-500
            bg-transparent text-transparent caret-black dark:caret-white
            selection:bg-blue-200 dark:selection:bg-blue-800
            ${className}
          `}
          {...props}
        />

        {/* Tooltip */}
        {tooltip && (
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
    );
  }
);

HighlightedTextarea.displayName = 'HighlightedTextarea';

// Export keyword config for use in other components if needed
export { KEYWORD_CONFIG };
